import Link from "next/link";

type NisterOrgContactProps = {
  successMessage?: string;
};

export function NisterOrgContact({ successMessage }: NisterOrgContactProps) {
  return (
    <main className="orgx-home">
      <header className="orgx-header">
        <div className="orgx-shell orgx-nav-row">
          <Link href="/" className="orgx-brand" aria-label="Nister home">
            <span className="orgx-brand-mark" aria-hidden="true" />
            <span>Nister</span>
          </Link>
          <nav className="orgx-nav" aria-label="Primary">
            <Link href="/#about">About Nister</Link>
            <Link href="/#ventures">Ventures</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <Link href="/#ventures" className="orgx-btn orgx-btn-primary">
            Explore Our Services
          </Link>
        </div>
      </header>

      <section className="orgx-hero orgx-contact-hero">
        <div className="orgx-shell">
          <p className="orgx-eyebrow">Contact Nister</p>
          <h1>Corporate and venture enquiries</h1>
          <p className="orgx-subhead">
            Reach the parent organisation directly for partnerships, enterprise discussions, venture questions, and general enquiries.
          </p>
          <div className="orgx-hero-cta">
            <a href="mailto:admin@nister.org" className="orgx-btn orgx-btn-primary">
              Email Nister
            </a>
            <Link href="/#ventures" className="orgx-btn orgx-btn-ghost">
              View Ventures
            </Link>
          </div>
          {successMessage ? <p className="orgx-alert">{successMessage}</p> : null}
        </div>
      </section>

      <section className="orgx-section">
        <div className="orgx-shell orgx-contact-grid">
          <article className="orgx-contact-card">
            <h2>General Contact</h2>
            <p>For all official communication with Nister, use the contact email below.</p>
            <p className="orgx-contact-email">
              <a href="mailto:admin@nister.org">Email Nister</a>
            </p>
          </article>

          <article className="orgx-contact-card">
            <h2>What to include</h2>
            <p>State your name, organisation, purpose, and which venture your enquiry relates to: Wi-Fi, AI, Education, or Deliveries.</p>
          </article>

          <article className="orgx-contact-card">
            <h2>Response scope</h2>
            <p>Current responses prioritize corporate, partnership, and operational enquiries connected to active or upcoming ventures.</p>
          </article>
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
            <Link href="/">Home</Link>
            <Link href="/#ventures">Our Ventures</Link>
            <a href="https://nisterai.com">Nister AI</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
