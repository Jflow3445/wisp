import type { NextConfig } from "next";

const configuredServerActionsBodySize = (process.env.NEXT_SERVER_ACTIONS_BODY_SIZE_LIMIT || "").trim().toLowerCase();
const serverActionsBodySizeLimit =
  /^\d+(kb|mb|gb)$/.test(configuredServerActionsBodySize) ? configuredServerActionsBodySize : "64kb";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  htmlLimitedBots: /.*/,
  async redirects() {
    return [
      { source: "/dashboard/billing", destination: "/dashboard/wallet", permanent: false },
      { source: "/dashboard/support", destination: "/dashboard/help", permanent: false },
      { source: "/app/onboarding/verify-email", destination: "/verify-email", permanent: false },
      { source: "/app/:path*", destination: "/dashboard", permanent: false },
    ];
  },
  experimental: {
    cpus: 1,
    serverActions: {
      bodySizeLimit: serverActionsBodySizeLimit as `${number}${"kb" | "mb" | "gb"}`,
    },
    proxyClientMaxBodySize: "640kb",
  },
};

export default nextConfig;
