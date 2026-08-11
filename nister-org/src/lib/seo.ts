import { EXTERNAL_LINKS, type ResourceArticle } from "@/lib/content";

export const SITE_ORIGIN = "https://nister.org";

export function canonical(path: string): string {
  const rawPath = path.trim().replace(/\\/g, "/");
  let localPath = rawPath;

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(rawPath)) {
    localPath = new URL(rawPath).pathname;
  } else if (/^\/{2,}/.test(rawPath)) {
    const [, ...pathSegments] = rawPath.replace(/^\/+/, "").split("/");
    localPath = `/${pathSegments.join("/")}`;
  }

  const normalizedPath = `/${localPath.replace(/^\/+/, "").split(/[?#]/, 1)[0]}`;
  return new URL(normalizedPath, SITE_ORIGIN).toString();
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Nister Wi-Fi",
    url: canonical("/"),
    logo: canonical("/nister-browser-icon.png"),
    description: "Managed Wi-Fi for hostels and student accommodation.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: EXTERNAL_LINKS.support,
      areaServed: "GH",
      availableLanguage: ["en"],
    },
    sameAs: [EXTERNAL_LINKS.main, EXTERNAL_LINKS.network],
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonical(item.path),
    })),
  };
}

export function articleJsonLd(article: ResourceArticle): Record<string, unknown> {
  const articleBody = article.sections
    .flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.bullets ?? []),
    ])
    .join("\n\n");

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    inLanguage: "en",
    author: {
      "@type": "Organization",
      name: "Nister Wi-Fi",
      url: canonical("/"),
    },
    publisher: {
      "@type": "Organization",
      name: "Nister Wi-Fi",
      logo: {
        "@type": "ImageObject",
        url: canonical("/nister-browser-icon.png"),
      },
    },
    mainEntityOfPage: canonical(article.path),
    articleSection: article.category,
    articleBody,
    wordCount: articleBody.split(/\s+/).filter(Boolean).length,
  };
}
