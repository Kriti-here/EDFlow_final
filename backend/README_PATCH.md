# EDFlow backend repair patch

This patch contains the supplied backend files arranged under `backend/`, plus:
- `backend/app/models.py` (missing blocker reconstructed from the fields referenced by the supplied code/tests)
- `backend/requirements.txt`
- root `.env.example`
- a small safety fix for non-finite/over-precision invoice amounts
- a timezone parsing fix that normalizes offset timestamps to UTC instead of discarding the offset

It does not implement FIRA ingestion, matching, exception management, EDF pack generation, production authentication, or a production database migration. Those remain next-phase work.

Apply by backing up your current project first, then compare/copy the `backend/` directory and `.env.example`. Do not overwrite your real `.env`.
