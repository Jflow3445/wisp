"""Only generated builder artifacts may disappear from a runtime release."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("flight_compact", Path(__file__).parents[2] / "nister-flight/ops/compact.py")
compact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compact)


class CompactionTests(unittest.TestCase):
    def fixture(self, root):
        files = {
            ".next/standalone/server.js": "runtime server",
            ".next/standalone/node_modules/next/package.json": "{}",
            ".next/standalone/.next/BUILD_ID": "fixture",
            ".next/standalone/.next/cache/images/image": "runtime cache",
            ".next/cache/.previewinfo": "runtime metadata",
            "node_modules/typescript/index.js": "builder dependency",
            ".next/cache/webpack/compiler.pack": "compiler cache",
            ".next/cache/.tsbuildinfo": "incremental types",
            "src/page.tsx": "source",
            "package-lock.json": "lockfile",
            ".env": "fixture only",
            "storage/upload": "customer file",
        }
        for name, value in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        return files

    def test_success_removes_only_builder_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = self.fixture(root)
            def probe():
                self.assertFalse((root / "node_modules").exists())
                self.assertTrue((root / ".next/standalone/server.js").is_file())
                return True
            removed = compact.compact_release(root, probe)
            self.assertEqual(set(removed), {"node_modules", ".next/cache/webpack", ".next/cache/.tsbuildinfo"})
            for name, value in files.items():
                if name.startswith(("node_modules/", ".next/cache/webpack/")) or name == ".next/cache/.tsbuildinfo":
                    self.assertFalse((root / name).exists())
                else:
                    self.assertEqual((root / name).read_text(), value)

    def test_failed_probe_restores_all_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = self.fixture(root)
            with self.assertRaisesRegex(RuntimeError, "did not pass"):
                compact.compact_release(root, lambda: False)
            for name, value in files.items():
                self.assertEqual((root / name).read_text(), value)
            self.assertFalse((root / ".nister-build-artifacts").exists())

    def test_incomplete_runtime_blocks_compaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            (root / ".next/standalone/.next/BUILD_ID").unlink()
            with self.assertRaisesRegex(RuntimeError, "Complete standalone"):
                compact.compact_release(root, lambda: True)
            self.assertTrue((root / "node_modules/typescript/index.js").is_file())

    def test_existing_quarantine_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            (root / ".nister-build-artifacts").mkdir()
            with self.assertRaises(FileExistsError):
                compact.compact_release(root, lambda: True)
            self.assertTrue((root / "node_modules/typescript/index.js").is_file())


if __name__ == "__main__":
    unittest.main()
