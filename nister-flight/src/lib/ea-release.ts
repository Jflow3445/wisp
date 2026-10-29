import {
  formatByteSize,
  getActiveCompanionRelease,
  getActiveCompanionReleaseWithPath,
  publishCompanionRelease,
  unpublishCompanionRelease,
} from "@/lib/companion-release";

export type { CompanionReleaseRecord as EaReleaseRecord } from "@/lib/companion-release";

export { formatByteSize };

// Legacy aliases kept to avoid breaking old imports while runtime has moved to companion terminology.
export const getActiveEaRelease = getActiveCompanionRelease;
export const getActiveEaReleaseWithPath = getActiveCompanionReleaseWithPath;
export const publishEaRelease = publishCompanionRelease;
export const unpublishEaRelease = unpublishCompanionRelease;
