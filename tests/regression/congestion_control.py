#!/usr/bin/env python3
"""Check congestion decisions independently of live router access."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('controller', ROOT / 'ops/congestion_control.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CongestionControl(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / 'ops/congestion_site.json').read_text())
        self.sample = {'limits': (5000000, 70000000), 'wan': (4500000, 56000000),
                       'cpu_max': 40, 'rtts': {'1.1.1.1': [20, 21], '8.8.8.8': [25, 26]}}
        self.state = c.decide(self.config, {}, self.sample, 100)

    def tick(self, count, sample=None):
        for i in range(count):
            self.state = c.decide(self.config, self.state, sample or self.sample, self.state['ts'] + 10)
            self.sample['limits'] = (self.state['rates']['up'], self.state['rates']['down'])
        return self.state

    def test_one_latency_spike_does_not_reduce_capacity(self):
        self.sample['rtts'] = {'1.1.1.1': [100, 110], '8.8.8.8': [100, 110]}
        self.assertEqual(self.tick(1)['rates'], {'up': 5000000, 'down': 70000000})

    def test_sustained_delay_reduces_loaded_directions(self):
        self.sample['rtts'] = {'1.1.1.1': [100, 110], '8.8.8.8': [100, 110]}
        result = self.tick(3)
        self.assertLess(result['rates']['up'], 5000000)
        self.assertLess(result['rates']['down'], 70000000)

    def test_idle_path_latency_does_not_throttle_site(self):
        self.sample.update(wan=(10000, 10000), rtts={'1.1.1.1': [100, 110], '8.8.8.8': [100, 110]})
        self.assertEqual(self.tick(3)['rates'], {'up': 5000000, 'down': 70000000})

    def test_upload_congestion_preserves_lightly_used_download_budget(self):
        self.sample.update(wan=(4800000, 10000000), rtts={'1.1.1.1': [100, 110], '8.8.8.8': [100, 110]})
        result = self.tick(3)
        self.assertLess(result['rates']['up'], 5000000)
        self.assertEqual(result['rates']['down'], 70000000)

    def test_single_remote_failure_does_not_collapse_capacity(self):
        self.sample['rtts']['1.1.1.1'] = [None, None]
        self.assertEqual(self.tick(8)['rates'], {'up': 5000000, 'down': 70000000})

    def test_healthy_loaded_link_recovers_gradually(self):
        result = self.tick(2)
        self.assertGreater(result['rates']['up'], 5000000)
        self.assertLessEqual(result['rates']['up'], 5500000)
        self.assertGreater(result['rates']['down'], 70000000)

    def test_quiet_healthy_link_recovers_from_transient_reduction(self):
        self.sample.update(limits=(2000000, 10000000), wan=(1000, 1000))
        result = self.tick(2)
        self.assertGreater(result['rates']['up'], 2000000)
        self.assertGreater(result['rates']['down'], 10000000)
        self.assertLessEqual(result['rates']['down'], 12100000)

    def test_cpu_core_pressure_blocks_growth(self):
        self.sample['cpu_max'] = 96
        self.assertEqual(self.tick(6)['rates'], {'up': 5000000, 'down': 70000000})

    def test_downtime_clears_consecutive_event_history(self):
        self.state['bad'] = 2
        self.sample['rtts'] = {'1.1.1.1': [100, 110], '8.8.8.8': [100, 110]}
        result = c.decide(self.config, self.state, self.sample, self.state['ts'] + 120)
        self.assertEqual(result['bad'], 0)

    def test_operating_bounds_are_enforced(self):
        self.sample['limits'] = (1000, 1000000000)
        result = self.tick(1)
        self.assertEqual(result['rates'], {'up': self.config['up_min_bps'], 'down': self.config['down_max_bps']})

    def test_account_guarantees_fit_shared_budget(self):
        accounts = [{'name': 'daily', 'rates': (3000000, 5000000)},
                    {'name': 'weekly', 'rates': (5000000, 8000000)},
                    {'name': 'monthly', 'rates': (10000000, 15000000)}]
        result = c.shares(accounts, (3000000, 12000000))
        for i in (0, 1):
            self.assertLessEqual(sum(a[i] for a in result.values()), (3000000, 12000000)[i] * .9)
            for account in accounts:
                self.assertLessEqual(result[account['name']][i], account['rates'][i])
        self.assertGreater(result['monthly'][1], result['daily'][1])

    def test_apply_preserves_plan_max_limits(self):
        self.sample['accounts'] = [{'name': 'nister-acct-0123456789', 'rates': (3000000, 5000000)}]
        command = c.apply_command(self.sample, self.state)
        self.assertNotIn('set $q max-limit', command)
        self.assertIn('run nister-qos-devices', command)

    def test_incomplete_telemetry_is_rejected(self):
        with self.assertRaises(ValueError):
            c.parse_snapshot('ROOT|5M/70M\nWAN|1|2\nPING|1.1.1.1|20000000\n')

    def test_rate_directions_and_units(self):
        self.assertEqual(c.pair('3M/5M'), (3000000, 5000000))


if __name__ == '__main__':
    unittest.main()
