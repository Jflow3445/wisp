#!/usr/bin/env python3
"""Exercise RADIUS admission using reserved temporary identities, never subscribers."""
import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence-dir', type=Path, required=True)
    args = parser.parse_args()
    users = ('0000000000', '233000000000')
    predicate = "username IN ('0000000000','233000000000')"
    token = 'nister-policy-' + uuid.uuid4().hex[:16]
    password = secrets.token_urlsafe(24)

    def sql(query):
        result = subprocess.run(['mariadb', '--batch', '--skip-column-names', 'radius'],
                                input=query, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Test SQL failed: ' + result.stderr.replace(password, '[TEST PASSWORD]')[-600:])
        return result.stdout.strip()

    for table in ('radcheck', 'radreply', 'radusergroup', 'radacct', 'radpostauth'):
        if sql(f'SELECT COUNT(*) FROM {table} WHERE {predicate};') != '0':
            raise RuntimeError('Reserved test identity is not unused; no subscriber changed')
    config = Path('/etc/freeradius/3.0/clients.conf').read_text()
    block = re.search(r'client\s+localhost\s*\{(.*?)\n\}', config, re.S).group(1)
    secret = re.search(r'(?m)^\s*secret\s*=\s*(.*?)\s*$', block).group(1).strip('"')
    results = []
    with tempfile.NamedTemporaryFile(mode='w', dir=args.evidence_dir, prefix='radius-local-', suffix='.secret') as secret_file:
        secret_file.write(secret + '\n')
        secret_file.flush()
        try:
            for user in users:
                sql("INSERT INTO radcheck(username,attribute,op,value) VALUES "
                    f"('{user}','Cleartext-Password',':=','{password}'),"
                    f"('{user}','Simultaneous-Use',':=','2'); "
                    # The existing password trigger can create this group first.
                    "INSERT INTO radusergroup(username,groupname,priority) VALUES "
                    f"('{user}','HS_NOPAID',0) ON DUPLICATE KEY UPDATE priority=0;")
            for count in range(4):
                if count in (1, 2):
                    user = users[(count - 1) % 2]
                    sql("INSERT INTO radacct(acctsessionid,acctuniqueid,username,nasipaddress,nasportid,"
                        "acctstarttime,acctupdatetime,framedipaddress,callingstationid,acctinputoctets,acctoutputoctets) VALUES "
                        f"('{token}-{count}','{uuid.uuid4().hex}','{user}','10.10.20.4','2147483000',"
                        f"UTC_TIMESTAMP(),UTC_TIMESTAMP(),'192.0.2.{239 + count}','02:00:00:FA:00:{count:02X}',0,0);")
                request_mac = 1 if count == 3 else count + 1
                request = (f'User-Name = "{users[count % 2]}"\nUser-Password = "{password}"\n'
                           'NAS-IP-Address = 10.10.20.4\nNAS-Port = 2147483000\n'
                           'NAS-Port-Type = Wireless-802.11\nService-Type = Login-User\n'
                           f'Calling-Station-Id = "02:00:00:FA:00:{request_mac:02X}"\nMessage-Authenticator = 0x00\n')
                process = subprocess.run(['radclient', '-x', '-r', '1', '-t', '3', '-S', secret_file.name,
                                          '127.0.0.1', 'auth'], input=request, capture_output=True, text=True, timeout=10)
                output = process.stdout + process.stderr
                (args.evidence_dir / f'probe-auth-{count}.txt').write_text(output.replace(password, '[TEST PASSWORD]'))
                reply = next((code for code in ('Access-Accept', 'Access-Reject') if 'Received ' + code in output), 'NO_VALID_REPLY')
                row = dict(existing_test_devices=min(count, 2), reauth_existing_device=count == 3,
                           reply=reply, expected='Access-Reject' if count == 2 else 'Access-Accept')
                results.append(row)
                print(json.dumps(row), flush=True)
        finally:
            # Retain normal audit trail records; remove only our temporary fixtures.
            sql(f"DELETE FROM radacct WHERE acctsessionid LIKE '{token}-%'; " +
                ' '.join(f'DELETE FROM {table} WHERE {predicate};' for table in
                         ('radpostauth', 'radreply', 'radusergroup', 'radcheck')))
            print('TEST_IDENTITIES_AND_ACCOUNTING_REMOVED', flush=True)
    (args.evidence_dir / 'radius-device-limit-probe.json').write_text(json.dumps(results, indent=2))
    if not all(row['reply'] == row['expected'] for row in results):
        raise RuntimeError('RADIUS device admission did not meet the expected two-device limit')


if __name__ == '__main__':
    main()
