from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Todo

router = APIRouter()


class TodoUpdate(BaseModel):
    status: str | None = None         # pending | done | skipped
    tags: list[str] | None = None
    title: str | None = None
    description: str | None = None


@router.get("/todos/{clerk_user_id}/{todo_date}")
def get_todos(clerk_user_id: str, todo_date: str, db: Session = Depends(get_db)):
    """Return all todos for a user on a specific date (YYYY-MM-DD), ordered by creation time."""
    todos = (
        db.query(Todo)
        .filter(Todo.user_id == clerk_user_id, Todo.date == todo_date)
        .order_by(Todo.created_at)
        .all()
    )
    return [
        {
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "source_email_id": t.source_email_id,
            "status": t.status,
            "tags": t.tags,
            "due_hint": t.due_hint,
            "carried_from_date": t.carried_from_date.isoformat() if t.carried_from_date else None,
            "carry_count": t.carry_count,
            "created_at": t.created_at.isoformat(),
        }
        for t in todos
    ]


@router.patch("/todos/{todo_id}")
def update_todo(todo_id: str, req: TodoUpdate, db: Session = Depends(get_db)):
    """Update a todo's status, tags, title, or description."""
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    if req.status is not None:
        if req.status not in ("pending", "done", "skipped"):
            raise HTTPException(status_code=400, detail="Invalid status — must be pending, done, or skipped")
        todo.status = req.status
    if req.tags is not None:
        todo.tags = req.tags
    if req.title is not None:
        todo.title = req.title
    if req.description is not None:
        todo.description = req.description

    db.commit()
    return {"status": "ok"}


@router.delete("/todos/{todo_id}")
def delete_todo(todo_id: str, db: Session = Depends(get_db)):
    """Delete a todo permanently."""
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
    return {"status": "ok"}
