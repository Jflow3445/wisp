import Link from "next/link";
import { formatUsd, PricingPlanView } from "@/lib/site";

export function PlanCard({ plan }: { plan: PricingPlanView }) {
  return (
    <article className={`plan-card${plan.highlight ? " plan-card-highlight" : ""}`}>
      {plan.badge ? <p className="plan-badge">{plan.badge}</p> : <span className="plan-badge-spacer" aria-hidden="true" />}
      <h3>{plan.name}</h3>
      <p className="plan-subtitle">{plan.subtitle}</p>
      <p className="plan-price">
        {formatUsd(plan.monthlyPriceCents)}
        <span>/month</span>
      </p>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <Link href={plan.ctaHref} className={`btn ${plan.highlight ? "btn-dark" : "btn-ghost"}`}>
        {plan.ctaLabel}
      </Link>
    </article>
  );
}
