"use client";

import { useMemo, useState } from "react";

export type PremiumFaqItem = {
  question: string;
  answer: string;
};

export type PremiumFaqCategory = {
  id: string;
  label: string;
  items: PremiumFaqItem[];
};

type PremiumFaqBrowserProps = {
  categories: PremiumFaqCategory[];
};

export function PremiumFaqBrowser({ categories }: PremiumFaqBrowserProps) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || "");
  const [query, setQuery] = useState("");
  const [openQuestion, setOpenQuestion] = useState<string | null>(categories[0]?.items[0]?.question || null);

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return categories
      .filter((category) => category.id === activeCategory)
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (!normalizedQuery) {
            return true;
          }

          return `${item.question} ${item.answer}`.toLowerCase().includes(normalizedQuery);
        }),
      }))
      .filter((category) => category.items.length > 0);
  }, [activeCategory, categories, query]);

  const resultCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);
  const activeCategoryLabel = categories.find((category) => category.id === activeCategory)?.label || "FAQ";

  return (
    <div className="premium-faq-browser">
      <label className="premium-faq-search">
        <span>Search common questions</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search answers about account ownership, plans, setup, or risk"
        />
      </label>

      <div className="premium-faq-tabs" role="tablist" aria-label="FAQ Categories">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={activeCategory === category.id}
            className={`premium-faq-tab${activeCategory === category.id ? " premium-faq-tab-active" : ""}`}
            onClick={() => {
              setActiveCategory(category.id);
              setOpenQuestion(category.items[0]?.question || null);
            }}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="premium-faq-result-bar">
        <p>
          {resultCount} result{resultCount === 1 ? "" : "s"} in {activeCategoryLabel}
        </p>
        <span className="premium-status-pill premium-status-gold">
          <i className="premium-status-dot" aria-hidden="true" />
          Accordion view
        </span>
      </div>

      {visibleGroups.length ? (
        visibleGroups.map((group) => (
          <section key={group.id} className="premium-faq-group">
            <h2>{group.label}</h2>
            <div className="premium-faq">
              {group.items.map((item) => {
                const isOpen = openQuestion === item.question;

                return (
                  <article key={item.question} className="premium-faq-item" data-open={isOpen ? "true" : "false"}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenQuestion(isOpen ? null : item.question)}
                    >
                      <span className="premium-faq-item-question">{item.question}</span>
                      <span className="premium-faq-chevron" aria-hidden="true">
                        +
                      </span>
                    </button>
                    {isOpen ? <p className="premium-faq-item-answer">{item.answer}</p> : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <article className="premium-faq-empty">
          <h2>No matching questions found</h2>
        <p>Try a narrower keyword or switch categories to see answers for another topic.</p>
        </article>
      )}
    </div>
  );
}
