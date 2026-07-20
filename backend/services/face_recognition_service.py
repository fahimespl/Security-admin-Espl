"""
Face Recognition Service — wraps the `face_recognition` library (dlib-based).

Falls back to OpenCV's Haar Cascade if face_recognition/dlib can't be imported
(common on Windows without Build Tools). In fallback mode, detection works but
recognition (matching against enrolled embeddings) always returns "Unknown".
"""


import os
import uuid
import logging
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------- Try importing face_recognition; fall back gracefully ----------
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

# Haar cascade path (bundled with opencv-python)
_CASCADE_PATH = None
if CV2_AVAILABLE:
    _CASCADE_PATH = os.path.join(
        os.path.dirname(cv2.__file__), "data", "haarcascade_frontalface_default.xml"
    )


# =====================================================================
# Public API
# =====================================================================

def compute_embedding(image_bytes: bytes) -> Optional[bytes]:
    """
    Given a JPEG/PNG image as bytes, detect the face and return the 128-d
    embedding serialised as bytes.  Returns None if no face found or if
    face_recognition is unavailable.
    """
    if not FACE_REC_AVAILABLE:
        return None

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    locations = fr.face_locations(rgb, model="hog")
    if not locations:
        return None

    encodings = fr.face_encodings(rgb, known_face_locations=locations)
    if not encodings:
        return None

    # Use the first (largest / most prominent) face
    return encodings[0].tobytes()


def embedding_from_bytes(raw: bytes) -> np.ndarray:
    """Deserialise a stored embedding back to a numpy array."""
    return np.frombuffer(raw, dtype=np.float64)


def recognise_faces(
    frame_bgr: np.ndarray,
    enrolled: List[Tuple[str, np.ndarray]],  # [(staff_name, embedding), ...]
    threshold: float = 75.0,
) -> List[dict]:
    """
    Detect faces in a BGR frame and try to match each against enrolled embeddings.

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
        # Run HOG detection at full resolution — the previous 0.5x downscale
        # caused faces at 640×480 to be only ~40px tall, below HOG's reliable
        # detection threshold. number_of_times_to_upsample=1 helps catch smaller
        # and farther-away faces at the cost of a small speed hit.
        locations = fr.face_locations(rgb, number_of_times_to_upsample=1, model="hog")
        encodings = fr.face_encodings(rgb, known_face_locations=locations)

        for loc, enc in zip(locations, encodings):
            top, right, bottom, left = loc

            best_name = "Unknown"
            best_conf = 0.0

            if enrolled:
                known_encs = [e for _, e in enrolled]
                distances = fr.face_distance(known_encs, enc)
                min_idx = int(np.argmin(distances))
                min_dist = distances[min_idx]
                # Convert distance (0=identical, ~1.0=very different) to 0-100 confidence
                conf = max(0.0, min(100.0, (1.0 - min_dist) * 100.0))
                if conf >= threshold:
                    best_name = enrolled[min_idx][0]
                    best_conf = round(conf, 1)
                else:
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

        for (x, y, bw, bh) in rects:
            boxes.append({
                "id": f"b-{uuid.uuid4().hex[:6]}",
                "name": "Unknown",
                "confidence": 0.0,
                "x": round(x / w, 4),
                "y": round(y / h, 4),
                "w": round(bw / w, 4),
                "h": round(bh / h, 4),
            })

    return boxes
