#!/usr/bin/env python3
"""Reconcile the existing NISTER router's subscriber controls over its SSH tunnel."""
import argparse
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


def upsert(menu, properties, key='comment'):
    selector = f'{key}={ros_quote(properties[key])}'
    values = ' '.join(f'{name}={ros_quote(value)}' for name, value in properties.items())
    return ('{ :local ids [' + menu + ' find where ' + selector + ']; '
            ':if ([:len $ids] = 0) do={ ' + menu + ' add ' + values + ' } '
            'else={ :local keep [:pick $ids 0]; ' + menu + ' set $keep ' + values + '; '
            ':foreach id in=$ids do={ :if ($id != $keep) do={ ' + menu + ' remove $id } } } };')


def commands(policy_dir):
    login = (policy_dir / 'hotspot_account_login.rsc').read_text(encoding='utf-8').strip()
    logout = (policy_dir / 'hotspot_account_logout.rsc').read_text(encoding='utf-8').strip()
    if not login or not logout:
        raise ValueError('HotSpot admission hooks must not be empty')
    # Parse every hook before changing production policies.
    yield 'parse-hooks', f':local a [:parse {ros_quote(login)}]; :local b [:parse {ros_quote(logout)}];'
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
        'burst-limit': '0/0', 'queue': 'default-small/default-small', 'disabled': 'no'}, 'name') + upsert('/queue simple', {
        'name': 'nister-infra-management', 'comment': 'NISTER dedicated AP management queue',
        'target': '192.168.88.10/32,192.168.88.2/32', 'max-limit': '5M/5M', 'limit-at': '0/0',
        'priority': '1/1', 'burst-limit': '0/0', 'queue': 'default-small/default-small', 'disabled': 'no'}, 'name') + (
        ' /queue simple move [find where name="nister-unclassified"] 0; '
        '/queue simple move [find where name="nister-infra-management"] 0; '
        ':foreach q in=[/queue simple find where comment~"^NISTER ACCOUNT SHAPER"] do={ /queue simple move $q 0 };')

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

    yield 'torrent-patterns', upsert('/ip firewall layer7-protocol', {
        'name': 'nister-bittorrent', 'regexp': 'bittorrent protocol'}, 'name') + upsert('/ip firewall layer7-protocol', {
        'name': 'nister-dht', 'regexp': '^d1:ad2:id20:|^d1:rd2:id20:|^d1:q4:ping|^d1:q9:find_node|^d1:q9:get_peers|^d1:q13:announce_peer'}, 'name')
    mangle = []
    for direction, field in [('out', 'src-address-list'), ('in', 'dst-address-list')]:
        mangle.append(dict(chain='forward', action='jump', **{'jump-target': 'nister-p2p-classify', 'connection-mark': 'no-mark',
            field: 'HS_ACTIVE', 'comment': 'NISTER P2P inspect ' + direction}))
    for protocol in ['tcp', 'udp']:
        for field in ['dst-port', 'src-port']:
            mangle.append(dict(chain='nister-p2p-classify', action='mark-connection', protocol=protocol,
                **{field: '6881-6999,51413,6969', 'new-connection-mark': 'nister-p2p', 'passthrough': 'yes',
                   'comment': 'NISTER P2P classic ' + protocol + ' ' + field}))
    for protocol, pattern in [('tcp', 'nister-bittorrent'), ('udp', 'nister-dht')]:
        mangle.append(dict(chain='nister-p2p-classify', action='mark-connection', protocol=protocol,
            **{'layer7-protocol': pattern, 'connection-bytes': '0-8192', 'connection-state': 'new,established',
               'new-connection-mark': 'nister-p2p', 'passthrough': 'yes', 'comment': 'NISTER P2P payload ' + protocol}))
    mangle.append(dict(chain='nister-p2p-classify', action='return', comment='NISTER P2P classifier return'))
    for direction, field in [('up', 'src-address-list'), ('down', 'dst-address-list')]:
        mangle.append(dict(chain='forward', action='mark-packet', **{'connection-mark': 'nister-p2p', field: 'HS_ACTIVE',
            'new-packet-mark': 'nister-p2p-' + direction, 'passthrough': 'no', 'comment': 'NISTER P2P packets ' + direction}))
    yield 'torrent-classification', '\n'.join(upsert('/ip firewall mangle', {**p, 'disabled': 'no'}) for p in mangle)
    yield 'torrent-queues', '\n'.join(upsert('/queue tree', {
        'name': 'nister-p2p-' + direction, 'parent': 'global', 'packet-mark': 'nister-p2p-' + direction,
        'max-limit': '256k', 'limit-at': '0', 'priority': '8', 'queue': 'default-small', 'disabled': 'no',
        'comment': 'NISTER identified P2P aggregate ' + direction + ' 256kbps'}, 'name') for direction in ['up', 'down'])
    yield 'retire-quarantine', (
        '/ip firewall filter disable [find where chain="torrent-block"]; '
        '/ip firewall filter disable [find where comment="ANTI-TORRENT: inspect hotspot clients"]; '
        ':foreach c in={"HG3_FWD_P2P_L7_DROP_TCP";"HG3_FWD_P2P_PORTS_DROP_TCP";"HG3_FWD_P2P_PORTS_DROP_UDP"} do={ '
        '/ip firewall filter disable [find where comment=$c] };')


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
