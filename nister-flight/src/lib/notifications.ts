import { NotificationType } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { buildNotificationEmail, type PremiumEmailCategory, type PremiumEmailMessage } from "@/lib/email-template";
import { prisma } from "@/lib/prisma";
import { getPublicAppBaseUrl } from "@/lib/public-url";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

type NotifyPayload = {
  title: string;
  message: string;
  href?: string;
  type?: NotificationType;
  email?: {
    subject?: string;
    text?: string;
    html?: string;
    rendered?: PremiumEmailMessage;
  };
};

function fitToColumn(value: string, max = 191) {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function toAbsoluteDashboardUrl(path?: string) {
  const baseUrl = getPublicAppBaseUrl();
  if (!path) {
    return `${baseUrl}/dashboard`;
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function notificationEmailCategory(type: NotificationType | undefined, title: string): PremiumEmailCategory {
  if (type === NotificationType.PAYMENT) {
    return "payment";
  }
  if (type === NotificationType.SUPPORT) {
    return "support";
  }
  const normalized = title.toLowerCase();
  if (
    normalized.includes("runtime") ||
    normalized.includes("agent") ||
    normalized.includes("risk") ||
    normalized.includes("connection") ||
    normalized.includes("command")
  ) {
    return "runtime";
  }
  return "account";
}

export async function notifyAdmins(payload: NotifyPayload) {
  if (!hasDatabaseConfig) {
    return;
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (!admins.length) {
    return;
  }

  const title = fitToColumn(payload.title, 191);
  const message = fitToColumn(payload.message, 191);
  const href = payload.href ? fitToColumn(payload.href, 191) : null;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title,
      message,
      href,
      type: payload.type ?? NotificationType.SYSTEM,
    })),
  });
}

export async function notifyUser(userId: string, payload: NotifyPayload) {
  if (!hasDatabaseConfig) {
    return;
  }

  const title = fitToColumn(payload.title, 191);
  const message = fitToColumn(payload.message, 191);
  const href = payload.href ? fitToColumn(payload.href, 191) : null;

  await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      href,
      type: payload.type ?? NotificationType.SYSTEM,
    },
  });

  if (!payload.email) {
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
      },
    });

    if (!user?.email) {
      return;
    }

    const actionUrl = toAbsoluteDashboardUrl(href || "/dashboard/activity");
    const rendered =
      payload.email.rendered ||
      buildNotificationEmail({
        recipientName: user.name,
        title,
        message,
        subject: payload.email.subject?.trim() || title,
        actionUrl,
        actionLabel: "Review your account",
        category: notificationEmailCategory(payload.type, title),
        htmlBody: payload.email.html,
        textOverride: payload.email.text,
      });

    await sendEmail({
      to: user.email,
      ...rendered,
    });
  } catch {
    // Do not block successful state changes when email transport fails.
  }
}
