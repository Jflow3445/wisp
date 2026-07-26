import type { ErrorResponse, ObjectResponse } from "@nister/contracts";
import type { z } from "zod";

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
}

export function createCommerceClient(options: CommerceClientOptions) {
  const request = options.fetch ?? globalThis.fetch;

  return {
    async object<T>(path: string, schema: z.ZodType<T>, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
      const token = await options.getAccessToken?.();
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("X-Request-ID", crypto.randomUUID());
      if (init.body) headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);

      const response = await request(new URL(path, options.baseUrl), { ...init, headers });
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
