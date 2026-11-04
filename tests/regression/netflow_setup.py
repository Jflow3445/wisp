"""Run only the installer's configuration fragments in a private fixture."""
import os
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path

source = (Path(__file__).parents[2] / "nister_netflow_setup.sh").read_text()
bash = "C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else "bash"


class NetflowSetupTests(unittest.TestCase):
    def test_old_capture_rules_leave_active_include_directory(self):
        fragment = source.split('for legacy_rule in "${LOGROTATE_FILE}".*; do', 1)[1]
        fragment = 'for legacy_rule in "${LOGROTATE_FILE}".*; do' + fragment.split('\ncat > "$RETENTION_CRON_FILE"', 1)[0]
        with tempfile.TemporaryDirectory(prefix="nister-netflow-rules-") as tmp:
            root = Path(tmp)
            rules = root / "logrotate.d"
            rules.mkdir()
            active = rules / "nister-netflow"
            active.write_text("# Capture cleanup uses verified archival only\n")
            bad = rules / "nister-netflow.bak.20260329_043738"
            bad.write_text("/var/log/netflow/nfcapd.* { daily }\n")
            unrelated = rules / "nister-netflow.notes"
            unrelated.write_text("# Preserve this unrelated note\n")
            fragment = fragment.replace("/var/backups/nister-netflow-logrotate", (root / "backups").as_posix())
            script = "set -eu\ninstall(){ mkdir -p \"${@: -1}\"; }\n"
            script += "LOGROTATE_FILE=" + shlex.quote(active.as_posix()) + "\nNETFLOW_DIR=/var/log/netflow\n" + fragment
            subprocess.run([bash, "-s"], input=script, text=True, check=True)
            self.assertFalse(bad.exists())
            backups = list((root / "backups").glob("*/" + bad.name))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), "/var/log/netflow/nfcapd.* { daily }\n")
            self.assertEqual(active.read_text(), "# Capture cleanup uses verified archival only\n")
            self.assertTrue(unrelated.exists())

    def test_generated_cleanup_requires_the_verifying_uploader(self):
        fragment = 'cat > "$RETENTION_CRON_FILE" <<EOF\n' + source.split('cat > "$RETENTION_CRON_FILE" <<EOF\n', 1)[1].split('\nEOF', 1)[0] + '\nEOF\n'
        with tempfile.TemporaryDirectory(prefix="nister-netflow-retention-") as tmp:
            root = Path(tmp)
            cron = root / "cleanup"
            missing = root / "missing-uploader.php"
            capture = root / "nfcapd.200001010000"
            capture.write_bytes(b"forensic fixture must remain")
            script = "set -eu\nRETENTION_CRON_FILE=" + shlex.quote(cron.as_posix()) + "\nARCHIVE_SCRIPT_DST=" + shlex.quote(missing.as_posix()) + "\n" + fragment
            subprocess.run([bash, "-s"], input=script, text=True, check=True)
            self.assertIn('exec /usr/bin/php "' + missing.as_posix() + '"', cron.read_text())
            self.assertNotIn("rm -f", cron.read_text())
            self.assertNotIn("find ", cron.read_text())
            result = subprocess.run([bash, str(cron)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(capture.read_bytes(), b"forensic fixture must remain")


if __name__ == "__main__":
    unittest.main()
