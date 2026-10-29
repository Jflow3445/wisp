import assert from "node:assert/strict";
import { test } from "node:test";
import { createTronRpcClient } from "../flight-tron-rpc";

test("concurrent node requests are paced across a shared API key", async () => {
  let time = 0;
  const starts: number[] = [];
  const client = createTronRpcClient({ intervalMs: 200, now: () => time, wait: async ms => { time += ms; }, fetcher: (async () => { starts.push(time); return Response.json({ ok: true }); }) as typeof fetch });
  await Promise.all(Array.from({ length: 20 }, () => client("https://tron-test.invalid", "/walletsolidity/getnowblock", {}, "test-key")));
  assert.equal(starts.length, 20);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 200);
});

test("429 retries respect the provider cooldown and preserve the same request", async () => {
  let time = 0, attempts = 0;
  const bodies: string[] = [], starts: number[] = [];
  const client = createTronRpcClient({ now: () => time, wait: async ms => { time += ms; }, fetcher: (async (_url, init) => {
    bodies.push(String(init?.body)); starts.push(time);
    return attempts++ === 0 ? new Response('{"Error":"The key exceeds the frequency limit, and the query server is suspended for 23 s"}', { status: 429, headers: { "Retry-After": "2" } }) : Response.json({ confirmed: true });
  }) as typeof fetch });
  assert.deepEqual(await client("https://tron-test.invalid", "/walletsolidity/gettransactioninfobyid", { value: "same-hash" }, "test-key"), { confirmed: true });
  assert.equal(attempts, 2); assert.equal(bodies[0], bodies[1]); assert.ok(starts[1] - starts[0] >= 23000);
});

test("invalid API credentials are rejected without a retry burst", async () => {
  let attempts = 0;
  const client = createTronRpcClient({ fetcher: (async () => { attempts++; return new Response("Invalid API key", { status: 403 }); }) as typeof fetch });
  await assert.rejects(() => client("https://tron-test.invalid", "/walletsolidity/getnowblock", {}, "invalid"), /HTTP 403/);
  assert.equal(attempts, 1);
});
