"""add due_hint to todos

Revision ID: b3c1d2e4f5a6
Revises: fa9a2b67de66
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b3c1d2e4f5a6"
down_revision: Union[str, None] = "fa9a2b67de66"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("todos", sa.Column("due_hint", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("todos", "due_hint")
