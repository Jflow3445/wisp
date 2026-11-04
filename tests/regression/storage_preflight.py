"""Exercise build headroom without allocating disk or reading runtime config."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

path = Path(__file__).parents[2] / "ops/storage_preflight.py"
spec = importlib.util.spec_from_file_location("storage_preflight", path)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class StoragePreflightTests(unittest.TestCase):
    def test_insufficient_space_blocks_build(self):
        with patch.object(guard.shutil, "disk_usage") as disk:
            disk.return_value.free = guard.MIN_FREE_BYTES - 1
            with self.assertRaisesRegex(RuntimeError, "Build blocked"):
                guard.require_build_space(Path("/"))

    def test_threshold_allows_build(self):
        with patch.object(guard.shutil, "disk_usage") as disk:
            disk.return_value.free = guard.MIN_FREE_BYTES
            guard.require_build_space(Path("/"))

    def test_measurement_failure_cannot_authorize_build(self):
        with patch.object(guard.shutil, "disk_usage", side_effect=OSError("unavailable")):
            with self.assertRaises(OSError):
                guard.require_build_space(Path("/"))


if __name__ == "__main__":
    unittest.main()
