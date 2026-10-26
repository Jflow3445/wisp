#!/usr/bin/env python3
"""Bounded shared-link controller; RouterOS retains all packet forwarding.

RTT probes originate at the site, never the VPS. Keep the last safe budget on
transport/probe failures. Persist telemetry and decisions for operational review.
"""
import argparse
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time


def pair(value):
    def number(s):
        match = re.fullmatch(r'(\d+(?:\.\d+)?)([kKMG]?)', s)
        if not match:
            raise ValueError('Invalid RouterOS rate')
        return int(float(match[1]) * {'': 1, 'k': 1000, 'K': 1000, 'M': 1000000, 'G': 1000000000}[match[2]])
    return tuple(number(s) for s in value.split('/'))


def validate(config):
    for direction in ('up', 'down'):
        values = [config[direction + '_' + key] for key in ('min_bps', 'initial_bps', 'max_bps')]
        if any(type(v) is not int for v in values) or not 100000 <= values[0] <= values[1] <= values[2] <= 1000000000:
            raise ValueError('Invalid congestion bandwidth bounds')
    if not 10 <= config['delay_ms'] <= 100 or not 2 <= config['bad_ticks'] <= 12:
        raise ValueError('Invalid delay/hysteresis setting')
    return config


def decide(config, state, sample, now):
    """Pure control logic: sustained queue delay plus demand, slow recovery."""
    config = validate(config)
    state = dict(state)
    elapsed = now - state.get('ts', 0)
    if elapsed < 0 or elapsed > 60:
        state = {}  # Do not carry consecutive-event counters across downtime.
    baselines = dict(state.get('baselines', {}))
    inflations = []
    for host, rtts in sample['rtts'].items():
        valid = [rtt for rtt in rtts if rtt is not None]
        if not valid:
            continue
        rtt = min(valid)
        old = baselines.get(host, rtt)
        # Follow slower route changes very gradually; never rebase on one spike.
        baselines[host] = min(rtt, old + max(0, min(elapsed, 20)) * 0.01)
        inflations.append(max(0, rtt - baselines[host]))
    complete = len(inflations) == 2
    # Require both independent destinations to show inflated delay. One endpoint
    # failing or ICMP-deprioritizing must not collapse the site's bandwidth.
    delay = min(inflations) if complete else None
    loss = sum(v is None for a in sample['rtts'].values() for v in a)
    busy = sample['cpu_max'] >= 85
    congested = complete and (delay > config['delay_ms'] or loss >= 2)
    healthy = complete and loss == 0 and delay < config['delay_ms'] / 2 and not busy
    state['bad'] = state.get('bad', 0) + 1 if congested else 0
    state['good'] = state.get('good', 0) + 1 if healthy else 0
    rates, reasons = {}, []
    utilization = [sample['wan'][i] / max(sample['limits'][i], 1) for i in (0, 1)]
    for direction, index in [('up', 0), ('down', 1)]:
        current = sample['limits'][index]
        lower, upper = config[direction + '_min_bps'], config[direction + '_max_bps']
        current = min(upper, max(lower, current))
        used = sample['wan'][index]
        # A low-traffic remote latency event is not evidence of local congestion.
        # Prefer the direction closest to its current budget. Upload saturation
        # must not needlessly collapse a lightly used download budget (or reverse).
        demand = used >= lower * 0.7 and utilization[index] >= max(utilization) * 0.8
        if state['bad'] >= config['bad_ticks'] and demand and not busy:
            current = max(lower, int(min(current * 0.85, used * 0.95) / 100000) * 100000)
            reasons.append(direction + '_reduce')
        elif state['good'] >= 3 and (used >= current * 0.60 or current < config[direction + '_initial_bps']):
            # Recover promptly after a transient event, including when an idle
            # period hides demand. Above the calibrated starting budget, require
            # actual demand and probe upward more cautiously.
            factor = 1.20 if current < config[direction + '_initial_bps'] else 1.05
            current = min(upper, int((current * factor + 100000) / 100000) * 100000)
            reasons.append(direction + '_recover')
        rates[direction] = current
    if state['bad'] >= config['bad_ticks']:
        state['bad'] = 0
    state['good'] = min(state['good'], 6)
    state.update(ts=now, baselines=baselines, rates=rates, delay_ms=delay,
                 loss=loss, cpu_max=sample['cpu_max'], mode=','.join(reasons) or ('cpu_hold' if busy else 'hold'))
    return state


def shares(accounts, limits):
    """Plan-weighted account CIRs, bounded by both plan and parent capacity."""
    result = {}
    for direction in (0, 1):
        total = sum(a['rates'][direction] for a in accounts)
        # Leave room for capped pre-auth traffic; idle account guarantees are
        # borrowable, so this does not reserve unused bandwidth away from others.
        budget = max(0, int(limits[direction] * 0.90) - 100000)
        factor = min(1, budget / total) if total else 0
        for account in accounts:
            result.setdefault(account['name'], [0, 0])[direction] = math.floor(account['rates'][direction] * factor)
    return result


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$').replace('\n', '\\n') + '"'


SNAPSHOT = r''':put ("ROOT|" . [/queue simple get [find name="nister-site"] max-limit]);
:local w [/interface monitor-traffic ether1 once as-value];
:put ("WAN|" . ($w->"tx-bits-per-second") . "|" . ($w->"rx-bits-per-second"));
:foreach c in=[/system resource cpu find] do={ :put ("CPU|" . [/system resource cpu get $c load]); };
:foreach host in={"1.1.1.1";"8.8.8.8"} do={
 :local probes [/ping $host count=2 interval=200ms as-value];
 :foreach p in=$probes do={ :local ns "loss";
  :if ([:typeof ($p->"time")] = "time") do={ :set ns [:tonsec ($p->"time")]; };
  :put ("PING|" . $host . "|" . $ns);
 };
};
:foreach q in=[/queue simple find where comment~"^NISTER ACCOUNT SHAPER"] do={
 :put ("ACCOUNT|" . [/queue simple get $q name] . "|" . [/queue simple get $q max-limit] . "|" . [/queue simple get $q limit-at]);
};'''


def parse_snapshot(output):
    sample = {'rtts': {}, 'cpu_max': 0, 'accounts': []}
    for line in output.splitlines():
        parts = line.strip().split('|')
        if parts[0] == 'ROOT':
            sample['limits'] = pair(parts[1])
        elif parts[0] == 'WAN':
            sample['wan'] = tuple(int(v) for v in parts[1:3])
        elif parts[0] == 'CPU':
            sample['cpu_max'] = max(sample['cpu_max'], int(parts[1].rstrip('%')))
        elif parts[0] == 'PING':
            sample['rtts'].setdefault(parts[1], []).append(None if parts[2] == 'loss' else int(parts[2]) / 1000000)
        elif parts[0] == 'ACCOUNT':
            if not re.fullmatch(r'nister-acct-0\d{9}', parts[1]):
                raise ValueError('Unexpected account identity')
            sample['accounts'].append({'name': parts[1], 'rates': pair(parts[2]), 'cir': pair(parts[3])})
    if 'limits' not in sample or 'wan' not in sample or any(len(sample['rtts'].get(h, [])) != 2 for h in ('1.1.1.1', '8.8.8.8')):
        raise ValueError('Incomplete router observation')
    return sample


def ssh(command):
    args = ['ssh', '-b', '10.99.99.1', '-i', os.environ.get('ROUTER_SSH_KEY_ON_VPS', '/root/.ssh/mikrotik_certsync'),
            '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=5',
            '-o', 'ServerAliveInterval=3', '-o', 'ServerAliveCountMax=1',
            os.environ.get('ROUTER_USER', 'certsync') + '@' + os.environ.get('ROUTER_HOST', '10.10.20.2'),
            command.replace('\n', ' ') + '; :put "CONGESTION_OK"']
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    output = result.stdout + result.stderr
    if result.returncode or 'CONGESTION_OK' not in output or 'CONGESTION_FAILED' in output:
        error_path = Path('/var/lib/nister/congestion/last-router-error.txt')
        if error_path.parent.exists():
            error_path.write_text(output)
        raise RuntimeError('Router congestion operation failed; existing budget retained')
    return output


def apply_command(sample, decision):
    limits = (decision['rates']['up'], decision['rates']['down'])
    allocations = shares(sample['accounts'], limits)
    # First release old CIRs before lowering the root. Unchanged allocations
    # produce no writes. No plan max-limit is changed by the controller.
    ceiling = tuple(max(sample['limits'][i], limits[i]) for i in (0, 1))
    command = ':local root [/queue simple find where name="nister-site"]; '
    if ceiling != sample['limits']:
        command += '/queue simple set $root max-limit=' + '/'.join(map(str, ceiling)) + '; '
    previous = {account['name']: account.get('cir') for account in sample['accounts']}
    changed = False
    for name, values in allocations.items():
        if previous[name] == tuple(values):
            continue
        value = '/'.join(map(str, values))
        changed = True
        command += (':local q [/queue simple find where name=' + quote(name) + ']; :if ([:len $q] = 1) do={ '
                    '/queue simple set $q limit-at=' + value + '; }; ')
    value = '/'.join(map(str, limits))
    if changed:
        command += '/system script run nister-qos-devices; '
    if limits != ceiling:
        command += '/queue simple set $root max-limit=' + value + '; '
    command += '/system script run nister-congestion-heartbeat;'
    return command


def main():
    import fcntl
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=Path('/usr/local/share/nister/hotspot-policy/congestion_site.json'))
    parser.add_argument('--state-dir', type=Path, default=Path('/var/lib/nister/congestion'))
    args = parser.parse_args()
    config = validate(json.loads(args.config.read_text()))
    args.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (args.state_dir / '.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        path = args.state_dir / 'state.json'
        state = json.loads(path.read_text()) if path.exists() else {}
        sample = parse_snapshot(ssh(SNAPSHOT))
        decision = decide(config, state, sample, time.time())
        ssh(apply_command(sample, decision))
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps(decision, indent=2) + '\n')
        tmp.replace(path)
        print('status=ok mode=' + decision['mode'] + ' up=' + str(decision['rates']['up']) +
              ' down=' + str(decision['rates']['down']) + ' delay_ms=' + str(decision['delay_ms']) +
              ' loss=' + str(decision['loss']) + ' cpu_max=' + str(decision['cpu_max']), flush=True)


if __name__ == '__main__':
    try:
        main()
    except subprocess.TimeoutExpired:
        print('status=error router_operation_timed_out existing_budget_retained', flush=True)
        raise SystemExit(1)
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print('status=error ' + str(error), flush=True)
        raise SystemExit(1)
