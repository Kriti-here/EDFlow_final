from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routers import (
    ai,
    core,
    edf,
    exceptions,
    fira,
    invoices,
    matches,
    purpose,
    rules,
    webhooks,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="EDFlow API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"service": "EDFlow API", "status": "running"}


app.include_router(core.router)
app.include_router(invoices.router)
app.include_router(rules.router)
app.include_router(webhooks.router)
app.include_router(fira.router)
app.include_router(matches.router)
app.include_router(exceptions.router)
app.include_router(purpose.router)
app.include_router(edf.router)
app.include_router(ai.router)
