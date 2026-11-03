import type { MetadataRoute } from "next";
import { publicRoutes, resourceArticles } from "@/lib/content";
import { canonical } from "@/lib/seo";

const routeUpdatedAt = "2026-08-11";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicEntries: MetadataRoute.Sitemap = [
    {
      url: canonical("/"),
      lastModified: routeUpdatedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...publicRoutes.map((route) => ({
      url: canonical(route.path),
      lastModified: routeUpdatedAt,
      changeFrequency: "weekly" as const,
      priority: route.path === "/request-installation" ? 0.9 : 0.8,
    })),
  ];

  const resourceEntries: MetadataRoute.Sitemap = resourceArticles.map((article) => ({
    url: canonical(article.path),
    lastModified: article.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...publicEntries, ...resourceEntries];
}
