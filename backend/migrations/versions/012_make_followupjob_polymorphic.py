"""Make FollowupJob polymorphic

Revision ID: 012
Revises: 011
Create Date: 2026-04-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Alterar colunas existentes para nullable=True
    op.alter_column('followup_jobs', 'appointment_id',
               existing_type=postgresql.UUID(as_uuid=True),
               nullable=True)
    op.alter_column('followup_jobs', 'patient_id',
               existing_type=postgresql.UUID(as_uuid=True),
               nullable=True)

    # 2. Adicionar coluna lead_id
    op.add_column('followup_jobs', sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_followup_jobs_lead_id_leads', 'followup_jobs', 'leads', ['lead_id'], ['id'])


def downgrade() -> None:
    # Reverter lead_id
    op.drop_constraint('fk_followup_jobs_lead_id_leads', 'followup_jobs', type_='foreignkey')
    op.drop_column('followup_jobs', 'lead_id')

    # Reverter nullable=True (Aviso: isso pode falhar se houver registros com NULL)
    op.alter_column('followup_jobs', 'patient_id',
               existing_type=postgresql.UUID(as_uuid=True),
               nullable=False)
    op.alter_column('followup_jobs', 'appointment_id',
               existing_type=postgresql.UUID(as_uuid=True),
               nullable=False)
