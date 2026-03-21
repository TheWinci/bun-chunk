import os
from pathlib import Path
from typing import Optional, List

MAX_SIZE = 1024


class DataProcessor:
    """Process data from files."""

    def __init__(self, name: str, enabled: bool = True):
        self.name = name
        self.enabled = enabled

    def process(self, input_path: str) -> Optional[str]:
        """Process a single file."""
        try:
            path = Path(input_path)
            return path.read_text().upper()
        except FileNotFoundError:
            return None

    @staticmethod
    def validate(data: str) -> bool:
        """Validate data format."""
        return len(data) > 0 and len(data) < MAX_SIZE


def create_processor(name: str) -> DataProcessor:
    """Factory function."""
    return DataProcessor(name=name)


def helper(x: int) -> int:
    return x * 2
