#!/usr/bin/env python3
"""Exercise site-capacity validation and fail-closed deployment rendering."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('qos_policy', ROOT / 'ops/sync_hotspot_policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class CapacityRendering(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        for name in ['hotspot_account_login.rsc', 'hotspot_account_logout.rsc', 'hotspot_qos_guard.rsc']:
            shutil.copyfile(ROOT / 'ops' / name, self.directory / name)

    def render(self, capacity=None):
        if capacity is not None:
            (self.directory / 'qos_site.json').write_text(json.dumps(capacity))
        return dict(policy.commands(self.directory))

    def test_missing_capacity_disables_bursts(self):
        guard = self.render()['qos-burst-guard']
        self.assertIn(':local capacityUp 0; :local capacityDown 0;', guard)

    def test_valid_capacity_is_not_a_wan_shaper(self):
        stages = self.render({'upload_bps': 3000000, 'download_bps': 20000000})
        self.assertIn(':local capacityUp 3000000; :local capacityDown 20000000;', stages['qos-burst-guard'])
        self.assertNotIn('/queue tree add', '\n'.join(stages.values()))

    def test_bad_capacity_is_rejected_before_commands_are_applied(self):
        for value in [-1, True, 1.5, '20M', 1000000001, None]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.render({'upload_bps': value, 'download_bps': 20000000})

    def test_old_torrent_throttle_is_retired(self):
        stages = self.render()
        self.assertNotIn('torrent-queues', stages)
        self.assertNotIn('torrent-classification', stages)
        self.assertIn('/queue tree disable', stages['retire-p2p-throttle'])
        self.assertIn('/ip firewall mangle disable', stages['retire-p2p-throttle'])

    def test_peer_ceilings_only_match_new_paid_wan_connections(self):
        rules = self.render()['peer-connection-ceilings']
        for required in ['connection-state="new"', 'src-address-list="HS_ACTIVE"',
                         'in-interface="bridge"', 'out-interface-list="WAN"']:
            self.assertIn(required, rules)


if __name__ == '__main__':
    unittest.main()
