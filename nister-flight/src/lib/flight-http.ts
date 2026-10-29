import { getCurrentUser } from "@/lib/auth";
import { applyRateLimit, enforceJsonContentType, enforceTrustedOrigin, readRequestBodyTextWithLimit } from "@/lib/request-security";

export async function authorize(request: Request, admin = false, pilot = false) {
  const user = await getCurrentUser();
  if (!user || (admin && user.role !== "ADMIN")) throw new HttpError(admin ? 403 : 401, "Please sign in with the required account.");
  if (["SUSPENDED", "CLOSED"].includes(user.tradingProfile?.accountState ?? "")) throw new HttpError(403, "Your account is restricted. Contact support.");
  if (request.method !== "GET") {
    const origin = enforceTrustedOrigin(request, { allowMissingOrigin: false });
    if (!origin.ok) throw new HttpError(origin.status, origin.message);
    const type = enforceJsonContentType(request);
    if (!type.ok) throw new HttpError(type.status, type.message);
  }
  const rate = await applyRateLimit({ key: `flight:${admin ? "admin" : "user"}:${pilot ? "pilot" : "actions"}:${request.method}:${user.id}`, maxAttempts: pilot ? 420 : request.method === "GET" ? 240 : 45, windowMs: 60000, failOpen: false });
  if (!rate.allowed) throw new HttpError(429, "Too many requests. Please wait a moment.");
  return user;
}

export async function body(request: Request) {
  const read = await readRequestBodyTextWithLimit(request, 8192);
  if (!read.ok) throw new HttpError(read.status, read.message);
  try { return JSON.parse(read.text); } catch { throw new HttpError(400, "Invalid JSON."); }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "issues" in error) return Response.json({ error: "Check the submitted fields and try again." }, { status: 422 });
  if (error && typeof error === "object" && "code" in error) {
    console.error("[flight] database operation failed", (error as { code: unknown }).code);
    return Response.json({ error: "This request could not be completed. Refresh to recover its status before retrying." }, { status: 503 });
  }
  if (error instanceof Error && /(?:fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|TRON.*(?:request|RPC)|rate.limit|upstream|https?:\/\/|Invalid.*prisma|Cannot read properties|must be configured|DATABASE_URL|SESSION_SECRET|[A-Z_]+_(?:KEY|URL)|prisma\.)/i.test(error.message)) {
    console.error("[flight] upstream request unavailable");
    return Response.json({ error: "This service is temporarily unavailable. Refresh to recover your request before retrying." }, { status: 503 });
  }
  return Response.json({ error: error instanceof Error ? error.message : "Request unavailable. Please retry." }, { status: 400 });
}
