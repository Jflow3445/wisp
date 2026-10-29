const mode = process.argv[2] === "payments" ? "payments/watch" : "flight/settle";
const token = process.env.CONTROL_PLANE_INTERNAL_TOKEN?.trim();
if (!token) throw new Error("Internal watcher token is not configured.");
const response = await fetch(`http://127.0.0.1:3011/api/internal/v1/${mode}`, {
  method: "POST",
  signal: AbortSignal.timeout(55000),
  headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json", host: "nisterai.com", "x-forwarded-proto": "https", "x-forwarded-for": "127.0.0.1" },
  body: mode === "payments/watch" ? JSON.stringify({ max_blocks: 100 }) : "{}",
});
if (!response.ok) throw new Error(`Watcher returned HTTP ${response.status}.`);
console.log(JSON.stringify({ watcher: mode, status: "ok" }));
