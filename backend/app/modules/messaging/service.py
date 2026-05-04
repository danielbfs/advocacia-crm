"""Service for managing messaging conversations."""
import uuid
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.messaging.models import Conversation, Message

class MessagingService:
    async def get_active_conversations(self, db: AsyncSession, channel: str | None = None):
        """Get all active conversations from both Patients and Leads."""
        from app.modules.leads.ai_models import LeadConversation
        
        # 1. Fetch Patient Conversations
        q_patient = select(Conversation).where(Conversation.status == "active")
        if channel:
            q_patient = q_patient.where(Conversation.channel == channel)
        res_patient = await db.execute(q_patient)
        patients = list(res_patient.scalars().all())
        
        # 2. Fetch Lead Conversations
        q_lead = select(LeadConversation).where(LeadConversation.status == "active")
        if channel:
            q_lead = q_lead.where(LeadConversation.channel == channel)
        res_lead = await db.execute(q_lead)
        leads = list(res_lead.scalars().all())
        
        # 3. Merge and normalize for the UI
        # We'll return a list of dicts that match the Frontend expected schema
        combined = []
        for c in patients:
            combined.append({
                "id": str(c.id),
                "patient_id": str(c.patient_id) if c.patient_id else None,
                "lead_id": None,
                "channel": c.channel,
                "control": c.control,
                "status": c.status,
                "started_at": c.started_at.isoformat(),
                "closed_at": c.closed_at.isoformat() if c.closed_at else None,
                "context_summary": c.context_summary
            })
            
        for c in leads:
            combined.append({
                "id": str(c.id),
                "patient_id": None,
                "lead_id": str(c.lead_id) if c.lead_id else None,
                "channel": c.channel,
                "control": c.control,
                "status": c.status,
                "started_at": c.started_at.isoformat(),
                "closed_at": c.closed_at.isoformat() if c.closed_at else None,
                "context_summary": None # LeadConversation doesn't have this field yet
            })
            
        # Sort by started_at descending
        combined.sort(key=lambda x: x["started_at"], reverse=True)
        return combined

    async def toggle_control(self, db: AsyncSession, conversation_id: uuid.UUID, control: str):
        """Switch control between 'ai' and 'human' for either Patient or Lead conversation."""
        if control not in ("ai", "human"):
            raise ValueError("Control must be either 'ai' or 'human'")
        
        # Try Patient Conversation
        res = await db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(control=control)
        )
        
        if res.rowcount == 0:
            # Try Lead Conversation
            from app.modules.leads.ai_models import LeadConversation
            await db.execute(
                update(LeadConversation)
                .where(LeadConversation.id == conversation_id)
                .values(control=control)
            )
            
        await db.commit()
        return True

    async def send_human_message(self, db: AsyncSession, conversation_id: uuid.UUID, text: str, channel: str, chat_id: str):
        """Send a message on behalf of a human and record it in the DB."""
        from app.modules.messaging.gateway import gateway
        
        # Send via adapter
        success = await gateway.send_message(channel, chat_id, text)
        if not success:
            return False

        # Record message
        msg = Message(
            conversation_id=conversation_id,
            role="assistant", # marked as assistant because it's a reply to the user
            content=text,
            metadata_json={"sender": "human"}
        )
        db.add(msg)
        await db.commit()
        return True

messaging_service = MessagingService()
