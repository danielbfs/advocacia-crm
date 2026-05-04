"""Evolution API adapter — receive and send messages via WhatsApp."""
import logging
import httpx
from app.config import settings
from app.modules.messaging.adapters.base import AbstractMessagingAdapter
from app.modules.messaging.schemas import IncomingMessage

logger = logging.getLogger(__name__)


class EvolutionApiAdapter(AbstractMessagingAdapter):
    def __init__(self):
        self.base_url = settings.EVOLUTION_API_URL.rstrip("/")
        self.api_key = settings.EVOLUTION_API_KEY
        self.instance_name = settings.EVOLUTION_INSTANCE_NAME

    async def send_message(self, chat_id: str, text: str) -> bool:
        ok, _ = await self.send_message_tracked(chat_id, text)
        return ok

    async def send_message_tracked(self, chat_id: str, text: str) -> tuple[bool, str | None]:
        """Send a message and return (success, whatsapp_message_id)."""
        if not self.api_key or not self.instance_name:
            logger.warning("Evolution API not configured, skipping send")
            return False, None

        url = f"{self.base_url}/message/sendText/{self.instance_name}"
        headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "number": chat_id,
            "text": text,
            "delay": 1200,
            "linkPreview": False
        }

        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code not in (200, 201):
                    logger.error(
                        "Evolution API send failed: %s %s", resp.status_code, resp.text
                    )
                    return False, None
                try:
                    msg_id = resp.json().get("key", {}).get("id")
                except Exception:
                    msg_id = None
                return True, msg_id
            except Exception as e:
                logger.exception("Error sending message via Evolution API: %s", e)
                return False, None

    def parse_webhook(self, payload: dict) -> IncomingMessage | None:
        """Parse Evolution API webhook payload into a normalized IncomingMessage."""
        event = payload.get("event")
        if event != "messages.upsert":
            return None

        data = payload.get("data", {})

        # Skip messages sent by us (fromMe)
        key = data.get("key", {})
        if key.get("fromMe"):
            return None

        message = data.get("message", {})

        # Extract text: plain message or quoted reply (extendedTextMessage)
        text = message.get("conversation")
        quoted_message_id = None

        if not text:
            ext = message.get("extendedTextMessage", {})
            text = ext.get("text")
            context_info = ext.get("contextInfo", {})
            quoted_message_id = context_info.get("stanzaId")

        if not text:
            return None

        remote_jid = data.get("remoteJid") or key.get("remoteJid", "")
        phone = remote_jid.split("@")[0] if "@" in remote_jid else remote_jid
        raw_message_id = key.get("id")
        push_name = data.get("pushName")

        return IncomingMessage(
            channel="whatsapp",
            channel_user_id=phone,
            channel_chat_id=phone,
            user_name=push_name,
            text=text,
            raw_message_id=raw_message_id,
            quoted_message_id=quoted_message_id,
        )
