from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db.database import get_db
from db.models import User, GmailToken

router = APIRouter(prefix="/users")


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class UpsertUserRequest(BaseModel):
    clerk_user_id: str
    email: str


class SaveTokenRequest(BaseModel):
    clerk_user_id: str
    access_token: str
    refresh_token: str | None = None
    expires_at: str | None = None      # ISO datetime string


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/upsert")
def upsert_user(req: UpsertUserRequest, db: Session = Depends(get_db)):
    """
    Create the user row on first sign-in, or do nothing if they already exist.
    Called by the Next.js callback after Gmail OAuth.
    """
    user = db.get(User, req.clerk_user_id)
    if not user:
        user = User(id=req.clerk_user_id, email=req.email)
        db.add(user)
        db.commit()
    return {"ok": True}


@router.post("/gmail-token")
def save_gmail_token(req: SaveTokenRequest, db: Session = Depends(get_db)):
    """
    Save or update the Gmail OAuth tokens for a user.
    Called by the Next.js callback after a successful Gmail OAuth flow.
    """
    user = db.get(User, req.clerk_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found — call /users/upsert first")

    expires_at = datetime.fromisoformat(req.expires_at) if req.expires_at else None

    token = db.query(GmailToken).filter(GmailToken.user_id == req.clerk_user_id).first()
    if token:
        token.access_token = req.access_token
        token.refresh_token = req.refresh_token
        token.expires_at = expires_at
        token.updated_at = datetime.utcnow()
    else:
        token = GmailToken(
            user_id=req.clerk_user_id,
            access_token=req.access_token,
            refresh_token=req.refresh_token,
            expires_at=expires_at,
        )
        db.add(token)

    db.commit()
    return {"ok": True}


@router.get("/gmail-token/{clerk_user_id}", response_model=TokenResponse)
def get_gmail_token(clerk_user_id: str, db: Session = Depends(get_db)):
    """
    Retrieve the Gmail tokens for a user.
    Called by Next.js API routes before proxying requests to the agent.
    """
    token = db.query(GmailToken).filter(GmailToken.user_id == clerk_user_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="No Gmail token found for this user")
    return TokenResponse(access_token=token.access_token, refresh_token=token.refresh_token)


@router.delete("/gmail-token/{clerk_user_id}")
def delete_gmail_token(clerk_user_id: str, db: Session = Depends(get_db)):
    """
    Remove the Gmail token for a user (disconnect Gmail).
    """
    token = db.query(GmailToken).filter(GmailToken.user_id == clerk_user_id).first()
    if token:
        db.delete(token)
        db.commit()
    return {"ok": True}
