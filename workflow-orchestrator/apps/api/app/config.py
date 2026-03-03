from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "workflow-orchestrator-api"
    database_url: str = Field(default="postgresql+psycopg2://postgres:postgres@localhost:5432/orchestrator")
    default_pipeline_name: str = "Default Pipeline"
    default_profile_name: str = "Default Profile"
    job_lease_seconds: int = 120
    tg_bot_token: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
