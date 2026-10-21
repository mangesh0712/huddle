from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    app_name: str = "Huddle"
    invite_key: str = ""
    admin_key: str = ""
    session_secret: str = "dev-secret-change-me-dev-secret-change-me"
    channels: str = "Lounge,Chill,Gaming,Karaoke"
    karaoke_channels: str = "Karaoke"
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    youtube_api_key: str = ""
    skip_policy: str = "anyone"
    allowed_origins: str = ""

    @property
    def channel_names(self) -> list[str]:
        return [c.strip() for c in self.channels.split(",") if c.strip()]

    @property
    def karaoke_names(self) -> list[str]:
        return [c.strip() for c in self.karaoke_channels.split(",") if c.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
