import Link from "next/link";

const ventures = [
  {
    name: "Nister Wi-Fi",
    status: "Live",
    summary: "Reliable internet access and connectivity solutions designed for homes, businesses, hostels, and communities.",
    ctaLabel: "Contact Team",
    href: "/contact",
  },
  {
    name: "Nister AI",
    status: "Live",
    summary: "Automation and intelligent systems built to improve decision-making, efficiency, and execution.",
    ctaLabel: "Visit Nister AI",
    href: "https://nisterai.com",
  },
  {
    name: "Nister Education",
    status: "Coming soon",
    summary: "A future-focused learning platform designed to expand access to knowledge, skills, and opportunity.",
    ctaLabel: "Coming Soon",
    href: "/contact",
  },
  {
    name: "Nister Deliveries",
    status: "Coming soon",
    summary: "A delivery and logistics platform built to move goods more efficiently and connect people to what they need.",
    ctaLabel: "Coming Soon",
    href: "/contact",
  },
];

export function NisterOrgHome() {
  return (
    <main className="orgx-home">
      <header className="orgx-header">
        <div className="orgx-shell orgx-nav-row">
          <Link href="/" className="orgx-brand" aria-label="Nister home">
            <span className="orgx-brand-mark" aria-hidden="true" />
            <span>Nister</span>
          </Link>
          <nav className="orgx-nav" aria-label="Primary">
            <a href="#about">About Nister</a>
            <a href="#ventures">Ventures</a>
            <Link href="/contact">Contact</Link>
          </nav>
          <a href="#ventures" className="orgx-btn orgx-btn-primary">
            Explore Our Services
          </a>
        </div>
      </header>

      <section className="orgx-hero" id="about">
        <div className="orgx-shell orgx-hero-grid">
          <div>
            <p className="orgx-eyebrow">Nister Holding Brand</p>
            <h1>Building practical technology for everyday life</h1>
            <p className="orgx-subhead">
              Nister is the parent organisation behind Nister Wi-Fi, Nister AI, Nister Education, and Nister Deliveries. We build digital infrastructure and
              services designed for access, efficiency, and long-term value.
            </p>
            <div className="orgx-hero-cta">
              <a href="#ventures" className="orgx-btn orgx-btn-primary">
                Explore Our Services
              </a>
              <Link href="/contact" className="orgx-btn orgx-btn-ghost">
                Contact Us
              </Link>
            </div>
          </div>
          <article className="orgx-focus-card">
            <p className="orgx-focus-label">Who is Nister?</p>
            <h2>Parent company with operating ventures</h2>
            <p className="orgx-focus-text">
              Nister is the public holding brand for a growing portfolio of technology and service ventures, including Nister Wi-Fi, Nister AI, Nister
              Education, and Nister Deliveries.
            </p>
            <p className="orgx-focus-text">
              We focus on practical, reliable, and scalable systems that improve access, productivity, learning, and everyday convenience.
            </p>
          </article>
        </div>
      </section>

      <section className="orgx-section">
        <div className="orgx-shell">
          <article className="orgx-about-card">
            <h2>About Nister</h2>
            <p>
              Nister is a multi-vertical technology company developing services in connectivity, intelligent automation, education, and logistics. Our focus is
              simple: build useful systems that solve real problems and can scale over time. Rather than operate as a single-product brand, Nister brings
              together multiple ventures under one organisation with a shared commitment to reliability, access, and execution.
            </p>
          </article>
        </div>
      </section>

      <section className="orgx-section" id="ventures">
        <div className="orgx-shell">
          <header className="orgx-section-head">
            <h2>Our Ventures</h2>
            <p>Clear operating structure across connectivity, AI, education, and logistics.</p>
          </header>
          <div className="orgx-initiative-grid">
            {ventures.map((venture) => (
              <article className="orgx-initiative-card" key={venture.name}>
                <p className={`orgx-stage ${venture.status === "Coming soon" ? "orgx-stage-soon" : ""}`}>{venture.status}</p>
                <h3>{venture.name}</h3>
                <p>{venture.summary}</p>
                {venture.href.startsWith("http") ? (
                  <a href={venture.href} className="orgx-btn orgx-btn-ghost">
                    {venture.ctaLabel}
                  </a>
                ) : (
                  <Link href={venture.href} className="orgx-btn orgx-btn-ghost">
                    {venture.ctaLabel}
                  </Link>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="orgx-footer">
        <div className="orgx-shell orgx-footer-grid">
          <div>
            <p className="orgx-footer-title">Nister</p>
            <p>Technology holding company operating across connectivity, AI, education, and logistics.</p>
            <p className="orgx-footer-contact">
              Contact: <a href="mailto:admin@nister.org">Email Nister</a>
            </p>
          </div>
          <div className="orgx-footer-links">
            <Link href="/contact">Contact Us</Link>
            <a href="https://nisterai.com">Nister AI</a>
            <a href="#ventures">Our Ventures</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
