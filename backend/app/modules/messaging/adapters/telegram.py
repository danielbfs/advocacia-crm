"""Telegram bot adapter — receive and send messages via Telegram Bot API."""
import logging
import httpx
from app.config import settings
from app.modules.messaging.adapters.base import AbstractMessagingAdapter
from app.modules.messaging.schemas import IncomingMessage

logger = logging.getLogger(__name__)

class TelegramAdapter(AbstractMessagingAdapter):
    def __init__(self):
        self.api_url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}"

    async def send_message(self, chat_id: str, text: str) -> bool:
        ok, _ = await self.send_message_tracked(chat_id, text)
        return ok

    async def send_message_tracked(self, chat_id: str, text: str) -> tuple[bool, str | None]:
        """Send a message and return (success, message_id). Telegram IDs are integers."""
        if not settings.TELEGRAM_BOT_TOKEN:
            logger.warning("TELEGRAM_BOT_TOKEN not configured, skipping send")
            return False, None

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.api_url}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "Markdown",
                },
            )
            if resp.status_code != 200:
                logger.error("Telegram send failed: %s %s", resp.status_code, resp.text)
                return False, None
            try:
                msg_id = str(resp.json().get("result", {}).get("message_id", ""))
            except Exception:
                msg_id = None
            return True, msg_id

    def parse_webhook(self, payload: dict) -> IncomingMessage | None:
        """Parse a Telegram webhook update into a normalized IncomingMessage."""
        message = payload.get("message")
        if not message:
            return None

        text = message.get("text")
        if not text:
            return None

        from_user = message.get("from", {})
        chat = message.get("chat", {})

        first = from_user.get("first_name", "")
        last = from_user.get("last_name", "")
        user_name = f"{first} {last}".strip() or None

        return IncomingMessage(
            channel="telegram",
            channel_user_id=str(from_user.get("id", "")),
            channel_chat_id=str(chat.get("id", "")),
            user_name=user_name,
            text=text,
        )

    async def set_webhook(self, url: str) -> bool:
        """Register the webhook URL with Telegram."""
        if not settings.TELEGRAM_BOT_TOKEN:
            return False

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.api_url}/setWebhook",
                json={"url": url, "allowed_updates": ["message"]},
            )
            logger.info("setWebhook response: %s", resp.json())
            return resp.status_code == 200
