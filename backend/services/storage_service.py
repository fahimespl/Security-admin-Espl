"""
Storage Service — abstracts photo storage between local disk and Supabase Storage.

Usage:
    from services.storage_service import upload_photo, delete_photo

    url = await upload_photo(contents, "s-abc12345.jpg")
    await delete_photo(old_url_or_path)

Environment variables (all optional — omitting them uses local-disk fallback):
    SUPABASE_URL          https://your-project-id.supabase.co
    SUPABASE_SERVICE_KEY  service_role key (NOT the anon key)
    SUPABASE_BUCKET       bucket name (default: staff-photos)
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "staff-photos").strip()

# Local fallback directory (used when Supabase env vars are not set)
_LOCAL_STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "storage", "photos"
)
os.makedirs(_LOCAL_STORAGE_DIR, exist_ok=True)

# Lazy-initialised Supabase client
_supabase_client = None


def _supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def _get_client():
    """Return a cached Supabase client, creating it on first call."""
    global _supabase_client
    if _supabase_client is None:
        try:
            from supabase import create_client
            _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            logger.info("Supabase client initialised (bucket: %s)", SUPABASE_BUCKET)
        except Exception as exc:
            logger.error("Failed to initialise Supabase client: %s", exc)
            raise
    return _supabase_client


# ── Public API ────────────────────────────────────────────────────────────────

def upload_photo(contents: bytes, filename: str) -> str:
    """
    Upload a photo and return its publicly accessible URL/path.

    - If Supabase env vars are configured: uploads to Supabase Storage bucket
      and returns the public URL.
    - Otherwise: saves to local disk and returns the relative path
      `/storage/photos/{filename}` (served by FastAPI StaticFiles).
    """
    if _supabase_enabled():
        return _upload_to_supabase(contents, filename)
    else:
        return _save_to_disk(contents, filename)


def delete_photo(url_or_path: Optional[str]) -> None:
    """
    Delete a previously uploaded photo.

    Accepts either a Supabase public URL or a local relative/absolute path.
    Silently ignores None or missing files.
    """
    if not url_or_path:
        return

    if url_or_path.startswith("http"):
        _delete_from_supabase(url_or_path)
    else:
        _delete_from_disk(url_or_path)


# ── Supabase backend ──────────────────────────────────────────────────────────

def _upload_to_supabase(contents: bytes, filename: str) -> str:
    """Upload bytes to Supabase Storage and return the public URL."""
    client = _get_client()
    storage_path = filename  # path inside the bucket

    try:
        # Upsert so re-enrolling the same staff ID replaces the old file
        client.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=contents,
            file_options={
                "content-type": "image/jpeg",
                "upsert": "true",
            },
        )
    except Exception as exc:
        logger.error("Supabase upload failed for %s: %s", filename, exc)
        raise

    # Build the public URL — works for public buckets
    public_url = (
        f"{SUPABASE_URL.rstrip('/')}"
        f"/storage/v1/object/public/{SUPABASE_BUCKET}/{storage_path}"
    )
    logger.info("Uploaded photo to Supabase: %s", public_url)
    return public_url


def _delete_from_supabase(public_url: str) -> None:
    """Delete a file from Supabase Storage using its public URL."""
    # Extract the storage path from the URL:
    # https://xxx.supabase.co/storage/v1/object/public/staff-photos/s-abc.jpg
    #                                                                ^^^^^^^^^^^
    marker = f"/object/public/{SUPABASE_BUCKET}/"
    idx = public_url.find(marker)
    if idx == -1:
        logger.warning("delete_from_supabase: cannot parse path from URL: %s", public_url)
        return

    storage_path = public_url[idx + len(marker):]
    try:
        client = _get_client()
        client.storage.from_(SUPABASE_BUCKET).remove([storage_path])
        logger.info("Deleted photo from Supabase: %s", storage_path)
    except Exception as exc:
        # Non-fatal — log and continue
        logger.warning("Supabase delete failed for %s: %s", storage_path, exc)


# ── Local-disk backend ────────────────────────────────────────────────────────

def _save_to_disk(contents: bytes, filename: str) -> str:
    """Save bytes to local disk and return the relative URL path."""
    file_path = os.path.join(_LOCAL_STORAGE_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(contents)
    logger.info("Saved photo to local disk: %s", file_path)
    # Return relative URL served by FastAPI StaticFiles at /storage
    return f"/storage/photos/{filename}"


def _delete_from_disk(url_or_path: str) -> None:
    """Delete a local photo file given either its relative URL or absolute path."""
    # Handle relative URL like /storage/photos/s-abc.jpg
    if url_or_path.startswith("/storage/photos/"):
        filename = os.path.basename(url_or_path)
        abs_path = os.path.join(_LOCAL_STORAGE_DIR, filename)
    else:
        # Treat as absolute path (legacy format stored before this migration)
        abs_path = url_or_path

    if os.path.exists(abs_path):
        try:
            os.remove(abs_path)
            logger.info("Deleted local photo: %s", abs_path)
        except OSError as exc:
            logger.warning("Could not delete local photo %s: %s", abs_path, exc)
