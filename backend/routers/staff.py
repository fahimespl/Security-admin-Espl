"""
Staff router — CRUD + face enrollment.

POST   /api/staff            — create staff member with optional photo upload
PATCH  /api/staff/{id}       — update fields and/or replace photo
DELETE /api/staff/{id}       — remove staff member and their stored photo
"""

import os
import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import require_api_key
from models.staff import Staff
from schemas.staff import StaffOut
from services.face_recognition_service import compute_embedding, compute_embeddings_multi
from services.storage_service import upload_photo, delete_photo

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _staff_to_out(s: Staff) -> dict:
    """Convert a Staff ORM row to a dict matching StaffOut / frontend shape."""
    photo_url = None
    if s.photo_path:
        if s.photo_path.startswith("http"):
            # Supabase public URL — return as-is
            photo_url = s.photo_path
        else:
            # Legacy local path or relative URL
            photo_url = f"/storage/photos/{os.path.basename(s.photo_path)}"
    return {
        "id": s.id,
        "name": s.name,
        "role": s.role,
        "enrolledOn": s.enrolled_on,
        "status": s.status,
        "photo": photo_url,
        "hasEmbedding": s.face_embedding is not None,
    }


@router.get("", response_model=List[StaffOut])
def list_staff(db: Session = Depends(get_db)):
    rows = db.query(Staff).order_by(Staff.enrolled_on.desc()).all()
    return [_staff_to_out(r) for r in rows]


@router.post("", response_model=StaffOut, status_code=201, dependencies=[Depends(require_api_key)])
async def create_staff(
    name: str = Form(...),
    role: str = Form(...),
    status: str = Form("Active"),
    photo: UploadFile = File(None),
    photos: List[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    staff_id = f"s-{uuid.uuid4().hex[:8]}"
    photo_path = None
    embedding = None

    # Collect all uploaded files (single `photo` field + optional `photos` list)
    all_files: List[UploadFile] = []
    if photo and photo.filename:
        all_files.append(photo)
    if photos:
        all_files.extend([p for p in photos if p and p.filename])

    all_contents: List[bytes] = []
    primary_contents: Optional[bytes] = None

    for idx, f in enumerate(all_files):
        contents = await f.read()
        all_contents.append(contents)
        if idx == 0:
            primary_contents = contents
            ext = os.path.splitext(f.filename)[1] or ".jpg"
            filename = f"{staff_id}{ext}"
            photo_path = upload_photo(contents, filename)

    if all_contents:
        # compute_embeddings_multi accepts multiple photos and concatenates
        # all valid embeddings for best recognition coverage.
        embedding = compute_embeddings_multi(all_contents, num_jitters=10)

    row = Staff(
        id=staff_id,
        name=name,
        role=role,
        enrolled_on=date.today().isoformat(),
        status=status,
        photo_path=photo_path,
        face_embedding=embedding,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _staff_to_out(row)


@router.patch("/{staff_id}", response_model=StaffOut, dependencies=[Depends(require_api_key)])
async def update_staff(
    staff_id: str,
    name: str = Form(None),
    role: str = Form(None),
    status: str = Form(None),
    photo: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    row = db.query(Staff).filter(Staff.id == staff_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Staff not found")

    if name is not None:
        row.name = name
    if role is not None:
        row.role = role
    if status is not None:
        row.status = status

    if photo and photo.filename:
        # Remove the old photo from storage (Supabase or disk)
        if row.photo_path:
            delete_photo(row.photo_path)

        ext = os.path.splitext(photo.filename)[1] or ".jpg"
        filename = f"{staff_id}{ext}"
        contents = await photo.read()

        # Upload the new photo
        row.photo_path = upload_photo(contents, filename)

        # Re-compute face embedding from the new photo (num_jitters=10 for quality)
        embedding = compute_embeddings_multi([contents], num_jitters=10)
        if embedding is not None:
            row.face_embedding = embedding

    db.commit()
    db.refresh(row)
    return _staff_to_out(row)


@router.delete("/{staff_id}", status_code=204, dependencies=[Depends(require_api_key)])
def delete_staff(staff_id: str, db: Session = Depends(get_db)):
    row = db.query(Staff).filter(Staff.id == staff_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Delete photo from storage (Supabase or local disk)
    if row.photo_path:
        delete_photo(row.photo_path)

    db.delete(row)
    db.commit()


@router.post("/check-face")
async def check_face(photo: UploadFile = File(...)):
    """Dry-run endpoint to verify if a face is detectable in the uploaded photo."""
    try:
        contents = await photo.read()
        # Use num_jitters=1 here — this is a quick UI feedback call, not enrollment
        embedding = compute_embedding(contents, num_jitters=1)
        return {"faceDetected": embedding is not None}
    except Exception:
        return {"faceDetected": False}
