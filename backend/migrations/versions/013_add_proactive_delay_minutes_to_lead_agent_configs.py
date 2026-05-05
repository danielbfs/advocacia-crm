"""Add proactive_delay_minutes to lead_agent_configs

Revision ID: 013
Revises: 012
Create Date: 2026-05-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lead_agent_configs",
        sa.Column("proactive_delay_minutes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("lead_agent_configs", "proactive_delay_minutes", server_default=None)


def downgrade() -> None:
    op.drop_column("lead_agent_configs", "proactive_delay_minutes")

