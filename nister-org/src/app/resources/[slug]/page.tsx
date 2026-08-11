import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resourceArticles, type ResourceArticle } from "@/lib/content";
import { articleJsonLd, breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

type ResourceArticlePageProps = {
  params: Promise<{ slug: string }>;
};

function findArticle(slug: string): ResourceArticle | undefined {
  return resourceArticles.find((article) => article.slug === slug);
}

export function generateStaticParams() {
  return resourceArticles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: ResourceArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = findArticle(slug);

  if (!article) {
    return {
      title: "Resource Not Found",
      alternates: {
        canonical: canonical("/resources"),
      },
      openGraph: {
        title: "Resources | Nister Wi-Fi",
        url: canonical("/resources"),
        siteName: "Nister Wi-Fi",
        type: "website",
      },
    };
  }

  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: canonical(article.path),
    },
    openGraph: {
      title: `${article.title} | Nister Wi-Fi`,
      description: article.description,
      url: canonical(article.path),
      siteName: "Nister Wi-Fi",
      type: "article",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: ["Nister Wi-Fi"],
      section: article.category,
    },
  };
}

export default async function ResourceArticlePage({ params }: ResourceArticlePageProps) {
  const { slug } = await params;
  const article = findArticle(slug);

  if (!article) {
    notFound();
  }

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Resources", path: "/resources" },
    { name: article.title, path: article.path },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(article)) }} />

      <SiteNav active="resources" />

      <article className="article-page">
        <header className="article-hero">
          <div className="shell article-shell">
            <Link className="inline-link article-back-link" href="/resources">
              Back to resources
            </Link>
            <p className="eyebrow">{article.category}</p>
            <h1>{article.title}</h1>
            <p className="hero-lede">{article.description}</p>
            <div className="resource-meta article-meta">
              <span>{article.readingTime}</span>
              <span>Published {article.publishedAt}</span>
              <span>Updated {article.updatedAt}</span>
            </div>
          </div>
        </header>

        <div className="shell article-body">
          {article.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>

      <section className="cta-section">
        <div className="shell cta-panel">
          <div>
            <p className="eyebrow">Next step</p>
            <h2>Ready to request a site review?</h2>
            <p>
              Send the property details, current internet situation, and deployment preference so Nister can start with
              the right context.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" href="/request-installation">
              Assess My Property
            </Link>
            <Link className="button button-secondary" href="/plans">
              Compare Models
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
