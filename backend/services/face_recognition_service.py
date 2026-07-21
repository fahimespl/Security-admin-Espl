"""
Face Recognition Service — wraps the `face_recognition` library (dlib-based).

Improvements over the original:
  1. Image preprocessing (resize, CLAHE exposure normalisation) before embedding
  2. num_jitters=10 for enrollment, 1 for live — stabler embeddings
  3. Multi-embedding support — one staff member can have N stored embeddings
     (embeddings are stored concatenated; each is 128 float64 = 1024 bytes)
  4. CNN model toggle via FACE_MODEL env var (hog | cnn)
  5. Corrected confidence formula:
       conf = max(0, (GOOD_DIST - distance) / GOOD_DIST) * 100
     where GOOD_DIST = 0.6 (dlib's recommended threshold).
     This maps distance=0 → 100%, distance=0.6 → 0%.
  6. Falls back gracefully to OpenCV Haar if dlib is unavailable.
"""

import os
import uuid
import logging
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ── dlib face recognition (preferred) ────────────────────────────────────────
try:
    import face_recognition as fr
    FACE_REC_AVAILABLE = True
    logger.info("face_recognition (dlib) loaded — full recognition enabled.")
except (ImportError, SystemExit):
    FACE_REC_AVAILABLE = False
    logger.warning(
        "face_recognition / dlib not available — falling back to OpenCV Haar Cascade. "
        "Detection will work but recognition will always return 'Unknown'."
    )

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.error("OpenCV (cv2) not available — face detection disabled entirely.")

# ── Configuration ─────────────────────────────────────────────────────────────
# FACE_MODEL=cnn  is more accurate (catches tilted/small faces) but ~4× slower.
# FACE_MODEL=hog  is fast enough for real-time on CPU.
FACE_MODEL = os.getenv("FACE_MODEL", "hog").lower()

# dlib's recommended distance threshold: faces < 0.6 apart are the same person.
# We use this to convert raw distance → 0-100 % confidence.
GOOD_DISTANCE = 0.6

# Embedding byte length for one 128-d float64 vector
EMBEDDING_BYTES = 128 * np.dtype(np.float64).itemsize  # 1024 bytes

# Haar cascade path (bundled with opencv-python)
_CASCADE_PATH = None
if CV2_AVAILABLE:
    _CASCADE_PATH = os.path.join(
        os.path.dirname(cv2.__file__), "data", "haarcascade_frontalface_default.xml"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _preprocess(image_bytes: bytes) -> Optional[np.ndarray]:
    """
    Decode bytes → BGR, then:
      • Resize to max 1000px on the long side (proportional) so face_recognition
        doesn't choke on 4K selfies and HOG scale is sensible.
      • Apply CLAHE on the L channel (LAB colour space) to normalise exposure —
        this greatly helps with dark / overexposed photos.
    Returns BGR ndarray or None if decoding failed.
    """
    if not CV2_AVAILABLE:
        return None
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    # Proportional downscale
    max_side = 1000
    h, w = img.shape[:2]
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    # CLAHE exposure normalisation
    try:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_ch = clahe.apply(l_ch)
        lab = cv2.merge([l_ch, a_ch, b_ch])
        img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    except Exception:
        pass  # If CLAHE fails, use original

    return img


def _dist_to_conf(distance: float) -> float:
    """
    Convert dlib face distance (0 = identical, ~1 = very different) to a
    0–100 confidence score.

    The mapping is:
      distance=0.0 → 100 %
      distance=0.6 → 0 %   (GOOD_DISTANCE — dlib's recommended threshold)
      distance>0.6 → 0 %   (clamped)

    This is more intuitive than the previous linear formula which gave
    distance=0.5 → 50 %, causing real matches to be rejected at the 55 % threshold.
    """
    return max(0.0, (GOOD_DISTANCE - distance) / GOOD_DISTANCE * 100.0)


# ═══════════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════════

def fast_face_present(image_bytes: bytes) -> bool:
    """
    Quick yes/no check: does the image contain at least one detectable face?

    Much faster than compute_embedding() because it:
      - Resizes to a max of 400 px (vs 1000 px)
      - Calls face_locations only (no face_encodings — skips the 128-d embedding step)
      - Uses upsample=1 (vs 2)

    Falls back to OpenCV Haar cascade when dlib is unavailable.
    Returns True if at least one face is found, False otherwise.
    """
    if not CV2_AVAILABLE:
        return False

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return False

    # Small resize — plenty for detection
    max_side = 400
    h, w = img.shape[:2]
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    if FACE_REC_AVAILABLE:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        locs = fr.face_locations(rgb, number_of_times_to_upsample=1, model=FACE_MODEL)
        return len(locs) > 0

    # Haar fallback
    if _CASCADE_PATH and os.path.exists(_CASCADE_PATH):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(_CASCADE_PATH)
        rects = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        return len(rects) > 0

    return False


def compute_embedding(image_bytes: bytes, num_jitters: int = 10) -> Optional[bytes]:
    """
    Given a JPEG/PNG image as bytes, detect the face and return the 128-d
    embedding serialised as bytes.  Returns None if no face found or if
    face_recognition is unavailable.

    num_jitters=10 (default for enrollment) averages 10 slightly perturbed
    versions of the face for a much more stable/robust embedding.
    """
    if not FACE_REC_AVAILABLE:
        return None

    img = _preprocess(image_bytes)
    if img is None:
        return None

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # Use upsample=2 so small faces in a larger image are still detected
    locations = fr.face_locations(rgb, number_of_times_to_upsample=2, model=FACE_MODEL)
    if not locations:
        logger.debug("compute_embedding: no face found in image")
        return None

    encodings = fr.face_encodings(rgb, known_face_locations=locations, num_jitters=num_jitters)
    if not encodings:
        return None

    # Use the first (and ideally only) face — staff enrollment photos should be
    # clear single-face portraits.
    return encodings[0].tobytes()


def compute_embeddings_multi(image_bytes_list: List[bytes], num_jitters: int = 10) -> Optional[bytes]:
    """
    Compute embeddings from multiple photos and concatenate them into a single
    byte string.  Returns None if no valid embedding found in any photo.

    This lets us store N faces per staff member in the existing single column,
    enabling better recognition across different lighting / angle conditions.
    """
    all_bytes: List[bytes] = []
    for img_bytes in image_bytes_list:
        emb = compute_embedding(img_bytes, num_jitters=num_jitters)
        if emb is not None:
            all_bytes.append(emb)

    if not all_bytes:
        return None
    return b"".join(all_bytes)


def embeddings_from_bytes(raw: bytes) -> List[np.ndarray]:
    """
    Deserialise stored embedding bytes back to a list of numpy arrays.
    Handles both old single-embedding and new multi-embedding format transparently.
    """
    if len(raw) < EMBEDDING_BYTES:
        return []
    embeddings = []
    for i in range(0, len(raw), EMBEDDING_BYTES):
        chunk = raw[i : i + EMBEDDING_BYTES]
        if len(chunk) == EMBEDDING_BYTES:
            embeddings.append(np.frombuffer(chunk, dtype=np.float64))
    return embeddings


def embedding_from_bytes(raw: bytes) -> np.ndarray:
    """
    Backward-compatible helper: returns the FIRST embedding from stored bytes.
    Existing callers that pass a single embedding still work fine.
    """
    embs = embeddings_from_bytes(raw)
    if not embs:
        # Legacy path: raw bytes might be a plain float64 array of any length
        return np.frombuffer(raw, dtype=np.float64)
    return embs[0]


def recognise_faces(
    frame_bgr: np.ndarray,
    enrolled: List[Tuple[str, np.ndarray]],  # [(staff_name, single_embedding), ...]
    threshold: float = 55.0,
    enrolled_multi: Optional[List[Tuple[str, List[np.ndarray]]]] = None,
) -> List[dict]:
    """
    Detect faces in a BGR frame and try to match each against enrolled embeddings.

    Supports two calling modes:
      1. Legacy: enrolled=[(name, single_embedding), ...]
      2. Multi:  enrolled_multi=[(name, [emb1, emb2, ...]), ...]

    For each detected face the best (minimum distance) across ALL stored
    embeddings for each person is used.

    Returns a list of dicts matching the BoxSchema shape:
        { id, name, confidence, x, y, w, h }
    Coordinates are normalised 0-1 relative to frame dimensions.
    """
    h, w = frame_bgr.shape[:2]
    if h == 0 or w == 0:
        return []

    boxes: List[dict] = []

    if FACE_REC_AVAILABLE:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        # Live mode: upsample=1 keeps latency low; CNN model catches more angles
        locations = fr.face_locations(rgb, number_of_times_to_upsample=1, model=FACE_MODEL)
        # num_jitters=1 for speed in live loop
        encodings = fr.face_encodings(rgb, known_face_locations=locations, num_jitters=1)

        for loc, enc in zip(locations, encodings):
            top, right, bottom, left = loc

            best_name = "Unknown"
            best_conf = 0.0

            # Build a flat list of (name, embedding) pairs from whichever
            # format the caller provides.
            pairs: List[Tuple[str, np.ndarray]] = []
            if enrolled_multi:
                for name, emb_list in enrolled_multi:
                    for emb in emb_list:
                        pairs.append((name, emb))
            elif enrolled:
                pairs = enrolled

            if pairs:
                known_encs = [e for _, e in pairs]
                distances = fr.face_distance(known_encs, enc)
                min_idx = int(np.argmin(distances))
                min_dist = float(distances[min_idx])
                conf = _dist_to_conf(min_dist)

                if conf >= threshold:
                    best_name = pairs[min_idx][0]
                    best_conf = round(conf, 1)
                else:
                    # Even below threshold, report the score so the UI can show it
                    best_conf = round(conf, 1)

            boxes.append({
                "id": f"b-{uuid.uuid4().hex[:6]}",
                "name": best_name,
                "confidence": best_conf,
                "x": round(left / w, 4),
                "y": round(top / h, 4),
                "w": round((right - left) / w, 4),
                "h": round((bottom - top) / h, 4),
            })

    elif CV2_AVAILABLE and _CASCADE_PATH and os.path.exists(_CASCADE_PATH):
        # Fallback: Haar cascade — detection only, no recognition
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(_CASCADE_PATH)
        rects = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

        for (fx, fy, bw, bh) in rects:
            boxes.append({
                "id": f"b-{uuid.uuid4().hex[:6]}",
                "name": "Unknown",
                "confidence": 0.0,
                "x": round(fx / w, 4),
                "y": round(fy / h, 4),
                "w": round(bw / w, 4),
                "h": round(bh / h, 4),
            })

    return boxes
