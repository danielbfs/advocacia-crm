"""Base messaging adapter interface."""
from abc import ABC, abstractmethod


class AbstractMessagingAdapter(ABC):
    @abstractmethod
    async def send_message(self, chat_id: str, text: str) -> bool:
        ...

    @abstractmethod
    async def send_message_tracked(self, chat_id: str, text: str) -> tuple[bool, str | None]:
        """Send a message and return (success, channel_message_id)."""
        ...

    @abstractmethod
    def parse_webhook(self, payload: dict) -> dict | None:
        ...
