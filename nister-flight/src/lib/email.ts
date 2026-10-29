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

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string | string[]>;
}) {
  const settings = await loadEmailSettingsWithSecret();
  if (!settings.enabled) {
    return false;
  }

  if (!settings.host || !settings.username || !settings.password || !settings.fromEmail) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
  });

  await transporter.sendMail({
    from: settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: input.headers,
  });

  return true;
}
