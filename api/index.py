"""Vercel serverless entry point for the MarineScan FastAPI application."""

from backend.app.main import app

__all__ = ["app"]
