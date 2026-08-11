import type { MetadataRoute } from "next";
import { canonical } from "@/lib/seo";

const privatePaths = ["/owner/", "/admin/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: privatePaths,
      },
    ],
    sitemap: canonical("/sitemap.xml"),
  };
}
