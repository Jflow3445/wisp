import type { ErrorResponse, ObjectResponse } from "@nister/contracts";
import type { z } from "zod";
import { commerceApiRoutes, type CommerceApiRouteMethod } from "./generated/routes.js";

export class CommerceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "CommerceApiError";
  }
}

export interface CommerceClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  enforceContract?: boolean;
}

function routeTemplateToRegExp(template: string): RegExp {
  const escaped = template
    .split("/")
    .map((segment) => {
      if (/^\{[^/{}]+\}$/.test(segment)) return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

const routeMatchers = commerceApiRoutes.map((route) => ({
  method: route.method,
  path: route.path,
  exact: !route.path.includes("{"),
  pattern: routeTemplateToRegExp(route.path),
}));

export function isDocumentedCommerceRoute(method: string, path: string): boolean {
  const upperMethod = method.toUpperCase() as CommerceApiRouteMethod;
  const pathname = path.startsWith("http") ? new URL(path).pathname : new URL(path, "https://market-api.nister.org").pathname;
  return routeMatchers.some((route) => route.method === upperMethod && (route.exact ? route.path === pathname : route.pattern.test(pathname)));
}

export function createCommerceClient(options: CommerceClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  const enforceContract = options.enforceContract ?? true;

  return {
    async object<T>(path: string, schema: z.ZodType<T>, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
      const method = init.method ?? "GET";
      if (enforceContract && !isDocumentedCommerceRoute(method, path)) {
        throw new CommerceApiError(
          0,
          "UNDOCUMENTED_API_ROUTE",
          `The ${method.toUpperCase()} ${new URL(path, options.baseUrl).pathname} route is not present in the generated marketplace API contract.`,
          "local-contract",
        );
      }

      const token = await options.getAccessToken?.();
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("X-Request-ID", crypto.randomUUID());
      if (init.body) headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);

      const response = await request(new URL(path, options.baseUrl), { ...init, method, headers });
      const body = (await response.json()) as ObjectResponse<unknown> | ErrorResponse;
      if (!response.ok && "error" in body) {
        throw new CommerceApiError(response.status, body.error.code, body.error.message, body.error.requestId, body.error.fields);
      }
      if (!("data" in body)) {
        throw new CommerceApiError(response.status, "INVALID_API_RESPONSE", "The API returned an invalid response.", response.headers.get("x-request-id") ?? "unknown");
      }
      return schema.parse(body.data);
    },
  };
}
