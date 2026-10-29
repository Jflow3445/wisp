"""Create an isolated test DB and keep a loopback-only SSH tunnel open."""
import json
from pathlib import Path
import secrets
import select
import socketserver
import threading

from remote import connect

password = secrets.token_hex(24)
client = connect()
sql = "CREATE DATABASE IF NOT EXISTS nister_flight_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
for host in ["localhost", "127.0.0.1"]:
    sql += f"CREATE USER IF NOT EXISTS 'nister_flight_test'@'{host}' IDENTIFIED BY '{password}';ALTER USER 'nister_flight_test'@'{host}' IDENTIFIED BY '{password}';GRANT ALL ON nister_flight_test.* TO 'nister_flight_test'@'{host}';"
stdin, stdout, stderr = client.exec_command("sudo -n mysql", timeout=30)
stdin.write(sql)
stdin.channel.shutdown_write()
if stdout.channel.recv_exit_status():
    raise RuntimeError(stderr.read().decode())
port = 33316
admin_password = secrets.token_urlsafe(20)
env = Path(__file__).resolve().parents[1] / ".env.test"
env.write_text(f'DATABASE_URL="mysql://nister_flight_test:{password}@127.0.0.1:{port}/nister_flight_test"\nSESSION_SECRET="{secrets.token_hex(32)}"\nAPP_BASE_URL="http://localhost:3330"\nFLIGHT_TEST_PASSWORD="{admin_password}"\n', encoding="utf-8")

class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        channel = client.get_transport().open_channel("direct-tcpip", ("127.0.0.1", 3306), self.request.getpeername())
        try:
            while True:
                ready, _, _ = select.select([self.request, channel], [], [], 30)
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (channel if source is self.request else self.request).sendall(data)
        finally:
            channel.close()

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

print(json.dumps({"isolated_database": "nister_flight_test", "tunnel": f"127.0.0.1:{port}", "env_file": str(env)}), flush=True)
try:
    with Server(("127.0.0.1", port), Handler) as server:
        server.serve_forever()
finally:
    client.close()
