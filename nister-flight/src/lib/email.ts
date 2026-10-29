import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

export type EmailSettingsView = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string;
  secure: boolean;
};

type EmailSettingsWithSecret = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  secure: boolean;
};

const defaultEmailSettings: EmailSettingsWithSecret = {
  enabled: false,
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT || 587),
  username: process.env.SMTP_USER || "",
  password: process.env.SMTP_PASS || "",
  fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "no-reply@nisterai.com",
  fromName: process.env.SMTP_FROM_NAME || "Nister AI",
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
};

function toView(settings: EmailSettingsWithSecret): EmailSettingsView {
  return {
    enabled: settings.enabled,
    host: settings.host,
    port: settings.port,
    username: settings.username,
    hasPassword: Boolean(settings.password),
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    secure: settings.secure,
  };
}

async function loadEmailSettingsWithSecret(): Promise<EmailSettingsWithSecret> {
  if (!hasDatabaseConfig) {
    return defaultEmailSettings;
  }

  try {
    const row = await prisma.emailSetting.findUnique({ where: { id: 1 } });
    if (!row) {
      return defaultEmailSettings;
    }

    const decodedPassword = decryptSecret(row.password, row.passwordKeyVersion);
    const resolvedPassword = decodedPassword.plaintext;
    const needsMigration =
      Boolean(resolvedPassword) &&
      (!row.passwordKeyVersion || decodedPassword.migratedFromLegacy || decodedPassword.needsReencrypt);
    if (needsMigration) {
      try {
        const encrypted = encryptSecret(resolvedPassword);
        await prisma.emailSetting.update({
          where: { id: row.id },
          data: {
            password: encrypted.ciphertext,
            passwordKeyVersion: encrypted.keyVersion,
          },
        });
      } catch {
        // Non-blocking migration write path.
      }
    }

    return {
      enabled: row.enabled,
      host: row.host,
      port: row.port,
      username: row.username,
      password: resolvedPassword,
      fromEmail: row.fromEmail,
      fromName: row.fromName || "Nister AI",
      secure: row.secure,
    };
  } catch {
    return defaultEmailSettings;
  }
}

export async function getEmailSettings(): Promise<EmailSettingsView> {
  const settings = await loadEmailSettingsWithSecret();
  return toView(settings);
}
function emailTransport(settings: EmailSettingsWithSecret) {
  return nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, requireTLS: !settings.secure, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000, auth: { user: settings.username, pass: settings.password } });
}
function isolatedEmailTest() {
  try { return new URL(process.env.DATABASE_URL || "").pathname === "/nister_flight_test" && process.env.FLIGHT_TEST_SMTP_ENABLED !== "1"; } catch { return false; }
}
export async function verifyEmailTransport() {
  if (isolatedEmailTest()) throw new Error("SMTP connection tests are disabled in the isolated test environment.");
  const settings = await loadEmailSettingsWithSecret();
  if (!settings.enabled || !settings.host || !settings.username || !settings.password || !settings.fromEmail) throw new Error("Enable SMTP and complete its settings first.");
  const transport = emailTransport(settings);
  try { await transport.verify(); return true; }
  catch (error) {
    throw new Error((error as { code?: string }).code === "EAUTH" ? "SMTP authentication failed. Check the username and password or app password." : "SMTP connection failed. Check the host, port, TLS mode and provider permissions.");
  } finally { transport.close(); }
}
export async function saveEmailSettings(actorId: string, input: Omit<EmailSettingsView, "hasPassword"> & { password?: string; note: string }) {
  const current = await loadEmailSettingsWithSecret(), password = input.password || current.password;
  if (input.enabled && (!input.host || !input.username || !password || !input.fromEmail)) throw new Error("SMTP host, username, password and sender address are required when email is enabled.");
  const secret = password ? encryptSecret(password) : null;
  const values = { enabled: input.enabled, host: input.host, port: input.port, username: input.username, password: secret?.ciphertext || "", passwordKeyVersion: secret?.keyVersion ?? null, fromEmail: input.fromEmail, fromName: input.fromName, secure: input.secure };
  await prisma.$transaction(async tx => {
    if ((await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } })).role !== "ADMIN") throw new Error("Administrator access required.");
    await tx.emailSetting.upsert({ where: { id: 1 }, create: { id: 1, ...values }, update: values });
    await tx.flightEmail.updateMany({ where: { status: "PENDING" }, data: { nextAttemptAt: new Date() } });
    await tx.flightAudit.create({ data: { actorId, action: "SMTP_SETTINGS_SAVED", subjectId: "email", details: { enabled: input.enabled, host: input.host, port: input.port, username: input.username, fromEmail: input.fromEmail, secure: input.secure, passwordChanged: !!input.password, note: input.note } } });
  });
  return getEmailSettings();
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string | string[]>;
}) {
  const settings = await loadEmailSettingsWithSecret();
  if (isolatedEmailTest()) return false;
  if (!settings.enabled) {
    return false;
  }

  if (!settings.host || !settings.username || !settings.password || !settings.fromEmail) {
    return false;
  }

  const transporter = emailTransport(settings);

  try { const result = await transporter.sendMail({
    from: settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: input.headers,
  }); if (Array.isArray(result.accepted) && result.accepted.length === 0) throw new Error("SMTP rejected the recipient."); } finally { transporter.close(); }

  return true;
}
