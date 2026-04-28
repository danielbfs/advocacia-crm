"""Messaging gateway — routes messages to the right channel adapter."""
import logging
from app.modules.messaging.adapters.telegram import TelegramAdapter
from app.modules.messaging.adapters.evolution_api import EvolutionApiAdapter

logger = logging.getLogger(__name__)

class MessagingGateway:
    def __init__(self):
        self._adapters = {
            "telegram": TelegramAdapter(),
            "whatsapp": EvolutionApiAdapter(),
        }

    async def send_message(self, channel: str, chat_id: str, text: str) -> bool:
        """Send a message through the appropriate channel adapter."""
        adapter = self._adapters.get(channel)
        if not adapter:
            logger.warning("Unsupported channel: %s", channel)
            return False
        return await adapter.send_message(chat_id, text)

    async def send_message_tracked(
        self, channel: str, chat_id: str, text: str
    ) -> tuple[bool, str | None]:
        """Send a message and return (success, channel_message_id)."""
        adapter = self._adapters.get(channel)
        if not adapter:
            logger.warning("Unsupported channel: %s", channel)
            return False, None
        return await adapter.send_message_tracked(chat_id, text)

    def parse_webhook(self, channel: str, payload: dict):
        """Parse an incoming webhook payload using the appropriate adapter."""
        adapter = self._adapters.get(channel)
        if not adapter:
            logger.warning("Unsupported channel: %s", channel)
            return None
        return adapter.parse_webhook(payload)


# Singleton instance for easy access
gateway = MessagingGateway()


# Maintain legacy function for backward compatibility
async def send_message(channel: str, chat_id: str, text: str) -> bool:
    return await gateway.send_message(channel, chat_id, text)
