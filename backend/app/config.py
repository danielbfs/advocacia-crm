"""
Configurações da aplicação via variáveis de ambiente.
Usa pydantic-settings para validação automática.
"""
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Ambiente
    ENVIRONMENT: Literal["development", "production"] = "development"
    DOMAIN: str = "localhost"
    APP_TIER: Literal["basic", "advanced"] = "basic"

    # Banco de dados
    DATABASE_URL: str
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Segurança
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Local LLM (opcional)
    LOCAL_LLM_BASE_URL: str = ""
    LOCAL_LLM_MODEL: str = ""

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""

    # Evolution API (WhatsApp)
    EVOLUTION_API_URL: str = ""
    EVOLUTION_API_KEY: str = ""
    EVOLUTION_INSTANCE_NAME: str = ""

    # Clínica
    CLINIC_TIMEZONE: str = "America/Sao_Paulo"
    CLINIC_SLA_HOURS: int = 2

    # Webhook de leads externos
    LEADS_WEBHOOK_API_KEY: str = ""

    # Encryption (para OAuth tokens do Google)
    ENCRYPTION_KEY: str = ""

    # Google OAuth (opcional)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""


settings = Settings()
