"""
Staff router — CRUD + face enrollment.

POST /api/staff accepts multipart form with a face photo.
The face embedding is computed and stored alongside the photo.
"""

import os
import uuid
import shutil
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from models.staff import Staff
from schemas.staff import StaffOut
from services.face_recognition_service import compute_embedding

router = APIRouter(prefix="/api/staff", tags=["staff"])

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage", "photos")
os.makedirs(STORAGE_DIR, exist_ok=True)


def _staff_to_out(s: Staff) -> dict:
    """Convert a Staff ORM row to a dict matching StaffOut / frontend shape."""
    photo_url = None
    if s.photo_path:
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


@router.post("", response_model=StaffOut, status_code=201)
async def create_staff(
    name: str = Form(...),
    role: str = Form(...),
    status: str = Form("Active"),
    photo: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    staff_id = f"s-{uuid.uuid4().hex[:8]}"
    photo_path = None
    embedding = None

    if photo and photo.filename:
        ext = os.path.splitext(photo.filename)[1] or ".jpg"
        filename = f"{staff_id}{ext}"
        file_path = os.path.join(STORAGE_DIR, filename)
        contents = await photo.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        photo_path = file_path

        # Compute face embedding
        embedding = compute_embedding(contents)
        if embedding is None:
            # Photo uploaded but no face detected — still save but warn
            pass

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


@router.patch("/{staff_id}", response_model=StaffOut)
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
        # Delete old photo if one exists
        if row.photo_path and os.path.exists(row.photo_path):
            try:
                os.remove(row.photo_path)
            except OSError:
                pass

        ext = os.path.splitext(photo.filename)[1] or ".jpg"
        filename = f"{staff_id}{ext}"
        file_path = os.path.join(STORAGE_DIR, filename)
        contents = await photo.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        row.photo_path = file_path

        # Re-compute face embedding from the new photo
        embedding = compute_embedding(contents)
        if embedding is not None:
            row.face_embedding = embedding

    db.commit()
    db.refresh(row)
    return _staff_to_out(row)


@router.delete("/{staff_id}", status_code=204)
def delete_staff(staff_id: str, db: Session = Depends(get_db)):
    row = db.query(Staff).filter(Staff.id == staff_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Delete photo file if it exists
    if row.photo_path and os.path.exists(row.photo_path):
        os.remove(row.photo_path)

    db.delete(row)
    db.commit()
