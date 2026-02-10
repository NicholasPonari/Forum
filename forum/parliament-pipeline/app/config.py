"""Application configuration via pydantic-settings."""

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Pipeline configuration loaded from environment variables."""

    # Supabase — accepts SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL (same value as in forum)
    supabase_url: str = Field(
        ...,
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    )
    # Accepts SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY (same value as in forum)
    supabase_service_key: str = Field(
        ...,
        validation_alias=AliasChoices("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # OpenAI
    openai_api_key: str = ""

    # Whisper
    whisper_model: str = "large-v3"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # System bot user
    system_bot_user_id: str = ""

    # Pipeline
    poll_interval_minutes: int = 30
    max_retries: int = 3
    log_level: str = "INFO"

    # API auth
    pipeline_api_key: str = "change-this-to-a-secure-key"

    # Media storage
    media_storage_path: str = "/tmp/parliament-media"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
