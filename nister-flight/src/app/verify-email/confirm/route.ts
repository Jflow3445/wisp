import { NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email-verification";
import { toPublicUrl } from "@/lib/public-url";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();

  if (!token) {
    return NextResponse.redirect(toPublicUrl("/verify-email?error=Missing+verification+token", request));
  }

  const result = await verifyEmailToken(token);
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "Verification+link+expired.+Request+a+new+email."
        : result.reason === "used"
          ? "Verification+link+already+used."
          : "Invalid+verification+link.";
    return NextResponse.redirect(toPublicUrl(`/verify-email?error=${message}`, request));
  }

  return NextResponse.redirect(toPublicUrl("/login?success=Email+verified.+You+can+log+in+now", request));
}
