#!/usr/bin/env python3
"""Reconcile the existing NISTER router's subscriber controls over its SSH tunnel."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


# RouterOS' hostname garden handles HTTP and HTTPS without granting blanket
# access to shared CDN IP ranges. Keep OS connectivity probes outside it.
PREAUTH_HOSTS = (
    'nister.org', 'www.nister.org', 'wifi.nister.org', 'api.nister.org', 'pay.nister.org',
    'checkout.paystack.com', 'paystack.com', 'js.paystack.co', '*.paystack.co', '*.paystack.com',
    'fonts.googleapis.com', 'fonts.gstatic.com', 'challenges.cloudflare.com',
)

# Authenticated nopaid/limited clients also traverse the HG3 forward policy.
# Resolve only these service hosts, never entire shared CDN network ranges.
PREAUTH_HTTPS_HOSTS = (
    'nister.org', 'www.nister.org', 'paystack.com', 'checkout.paystack.com',
    'js.paystack.co', 'api.paystack.co', 'assets.paystack.com', 'standard.paystack.co',
    'checkout-studio.paystack.com', 'studio-api.paystack.co',
    'fonts.googleapis.com', 'fonts.gstatic.com', 'challenges.cloudflare.com',
)


def ros_quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$').replace('\r', '\\r').replace('\n', '\\n') + '"'


def upsert(menu, properties, key='comment', changed_only=False):
    selector = f'{key}={ros_quote(properties[key])}'
    values = ' '.join(f'{name}={ros_quote(value)}' for name, value in properties.items())
    update = menu + ' set $keep ' + values + '; '
    if changed_only:
        differences = []
        for name, value in properties.items():
            expected = ros_quote(value)
            if name == 'target':
                expected = '[:tostr [:toarray ' + ros_quote(value) + ']]'
            elif name in ['disabled', 'fq-codel-ecn']:
                expected = ros_quote('true' if value == 'yes' else 'false')
            elif name in ['pcq-limit', 'pcq-total-limit'] and str(value).endswith('KiB'):
                # RouterOS get returns these numeric values in KiB.
                expected = ros_quote(str(value)[:-3])
            elif name == 'fq-codel-memlimit' and str(value).endswith('MiB'):
                expected = ros_quote(str(int(str(value)[:-3]) * 1048576))
            differences.append('([:tostr [' + menu + ' get $keep ' + name + ']] != ' + expected + ')')
        update = ':if (' + ' || '.join(differences) + ') do={ ' + update + '}; '
    return ('{ :local ids [' + menu + ' find where ' + selector + ']; '
            ':if ([:len $ids] = 0) do={ ' + menu + ' add ' + values + ' } '
            'else={ :local keep [:pick $ids 0]; ' + update +
            ':foreach id in=$ids do={ :if ($id != $keep) do={ ' + menu + ' remove $id } } } };')


def commands(policy_dir):
    login = (policy_dir / 'hotspot_account_login.rsc').read_text(encoding='utf-8').strip()
    logout = (policy_dir / 'hotspot_account_logout.rsc').read_text(encoding='utf-8').strip()
    if not login or not logout:
        raise ValueError('HotSpot admission hooks must not be empty')
    # Parse every hook before changing production policies.
    yield 'parse-hooks', f':local a [:parse {ros_quote(login)}]; :local b [:parse {ros_quote(logout)}];'
    yield 'account-fairness', '\n'.join(upsert('/queue type', {
        'name': 'nister-fair-' + direction, 'kind': 'pcq', 'pcq-rate': '0',
        'pcq-classifier': classifier, 'pcq-limit': '16KiB', 'pcq-total-limit': '64KiB',
        'pcq-src-address-mask': '32', 'pcq-dst-address-mask': '32'}, 'name', changed_only=True)
        for direction, classifier in [('up', 'src-address'), ('down', 'dst-address')])
    congestion_path = policy_dir / 'congestion_site.json'
    congestion = json.loads(congestion_path.read_text()) if congestion_path.exists() else {}
    if congestion.get('enabled'):
        import importlib.util
        controller_path = Path(__file__).with_name('congestion_control.py')
        if not controller_path.exists():
            controller_path = Path(__file__).with_name('nister_congestion_control.py')
        spec = importlib.util.spec_from_file_location("nister_congestion", controller_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        validate = module.validate
        validate(congestion)
        devices = (policy_dir / 'hotspot_qos_devices.rsc').read_text().strip()
        yield 'parse-congestion-devices', ':local candidate [:parse ' + ros_quote(devices) + '];'
        shared_rate = str(congestion['up_initial_bps']) + '/' + str(congestion['down_initial_bps'])
        # A repeat deployment must preserve the controller's learned budget.
        root = ('{ :local ids [/queue simple find where name="nister-site"]; '
                ':if ([:len $ids] = 0) do={ /queue simple add name=nister-site target=192.168.80.0/20 '
                'max-limit=' + shared_rate + ' bucket-size=0.01/0.01 comment="NISTER adaptive shared capacity"; } '
                'else={ :if ([:len $ids] != 1) do={ :error "duplicate site queue"; }; }; };')
        yield 'congestion-management', '\n'.join([
            upsert('/queue type', {'name': 'nister-device-aqm', 'kind': 'fq-codel',
                'fq-codel-limit': '512', 'fq-codel-memlimit': '1MiB',
                'fq-codel-target': '5ms', 'fq-codel-interval': '100ms', 'fq-codel-ecn': 'yes'}, 'name', changed_only=True),
            upsert('/system script', {'name': 'nister-qos-devices', 'policy': 'read,write,test', 'source': devices}, 'name'),
            upsert('/system script', {'name': 'nister-congestion-heartbeat', 'policy': 'read,write,test', 'source': ':local alive true;'}, 'name'),
            root,
            '/queue simple set [find where name="nister-unclassified"] parent=nister-site;',
            '/system script run nister-qos-devices;'])
    # Site references decide bursts, never a WAN shaper. An unknown direction
    # fails closed to its normal plan rate while the other can still burst.
    site_path = policy_dir / 'qos_site.json'
    site = json.loads(site_path.read_text()) if site_path.exists() else {}
    up = site.get('upload_bps', 0)
    down = site.get('download_bps', 0)
    if any(type(v) is not int or v < 0 or v > 1_000_000_000 for v in [up, down]):
        raise ValueError('QoS capacity estimates must be integer bits/second')
    guard = (f':local capacityUp {up}; :local capacityDown {down};\n' +
        (policy_dir / 'hotspot_qos_guard.rsc').read_text(encoding='utf-8').strip())
    yield 'parse-qos-guard', ':local guard [:parse ' + ros_quote(guard) + '];'
    yield 'qos-burst-guard', upsert('/system script', {
        'name': 'nister-qos-guard', 'policy': 'read,write,test',
        'source': guard, 'comment': 'NISTER measured-headroom burst guard'}, 'name') + (
        '/system scheduler remove [find where name="nister-qos-guard" and comment="NISTER bounded bursts; fail closed on probe failure"]; '
        ) + upsert('/system scheduler', {
        'name': 'nister-qos-tick', 'interval': '5s', 'start-time': 'startup',
        'policy': 'read,write,test', 'on-event': 'nister-qos-guard',
        'disabled': 'no', 'comment': 'NISTER bounded bursts; fail closed on probe failure'}, 'name')
    yield 'portal-garden', '\n'.join(upsert('/ip hotspot walled-garden', {
        'server': 'hotspot1', 'dst-host': host, 'action': 'allow', 'disabled': 'no',
        'comment': 'NISTER PREAUTH ' + host}) for host in PREAUTH_HOSTS) + (
        # This retired override sends the public site to an unrelated old VPS.
        ' /ip dns static remove [find where name="nister.org" and comment="direct A" and address=24.199.120.76];')
    https_assets = []
    for host in PREAUTH_HTTPS_HOSTS:
        https_assets.append(upsert('/ip hotspot walled-garden ip', {
            'server': 'hotspot1', 'dst-host': host, 'protocol': 'tcp', 'dst-port': '443',
            'action': 'accept', 'disabled': 'no', 'comment': 'NISTER PREAUTH HTTPS ' + host}, 'dst-host'))
        # Select the FQDN parent, not the dynamic IP children RouterOS creates.
        https_assets.append('{ :local ids [/ip firewall address-list find where list="HG3_WG_DST" and address=' + ros_quote(host) + ']; '
            ':if ([:len $ids] = 0) do={ /ip firewall address-list add list="HG3_WG_DST" address=' + ros_quote(host) +
            ' comment=' + ros_quote('NISTER PREAUTH HTTPS ' + host) + ' } else={ /ip firewall address-list set $ids disabled=no; } };')
    yield 'portal-https-assets', '\n'.join(https_assets)
    yield 'admission-hooks', (' :foreach profileName in={"active";"default";"limited";"nopaid"} do={ '
        ':local ids [/ip hotspot user profile find where name=$profileName]; '
        ':if ([:len $ids] != 1) do={ :error "required hotspot profile missing or duplicated" }; '
        '/ip hotspot user profile set $ids shared-users=2 on-login=' + ros_quote(login) + ' on-logout=' + ros_quote(logout) + '; };')

    yield 'fallback-queue', upsert('/queue simple', {
        'name': 'nister-unclassified', 'comment': 'NISTER fallback cap for unclassified hotspot addresses',
        'target': '192.168.80.0/20', 'max-limit': '1M/1M', 'limit-at': '0/0',
        'burst-limit': '0/0', 'queue': 'default-small/default-small', 'disabled': 'no'}, 'name', changed_only=True) + upsert('/queue simple', {
        'name': 'nister-infra-management', 'comment': 'NISTER dedicated AP management queue',
        'target': '192.168.88.10/32,192.168.88.2/32', 'max-limit': '5M/5M', 'limit-at': '0/0',
        'priority': '1/1', 'burst-limit': '0/0', 'queue': 'default-small/default-small', 'disabled': 'no'}, 'name', changed_only=True) + (
        ' :if ([:len [/queue simple find where name="nister-site" and disabled=no]] = 1) do={ '
        '/queue simple set [find where name="nister-unclassified"] parent=nister-site; /system script run nister-qos-devices; '
        '} else={ :local fallback [:pick [/queue simple find where name="nister-unclassified"] 0]; '
        ':local ordered true; :local previousTier 0; :foreach q in=[/queue simple find] do={ '
        ':local tier 3; :if ([/queue simple get $q comment] ~ "^NISTER ACCOUNT SHAPER") do={ :set tier 0 }; '
        ':if ([/queue simple get $q name] = "nister-infra-management") do={ :set tier 1 }; '
        ':if ($q = $fallback) do={ :set tier 2 }; :if ($tier < $previousTier) do={ :set ordered false }; :set previousTier $tier; }; '
        ':if (!$ordered) do={ '
        ':local first [:pick [/queue simple find] 0]; :if ($fallback != $first) do={ /queue simple move $fallback $first }; '
        ':local infra [:pick [/queue simple find where name="nister-infra-management"] 0]; '
        '/queue simple move $infra $fallback; '
        ':foreach q in=[/queue simple find where comment~"^NISTER ACCOUNT SHAPER"] do={ /queue simple move $q $infra }; }; };')

    # Management exceptions must not also authorize downstream subscriber traffic.
    for label, address in [('TP-Link EAP225 on ether3', '192.168.88.10'), ('downstream AP/router on ether2', '192.168.88.2')]:
        comment = 'NISTER infra mgmt: ' + label
        yield 'infra-binding-' + address, ('{ :local ids [/ip hotspot ip-binding find where comment=' + ros_quote(comment) + ']; '
            ':if ([:len $ids] != 1) do={ :error "expected AP management exception missing or duplicated" }; '
            '/ip hotspot ip-binding set $ids address=' + address + ' to-address=' + address + ' server=hotspot1 type=bypassed; '
            ':local mac [/ip hotspot ip-binding get [:pick $ids 0] mac-address]; '
            ':foreach h in=[/ip hotspot host find where mac-address=$mac] do={ '
            ':if ([:tostr [/ip hotspot host get $h address]] != "' + address + '") do={ '
            ':if ([/ip hotspot host get $h bypassed]) do={ /ip hotspot host remove $h } } }; };')
        yield 'infra-list-' + address, upsert('/ip firewall address-list', {
            'list': 'NISTER_INFRA_MANAGEMENT', 'address': address, 'comment': 'NISTER management address ' + address})
    infra = [
        dict(chain='nister-infra-out', action='return', protocol='udp', **{'dst-port': '53,123', 'comment': 'NISTER INFRA DNS and NTP'}),
        dict(chain='nister-infra-out', action='return', protocol='tcp', **{'dst-port': '53', 'comment': 'NISTER INFRA TCP DNS'}),
        dict(chain='nister-infra-out', action='drop', **{'out-interface-list': 'WAN', 'comment': 'NISTER INFRA deny subscriber internet through management bypass'}),
        dict(chain='nister-infra-out', action='return', comment='NISTER INFRA return management traffic'),
        dict(chain='forward', action='jump', **{'jump-target': 'nister-infra-out', 'src-address-list': 'NISTER_INFRA_MANAGEMENT', 'in-interface': 'bridge', 'comment': 'NISTER INFRA management egress guard'}),
    ]
    yield 'infra-firewall', '\n'.join(upsert('/ip firewall filter', {**p, 'disabled': 'no'}) for p in infra) + (
        ' /ip firewall filter move [find where comment="NISTER INFRA management egress guard"] 0;')

    # Private management path for the owner, reached through SSH on the VPS.
    # No AP administration port is opened on either public WAN address.
    admin_rules = [
        dict(chain='forward', action='accept', protocol='tcp', **{
            'src-address': '10.99.99.1/32', 'in-interface': 'l2tp-over-vps',
            'dst-address-list': 'NISTER_INFRA_MANAGEMENT', 'dst-port': '80,443',
            'connection-state': 'new,established', 'comment': 'NISTER AP admin from VPS tunnel'}),
        dict(chain='forward', action='accept', protocol='tcp', **{
            'dst-address': '10.99.99.1/32', 'out-interface': 'l2tp-over-vps',
            'src-address-list': 'NISTER_INFRA_MANAGEMENT', 'src-port': '80,443',
            'connection-state': 'established', 'comment': 'NISTER AP admin replies to VPS tunnel'}),
    ]
    admin_commands = [upsert('/ip firewall filter', {**rule, 'disabled': 'no'}) for rule in admin_rules]
    for rule in admin_rules:
        admin_commands.append('{ :local id [:pick [/ip firewall filter find where comment=' + ros_quote(rule['comment']) +
            '] 0]; :local first [:pick [/ip firewall filter find] 0]; '
            ':if ($id != $first) do={ /ip firewall filter move $id $first }; };')
    admin_commands.append(upsert('/ip firewall nat', {
        'chain': 'srcnat', 'action': 'src-nat', 'src-address': '10.99.99.1/32',
        'dst-address-list': 'NISTER_INFRA_MANAGEMENT', 'out-interface': 'bridge',
        'protocol': 'tcp', 'dst-port': '80,443', 'to-addresses': '192.168.88.1',
        'disabled': 'no', 'comment': 'NISTER AP admin trusted tunnel source'}))
    yield 'infra-admin-tunnel', '\n'.join(admin_commands)

    # Torrents share the purchased account limit like other traffic. Retain the
    # old objects disabled for rollback, without ongoing L7 packet inspection.
    yield 'retire-p2p-throttle', (
        '/queue tree disable [find where name="nister-p2p-up"]; '
        '/queue tree disable [find where name="nister-p2p-down"]; '
        '/ip firewall mangle disable [find where comment~"^NISTER P2P "];')
    peer_rules = []
    for protocol, limit in [('tcp', 512), ('udp', 256)]:
        peer_rules.append(upsert('/ip firewall filter', {
            'chain': 'forward', 'action': 'drop', 'protocol': protocol,
            'connection-state': 'new', 'connection-limit': str(limit) + ',32',
            'in-interface': 'bridge', 'out-interface-list': 'WAN',
            'src-address-list': 'HS_ACTIVE', 'disabled': 'no',
            'comment': 'NISTER per-device peer ceiling ' + protocol}))
        peer_rules.append('{ :local id [:pick [/ip firewall filter find where comment=' +
            ros_quote('NISTER per-device peer ceiling ' + protocol) + '] 0]; '
            ':local before [:pick [/ip firewall filter find where comment="HG3_FWD_1_ACTIVE_ALLOW_ALL"] 0]; '
            ':if ([:len $before] = 0) do={ :error "active forward anchor missing" }; '
            '/ip firewall filter move $id $before; };')
    yield 'peer-connection-ceilings', '\n'.join(peer_rules)
    yield 'retire-quarantine', (
        '/ip firewall filter disable [find where chain="torrent-block"]; '
        '/ip firewall filter disable [find where comment="ANTI-TORRENT: inspect hotspot clients"]; '
        ':foreach c in={"HG3_FWD_P2P_L7_DROP_TCP";"HG3_FWD_P2P_PORTS_DROP_TCP";"HG3_FWD_P2P_PORTS_DROP_UDP"} do={ '
        '/ip firewall filter disable [find where comment=$c] };')
    # Production audit: no filter, NAT, raw, route, or queue consumes either
    # connection mark. These duplicate TLS inspections cannot grant access.
    # WG_AUTO address-list learning is separate and still has NAT consumers.
    yield 'retire-unused-tls-marks', (
        ':foreach mark in={"wg-allow";"preauth-ok"} do={ '
        '/ip firewall mangle disable [find where action="mark-connection" and new-connection-mark=$mark]; };')


def run(command, label):
    marker = 'NISTER_POLICY_OK_' + label
    # RouterOS SSH accepts one CLI line. Hook line breaks are already escaped
    # inside ros_quote(); only statement separators are flattened here.
    command = command.replace('\r\n', '\n').replace('\n', ' ')
    args = ['ssh', '-b', os.environ.get('VPS_TUNNEL_IP', '10.99.99.1'),
        '-i', os.environ.get('ROUTER_SSH_KEY_ON_VPS', '/root/.ssh/mikrotik_certsync'),
        '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=6', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
        os.environ.get('ROUTER_USER', 'certsync') + '@' + os.environ.get('ROUTER_HOST', '10.10.20.2'),
        ':do { ' + command + ' :put ' + ros_quote(marker) + ' } on-error={ :put "NISTER_POLICY_FAILED"; }']
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    output = result.stdout + result.stderr
    evidence = os.environ.get('NISTER_POLICY_EVIDENCE_DIR')
    if evidence:
        (Path(evidence) / ('stage-' + label + '.txt')).write_text(output, encoding='utf-8')
    if result.returncode or marker not in output or re.search(r'(?im)(failure:|syntax error|expected end of command|not enough permissions|input does not match|^Script Error)', output):
        # Commands and outputs can contain account identifiers; keep failure output local.
        raise RuntimeError('Router policy stage failed: ' + label + '; inspect restricted deployment evidence')
    print('status=ok stage=' + label, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--policy-dir', type=Path, default=Path(os.environ.get('NISTER_POLICY_DIR', '/usr/local/share/nister/hotspot-policy')))
    parser.add_argument('--render', action='store_true', help='Print generated commands without connecting')
    parser.add_argument('--only', action='append', default=[], help='Run only the named deployment stage')
    parser.add_argument('--parse-only', action='store_true', help='Compile commands on the router without applying them')
    args = parser.parse_args()
    lock_file = None
    if not args.render:
        import fcntl
        lock_file = open('/run/nister_hotspot_policy.lock', 'a')
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('status=skipped reason=policy_sync_in_progress')
            return
    stages = list(commands(args.policy_dir))
    for label, command in stages:
        if args.only and label not in args.only:
            continue
        if args.render:
            print('# ' + label + '\n' + command)
        elif args.parse_only:
            run(':local candidate [:parse ' + ros_quote(command) + '];', 'parse-' + label)
        else:
            run(command, label)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print('status=error ' + str(error), file=sys.stderr)
        sys.exit(1)
