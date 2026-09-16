from abc import ABC, abstractmethod


class ReconstructionEngine(ABC):
    @abstractmethod
    def submit(self, session_id: str, image_paths: list[str]) -> str:
        """Submit originals and return a provider job ID."""


class WebOdmAdapter(ReconstructionEngine):
    def submit(self, session_id: str, image_paths: list[str]) -> str:
        raise NotImplementedError(
            "Configure a NodeODM/WebODM endpoint before enabling reconstruction. "
            "Keep ArUco-derived scale control points in the submitted task metadata."
        )
