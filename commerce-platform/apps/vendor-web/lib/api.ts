import { dashboard, financeEntries, onboardingSteps, orders, products } from "./demo-data";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const fixtures: Record<string, unknown> = {
  "/vendor/dashboard": dashboard,
  "/vendor/orders": orders,
  "/vendor/products": products,
  "/vendor/finance": financeEntries,
  "/vendor/onboarding": onboardingSteps,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_COMMERCE_API_URL;
  if (!baseUrl) {
    const orderMatch = path.match(/^\/vendor\/orders\/([^/]+)$/);
    const fixture = orderMatch ? orders.find((order) => order.id === orderMatch[1] || order.reference === orderMatch[1]) : fixtures[path];

    if (init?.method && init.method !== "GET") {
      return clone({ ok: true, requestId: crypto.randomUUID() } as T);
    }
    if (fixture === undefined) throw new ApiError("Resource not found", 404, "RESOURCE_NOT_FOUND");
    return clone(fixture as T);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
    cache: init?.method && init.method !== "GET" ? "no-store" : "no-cache",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(body?.error?.message ?? "The marketplace API request failed", response.status, body?.error?.code ?? "REQUEST_FAILED");
  }
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiCommand<TBody extends object>(path: string, body: TBody): Promise<{ ok: boolean; requestId: string }> {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
}
