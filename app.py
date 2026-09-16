"""Vercel FastAPI entry point.

Vercel detects a root-level ``app.py`` containing a FastAPI ``app`` instance
and forwards original request paths directly to it.
"""

from backend.app.main import app

__all__ = ["app"]
