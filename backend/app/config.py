"""Settings. One real .env lives at the repo root (git-ignored)."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), extra="ignore")

    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    paypal_client_id: str = Field(
        "", validation_alias=AliasChoices("PAYPAL_CLIENT_ID", "CLIENT_ID")
    )
    paypal_client_secret: str = Field(
        "", validation_alias=AliasChoices("PAYPAL_CLIENT_SECRET", "SECRET_KEY")
    )
    paypal_webhook_id: str = ""
    buyer_email: str = Field(
        "", validation_alias=AliasChoices("BUYER_EMAIL", "PAYPAL_BUYER_EMAIL")
    )
    merchant_email: str = ""
    allow_unverified_webhooks: bool = False  # local testing only, never in production

    public_base_url: str = "http://localhost:8000"
    # Local Vite dev server (see DEPLOY.md). Deployed origins (e.g. the Vercel URL)
    # come from CORS_ORIGINS / FRONTEND_URL in the environment, never hardcoded here.
    frontend_url: str = "http://localhost:5173"
    # Local Vite dev origins. The dev server sets strictPort: true (vite.config.ts),
    # so it fails loudly instead of drifting off 5173 — these extra ports are kept
    # only as an explicit allowlist for developers who deliberately start Vite on a
    # fallback port. An untrusted origin makes every request fail CORS and the whole
    # SPA render zeros with no visible cause. This stays an explicit allowlist —
    # deployed origins come from CORS_ORIGINS in the environment, never hardcoded here.
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:5175,http://127.0.0.1:5175"
    )
    database_url: str = f"sqlite:///{ROOT / 'edflow.sqlite'}"
    demo_admin_key: str = ""

    frankfurter_base_url: str = "https://api.frankfurter.app"
    fx_cache_ttl_seconds: int = 3600
    fx_timeout_seconds: float = 10.0

    rules_path: str = str(ROOT / "rules" / "india_export.yaml")

    # B10 FIRA extraction. Upload cap guards memory/disk; the confidence floor is
    # the basis-point threshold below which a document is flagged "needs_review".
    fira_max_upload_bytes: int = 5 * 1024 * 1024
    fira_confidence_threshold_bp: int = 9000

    # B8 AI layer. Disabled by default: `ai_mode = "off"` means no provider is ever
    # called. `replay` serves recorded fixtures and never touches the network;
    # `record`/`live` are opt-in. The key is read only from the environment (rule 3).
    # The AI router only serves when ai_enabled is true AND ai_mode is not "off".
    ai_enabled: bool = False  # master switch for the /ai router
    ai_mode: str = "off"  # off | replay | record | live
    ai_provider: str = "none"  # none | gemini
    ai_api_key: str = Field(
        "", validation_alias=AliasChoices("AI_API_KEY", "GEMINI_API_KEY")
    )
    ai_base_url: str = "https://generativelanguage.googleapis.com"
    ai_cache_dir: str = str(ROOT / "fixtures" / "ai")


@lru_cache
def get_settings() -> Settings:
    return Settings()
