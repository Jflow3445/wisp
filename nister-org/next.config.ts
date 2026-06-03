import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/api.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/login",
        destination: "https://pay.nister.org/",
        permanent: false,
      },
      {
        source: "/login.html",
        destination: "https://pay.nister.org/",
        permanent: false,
      },
      {
        source: "/pay.html",
        destination: "https://pay.nister.org/",
        permanent: false,
      },
      {
        source: "/signup.html",
        destination: "/",
        permanent: false,
      },
      {
        source: "/reset-password.html",
        destination: "/",
        permanent: false,
      },
      {
        source: "/change-password.html",
        destination: "/",
        permanent: false,
      },
      {
        source: "/status.html",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
