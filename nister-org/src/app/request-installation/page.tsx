import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS, leadFormFields, type LeadFormField } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "Request Installation",
  description:
    "Request Nister Wi-Fi installation review for a hostel, shared property, campus-area residence, or remote community access point.",
  alternates: {
    canonical: canonical("/request-installation"),
  },
  openGraph: {
    title: "Request Installation | Nister Wi-Fi",
    description:
      "Submit property, location, resident, current internet, pain-point, and deployment preference details.",
    url: canonical("/request-installation"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

function LeadFormControl({ field }: { field: LeadFormField }) {
  const fieldId = `lead-${field.name}`;
  const helpId = `${fieldId}-help`;
  const describedBy = field.help ? helpId : undefined;

  if (field.type === "checkbox") {
    return (
      <label className="checkbox-card" htmlFor={fieldId}>
        <input id={fieldId} name={field.name} type="checkbox" value="yes" />
        <span>
          <strong>{field.label}</strong>
          {field.help ? <small id={helpId}>{field.help}</small> : null}
        </span>
      </label>
    );
  }

  return (
    <div className="form-field">
      <label htmlFor={fieldId}>
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {field.type === "textarea" ? (
        <textarea
          aria-describedby={describedBy}
          id={fieldId}
          name={field.name}
          placeholder={field.placeholder}
          required={field.required}
          rows={4}
        />
      ) : field.type === "select" ? (
        <select aria-describedby={describedBy} defaultValue="" id={fieldId} name={field.name} required={field.required}>
          <option disabled value="">
            Select one
          </option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-describedby={describedBy}
          id={fieldId}
          min={field.type === "number" ? field.min : undefined}
          name={field.name}
          placeholder={field.placeholder}
          required={field.required}
          type={field.type}
        />
      )}
      {field.help ? <small id={helpId}>{field.help}</small> : null}
    </div>
  );
}

export default function RequestInstallationPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Request Installation", path: "/request-installation" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="request-installation" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">Installation request</p>
            <h1>Request Nister Wi-Fi review for your property.</h1>
            <p className="hero-lede">
              Send the property and contact details first. The form uses an ordinary browser POST to pay.nister.org so
              Nister can capture the lead before OTP, password setup, or owner dashboard access.
            </p>
            <div className="button-row">
              <a className="button button-primary" href={EXTERNAL_LINKS.network}>
                Get Online
              </a>
              <a className="button button-secondary" href={EXTERNAL_LINKS.login}>
                Manage Access
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Before you submit">
            <strong>Helpful details</strong>
            <span>Property name and town</span>
            <span>Digital address or map link</span>
            <span>Building and room estimate</span>
            <span>Current provider and Wi-Fi pain points</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell lead-layout">
          <div className="lead-intro">
            <p className="eyebrow">Property lead form</p>
            <h2>Share enough detail for a useful first review.</h2>
            <p>
              Required fields are marked. Use the checkbox section to describe the problems residents and operators
              already see. Leave optional fields blank when they do not apply.
            </p>
            <Link className="inline-link" href="/how-it-works">
              See how the review works
            </Link>
          </div>

          <form action={EXTERNAL_LINKS.ownerLead} className="lead-form" method="post">
            <div className="form-grid">
              {leadFormFields.map((field) => (
                <LeadFormControl field={field} key={field.name} />
              ))}
            </div>
            <div className="form-actions">
              <button className="button button-primary" type="submit">
                Submit Installation Request
              </button>
              <p>
                Submitting opens the owner lead handler on pay.nister.org. Nister uses the submitted information to
                review the property request.
              </p>
            </div>
          </form>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
