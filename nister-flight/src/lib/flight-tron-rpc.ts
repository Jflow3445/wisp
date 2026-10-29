type RpcOptions = {
  intervalMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  fetcher?: typeof fetch;
};

// One shared queue per node/key prevents scans and payment verification from
// combining into an upstream burst. A provider cooldown pauses the whole queue.
export function createTronRpcClient(options: RpcOptions = {}) {
  const interval = options.intervalMs ?? 200;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const fetcher: typeof fetch = options.fetcher ?? ((...args) => fetch(...args));
  const queues = new Map<string, { tail: Promise<void>; next: number; cooldown: number }>();
  return async function request(node: string, path: string, body: Record<string, unknown>, apiKey: string | null) {
    const base = node.replace(/\/+$/, ""), route = path.startsWith("/") ? path : `/${path}`;
    const scope = `${new URL(base).origin}:${apiKey ?? "public"}`;
    let queue = queues.get(scope);
    if (!queue) { queue = { tail: Promise.resolve(), next: 0, cooldown: 0 }; queues.set(scope, queue); }
    const state = queue;
    for (let attempt = 0; attempt < 3; attempt++) {
      const slot = state.tail.then(async () => {
        while (Math.max(state.next, state.cooldown) > now()) await wait(Math.max(state.next, state.cooldown) - now());
        state.next = now() + interval;
      });
      state.tail = slot.catch(() => {});
      await slot;
      const response = await fetcher(`${base}${route}`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", ...(apiKey ? { "TRON-PRO-API-KEY": apiKey } : {}) },
        body: JSON.stringify(body),
      });
      if (response.ok) return response.json();
      const message = await response.text();
      const temporary = response.status === 429 || (response.status === 403 && /frequency|rate.limit|suspended/i.test(message));
      if (!temporary) throw new Error(`TRON RPC ${route} failed: HTTP ${response.status}`);
      const retryAfter = response.headers.get("retry-after");
      const headerDelay = retryAfter ? (/^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now()) : 0;
      const suspension = Number(message.match(/suspended\s+for\s+(\d+)\s*s/i)?.[1] ?? 0) * 1000;
      const delay = Math.max(headerDelay || 0, suspension, 1000 * 2 ** attempt + Math.floor(Math.random() * 250));
      state.cooldown = Math.max(state.cooldown, now() + Math.min(120000, delay));
      if (attempt === 2) throw new Error(`TRON RPC ${route} is rate limited. Confirmation will be retried; do not resend the transfer.`);
    }
    throw new Error("TRON RPC unavailable.");
  };
}
