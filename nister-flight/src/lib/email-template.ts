import { getPublicAppBaseUrl } from "@/lib/public-url";

export type EmailHeaderValue = string | string[];

export type PremiumEmailMessage = {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, EmailHeaderValue>;
};

export type PremiumEmailCategory =
  | "account"
  | "security"
  | "support"
  | "onboarding"
  | "payment"
  | "runtime"
  | "marketing"
  | "general";

export type EmailDetailRow = {
  label: string;
  value: string | number | null | undefined;
};

type PremiumEmailInput = {
  subject?: string | null;
  preheader?: string | null;
  eyebrow?: string | null;
  title?: string | null;
  recipientName?: string | null;
  body?: string | string[] | null;
  textBody?: string | string[] | null;
  cta?: {
    label?: string | null;
    url?: string | null;
  } | null;
  details?: EmailDetailRow[] | null;
  category?: PremiumEmailCategory;
  footerNote?: string | null;
  headers?: Record<string, EmailHeaderValue>;
};

const DEFAULT_SUBJECT = "Nister AI account update";
const DEFAULT_CTA_LABEL = "Review your account";

function compact(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttribute(value: string | number | null | undefined) {
  return escapeHtml(value);
}

export function stripHtmlTags(value: string | null | undefined) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphList(body: string | string[] | null | undefined) {
  const entries = Array.isArray(body) ? body : [String(body || "")];
  const paragraphs = entries
    .flatMap((entry) => String(entry || "").split(/\n{2,}/))
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paragraphs.length) {
    return paragraphs;
  }
  return ["A new update is available for your Nister AI account."];
}

function defaultDashboardUrl() {
  return `${getPublicAppBaseUrl()}/dashboard`;
}

export function normalizeEmailUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) {
    return defaultDashboardUrl();
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${getPublicAppBaseUrl()}${path}`;
}

function deriveFirstName(name: string | null | undefined) {
  const clean = compact(name);
  if (!clean) {
    return "there";
  }
  return clean.split(" ")[0] || clean;
}

function categoryEyebrow(category: PremiumEmailCategory) {
  if (category === "security") return "Account Security";
  if (category === "support") return "Support";
  if (category === "onboarding") return "Activation";
  if (category === "payment") return "Payment";
  if (category === "runtime") return "Runtime Notice";
  if (category === "marketing") return "Nister AI Update";
  if (category === "account") return "Account";
  return "Account Update";
}

function footerCopy(category: PremiumEmailCategory, footerNote?: string | null, unsubscribeUrl?: string | null) {
  const custom = compact(footerNote);
  if (custom) {
    return custom;
  }
  if (category === "security") {
    return "This security message was sent to help protect your Nister AI account. If you did not request this action, you can ignore this email or contact support from your dashboard.";
  }
  if (category === "support") {
    return "Need to add more detail? Reply from your dashboard support thread so your case history stays in one place.";
  }
  if (category === "payment") {
    return "Payment and billing messages reflect the latest account records available to Nister AI. Contact support from your dashboard if anything looks wrong.";
  }
  if (category === "runtime") {
    return "Trading automation involves risk. Review your controls, broker account, and runtime state before making changes or going live.";
  }
  if (category === "marketing") {
    return unsubscribeUrl
      ? "You are receiving this lifecycle and product update from Nister AI. You can manage email preferences from the link in this message."
      : "You are receiving this lifecycle and product update from Nister AI because you created an account or joined a product flow.";
  }
  return "This account message was sent by Nister AI. Keep your email address current so important account and automation notices reach you.";
}

function renderDetails(details: EmailDetailRow[] | null | undefined) {
  const rows = (details || [])
    .map((row) => ({
      label: compact(row.label),
      value: compact(String(row.value ?? "")),
    }))
    .filter((row) => row.label && row.value);

  if (!rows.length) {
    return { html: "", text: "" };
  }

  const htmlRows = rows
    .map(
      (row) => `
                    <tr>
                      <td style="padding:8px 0;color:#64748b;font-size:13px;line-height:18px;">${escapeHtml(row.label)}</td>
                      <td style="padding:8px 0;color:#0f172a;font-size:13px;line-height:18px;font-weight:700;text-align:right;">${escapeHtml(row.value)}</td>
                    </tr>`,
    )
    .join("");

  const text = rows.map((row) => `${row.label}: ${row.value}`).join("\n");
  return {
    html: `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #dbe4ee;border-radius:8px;background:#f8fafc;">
                <tr>
                  <td style="padding:14px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${htmlRows}
                    </table>
                  </td>
                </tr>
              </table>`,
    text,
  };
}

function renderBodyParagraphs(paragraphs: string[]) {
  return paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:24px;">${escapeHtml(paragraph)}</p>`,
    )
    .join("\n");
}

export function renderPremiumEmail(input: PremiumEmailInput): PremiumEmailMessage {
  const category = input.category || "general";
  const subject = compact(input.subject) || DEFAULT_SUBJECT;
  const title = compact(input.title) || subject;
  const preheader = compact(input.preheader) || title;
  const eyebrow = compact(input.eyebrow) || categoryEyebrow(category);
  const ctaLabel = compact(input.cta?.label) || DEFAULT_CTA_LABEL;
  const ctaUrl = normalizeEmailUrl(input.cta?.url);
  const firstName = deriveFirstName(input.recipientName);
  const paragraphs = paragraphList(input.body);
  const textParagraphs = typeof input.textBody === "undefined" ? paragraphs : paragraphList(input.textBody);
  const details = renderDetails(input.details);
  const unsubscribeUrl = compact(String(input.headers?.["List-Unsubscribe"] || "")).replace(/^<|>$/g, "");
  const footer = footerCopy(category, input.footerNote, unsubscribeUrl);

  const bodyHtml = renderBodyParagraphs(paragraphs);
  const safeCtaUrl = escapeAttribute(ctaUrl);
  const safeCtaLabel = escapeHtml(ctaLabel);

  const textParts = [
    subject,
    "",
    `Hi ${firstName},`,
    "",
    ...textParagraphs,
  ];
  if (details.text) {
    textParts.push("", details.text);
  }
  textParts.push("", `${ctaLabel}: ${ctaUrl}`, "", footer, "", "Nister AI");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#eef2f6;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dbe4ee;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:22px 28px;border-bottom:1px solid #e2e8f0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#0f172a;font-size:16px;line-height:20px;font-weight:800;letter-spacing:0;">Nister AI</td>
                    <td align="right" style="color:#64748b;font-size:12px;line-height:18px;">Account message</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 28px;">
                <p style="margin:0 0 10px;color:#0f766e;font-size:12px;line-height:18px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(eyebrow)}</p>
                <h1 style="margin:0 0 18px;color:#0f172a;font-size:28px;line-height:34px;font-weight:800;letter-spacing:0;">${escapeHtml(title)}</h1>
                <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:24px;">Hi ${escapeHtml(firstName)},</p>
${bodyHtml}
${details.html}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 18px;">
                  <tr>
                    <td bgcolor="#0f766e" style="border-radius:5px;">
                      <a href="${safeCtaUrl}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:14px;line-height:18px;font-weight:800;text-decoration:none;border-radius:5px;">${safeCtaLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;color:#64748b;font-size:12px;line-height:19px;">If the button does not work, copy this link:<br><a href="${safeCtaUrl}" style="color:#0f766e;text-decoration:underline;word-break:break-all;">${escapeHtml(ctaUrl)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#64748b;font-size:12px;line-height:19px;">${escapeHtml(footer)}</p>
                <p style="margin:14px 0 0;color:#94a3b8;font-size:11px;line-height:17px;">Nister AI</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    text: textParts.join("\n"),
    html,
    headers: input.headers,
  };
}

export function buildVerificationEmail(input: { name: string; verifyUrl: string }) {
  return renderPremiumEmail({
    subject: "Verify your Nister AI email",
    preheader: "Confirm your email address to continue activating your Nister AI account.",
    title: "Verify your email before activation",
    recipientName: input.name,
    category: "security",
    body: [
      "Confirm this email address so your dashboard, billing status, and runtime connection remain tied to one account.",
      "This verification link expires in 24 hours. If you did not create a Nister AI account, no action is needed.",
    ],
    details: [{ label: "Link expiry", value: "24 hours" }],
    cta: {
      label: "Verify email",
      url: input.verifyUrl,
    },
  });
}

export function buildPasswordResetEmail(input: { name: string; resetUrl: string }) {
  return renderPremiumEmail({
    subject: "Reset your Nister AI password",
    preheader: "Use this secure link to reset your Nister AI password. It expires in 1 hour.",
    title: "Reset your password",
    recipientName: input.name,
    category: "security",
    body: [
      "Use the secure link below to set a new password for your Nister AI account.",
      "This reset link expires in 1 hour. If you did not request a password reset, you can ignore this email.",
    ],
    details: [{ label: "Link expiry", value: "1 hour" }],
    cta: {
      label: "Reset password",
      url: input.resetUrl,
    },
  });
}

export function buildSupportTicketReceivedEmail(input: {
  name: string;
  ticketId: string;
  ticketSubject: string;
  dashboardUrl?: string | null;
}) {
  return renderPremiumEmail({
    subject: `Support ticket received (${input.ticketId})`,
    preheader: `We received your support request: ${input.ticketSubject}`,
    title: "Support ticket received",
    recipientName: input.name,
    category: "support",
    body: "We received your ticket and will respond as soon as possible. Keep the reference below for follow-up.",
    details: [
      { label: "Reference", value: input.ticketId },
      { label: "Subject", value: input.ticketSubject },
    ],
    cta: {
      label: "Open support",
      url: input.dashboardUrl || "/dashboard/support",
    },
  });
}

export function buildNotificationEmail(input: {
  recipientName: string | null | undefined;
  title: string;
  message: string;
  subject?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  category?: PremiumEmailCategory;
  details?: EmailDetailRow[] | null;
  htmlBody?: string | null;
  textOverride?: string | null;
}) {
  const htmlBody = compact(input.htmlBody);
  const textBody = htmlBody ? stripHtmlTags(htmlBody) || input.message : input.message;
  const rendered = renderPremiumEmail({
    subject: input.subject || input.title,
    preheader: input.message,
    title: input.title,
    recipientName: input.recipientName,
    category: input.category || "account",
    body: htmlBody || input.message,
    textBody,
    details: input.details || null,
    cta: {
      label: input.actionLabel || "Review your account",
      url: input.actionUrl || "/dashboard",
    },
  });
  if (compact(input.textOverride)) {
    return {
      ...rendered,
      text: input.textOverride as string,
    };
  }
  return rendered;
}

export function buildMarketingEmail(input: {
  recipientName: string | null | undefined;
  subject: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  unsubscribeUrl?: string | null;
}) {
  const unsubscribeUrl = compact(input.unsubscribeUrl);
  const headers = unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;
  return renderPremiumEmail({
    subject: input.subject,
    preheader: input.body,
    title: input.subject,
    recipientName: input.recipientName,
    category: "marketing",
    body: input.body,
    cta: {
      label: input.ctaLabel || "Continue",
      url: input.ctaUrl || "/dashboard",
    },
    headers,
  });
}
