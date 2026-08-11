import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS, leadFormFields, type LeadFormField, type LeadFormFieldName } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";

export const metadata: Metadata = {
  title: "Request a Property Assessment",
  description:
    "Tell Nister about your hostel, rooms, residents, current internet, and preferred setup so the property can be assessed.",
  alternates: {
    canonical: canonical("/request-installation"),
  },
  openGraph: {
    title: "Request a Property Assessment | Nister Wi-Fi",
    description:
      "Start the lead-first owner flow by sending practical property details before OTP, password, or account creation.",
    url: canonical("/request-installation"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const fieldsByName = new Map<LeadFormFieldName, LeadFormField>(leadFormFields.map((field) => [field.name, field]));

function requiredField(name: LeadFormFieldName): LeadFormField {
  const field = fieldsByName.get(name);
  if (!field) {
    throw new Error(`Missing lead form field: ${name}`);
  }
  return field;
}

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
            <option key={`${field.name}-${option.value}-${option.label}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-describedby={describedBy}
          id={fieldId}
          inputMode={field.inputMode}
          min={field.type === "number" ? field.min : undefined}
          name={field.name}
          placeholder={field.placeholder}
          required={field.required}
          step={field.type === "number" ? field.step : undefined}
          type={field.type}
        />
      )}
      {field.help ? <small id={helpId}>{field.help}</small> : null}
    </div>
  );
}

function HasWifiControl() {
  return (
    <div className="form-field">
      <label htmlFor="lead-has_wifi">Does the property currently provide Wi-Fi? *</label>
      <select id="lead-has_wifi" name="has_wifi" required defaultValue="">
        <option disabled value="">
          Select one
        </option>
        <option value="1">Yes</option>
        <option value="yes">Partly</option>
        <option value="0">No</option>
      </select>
    </div>
  );
}

function LeadControls({ names }: { names: readonly LeadFormFieldName[] }) {
  return (
    <>
      {names.map((name) => (
        <LeadFormControl field={requiredField(name)} key={name} />
      ))}
    </>
  );
}

function RequestHeader() {
  return (
    <header className="site-header request-header">
      <div className="shell nav-shell">
        <a className="brand" href={EXTERNAL_LINKS.main} aria-label="Nister Wi-Fi home">
          <span className="brand-mark" aria-hidden="true">
            <span className="signal-bar signal-bar-one" />
            <span className="signal-bar signal-bar-two" />
            <span className="signal-bar signal-bar-three" />
          </span>
          <span>Nister Wi-Fi</span>
        </a>
        <nav className="main-nav" aria-label="Existing user links">
          <a className="nav-action" href={EXTERNAL_LINKS.network}>
            Get Online
          </a>
          <a className="nav-action" href={EXTERNAL_LINKS.login}>
            Manage Access
          </a>
        </nav>
      </div>
    </header>
  );
}

export default function RequestInstallationPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Request a Property Assessment", path: "/request-installation" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <RequestHeader />

      <section className="public-hero request-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">Request Nister</p>
            <h1>Tell us about your hostel. We&apos;ll handle the technical part.</h1>
            <p className="hero-lede">
              We need a few practical details about the property to understand where to start. Estimates are fine.
            </p>
            <p className="hero-assurance">No commitment to install.</p>
          </div>
          <aside className="public-summary-panel" aria-label="What happens next">
            <strong>After you send this</strong>
            <span>Your property details are saved first</span>
            <span>You verify your phone number</span>
            <span>You create or confirm your owner account</span>
            <span>Nister reviews what setup makes sense</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell lead-layout">
          <div className="lead-intro">
            <p className="eyebrow">Property assessment</p>
            <h2>Start with what Nister needs to assess the property.</h2>
            <p>
              No account is required to send your property details. After the request is saved, pay.nister.org will ask
              you to verify your phone number so you can track the request.
            </p>
            <Link className="inline-link" href="/how-it-works">
              See how Nister works
            </Link>
          </div>

          <form action={EXTERNAL_LINKS.ownerLead} className="lead-form" method="post">
            <input name="country" type="hidden" value="Ghana" />

            <section className="lead-form-section">
              <h2>Where should we start?</h2>
              <p>Estimates are completely fine.</p>
              <div className="form-grid">
                <LeadControls
                  names={[
                    "contact_name",
                    "contact_phone",
                    "property_name",
                    "region",
                    "town",
                    "number_of_rooms",
                    "estimated_residents",
                  ]}
                />
              </div>
            </section>

            <section className="lead-form-section">
              <h2>What does internet look like there today?</h2>
              <p>Do not know the technical details? Skip the optional fields.</p>
              <div className="form-grid">
                <HasWifiControl />
                <LeadControls
                  names={[
                    "current_provider",
                    "current_monthly_cost",
                    "current_speed",
                    "connection_type",
                    "contact_whatsapp",
                    "contact_email",
                    "address",
                    "digital_address",
                    "google_maps_url",
                    "nearby_campus",
                    "number_of_buildings",
                    "number_of_floors",
                    "current_occupancy",
                  ]}
                />
              </div>
            </section>

            <section className="lead-form-section">
              <h2>What would you most like to improve?</h2>
              <p>Select everything that sounds familiar.</p>
              <div className="form-grid">
                <LeadControls
                  names={[
                    "poor_coverage",
                    "slow_internet",
                    "downtime",
                    "user_management_problem",
                    "shared_password_problem",
                    "payment_problem",
                    "starting_from_scratch",
                  ]}
                />
              </div>
            </section>

            <section className="lead-form-section">
              <h2>How would you prefer to set this up?</h2>
              <p>Choose recommend what makes sense if you want Nister to review the property before suggesting a model.</p>
              <div className="form-grid">
                <LeadControls names={["deployment_preference"]} />
              </div>
            </section>

            <div className="form-actions">
              <button className="button button-primary" type="submit">
                Request My Property Assessment
              </button>
              <p>Your property details are saved before OTP, password, or owner dashboard access.</p>
            </div>
          </form>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
