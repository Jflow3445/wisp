import { AutomationMarket } from "@prisma/client";

export type CompanionRuntimeGateInput = {
  hasActiveBroker: boolean;
  preferredMarket: AutomationMarket | null;
  subscriptionMarket: AutomationMarket | null;
  enrollmentMarket: AutomationMarket | null;
};

export type CompanionRuntimeGate = {
  enabled: boolean;
  reason: string | null;
  selectedMarket: AutomationMarket;
  companionRequired: boolean;
};

export type RuntimeUpdatePayload = {
  version: string;
  latest_version: string;
  title: string;
  file_name: string;
  checksum_sha256: string;
  published_at: string;
  download_url: string;
  required: boolean;
};

export type RuntimeReleasePayload = {
  version: string;
  title: string;
  fileName: string;
  checksumSha256: string;
  createdAt: string;
};

export function resolveCompanionRuntimeGate(input: CompanionRuntimeGateInput): CompanionRuntimeGate {
  const selectedMarket =
    input.preferredMarket || input.subscriptionMarket || input.enrollmentMarket || AutomationMarket.FOREX;
  const companionRequired = selectedMarket === AutomationMarket.FOREX;

  if (!input.hasActiveBroker) {
    return {
      enabled: false,
      reason: "No active broker account found. Add and activate your recommended broker account first.",
      selectedMarket,
      companionRequired,
    };
  }
  if (!companionRequired) {
    return {
      enabled: false,
      reason: "Companion setup is currently required for Forex automation only.",
      selectedMarket,
      companionRequired,
    };
  }
  return {
    enabled: true,
    reason: null,
    selectedMarket,
    companionRequired,
  };
}

export function resolveCompanionRuntimeUpdate(
  release: RuntimeReleasePayload | null,
  publicAppBaseUrl: string,
): RuntimeUpdatePayload | null {
  if (!release) {
    return null;
  }

  return {
    version: release.version,
    latest_version: release.version,
    title: release.title,
    file_name: release.fileName,
    checksum_sha256: release.checksumSha256,
    published_at: release.createdAt,
    download_url: new URL("/api/v1/companion/releases/active/download", publicAppBaseUrl).toString(),
    required: false,
  };
}
