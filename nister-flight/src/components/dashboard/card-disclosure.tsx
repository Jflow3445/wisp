"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const CARD_SELECTOR = ".ops-page-stack > section.ops-card, .ops-page-stack > article.ops-card";

function applyDisclosureBehavior() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR));
  cards.forEach((card, index) => {
    if (card.dataset.disclosureReady === "true") {
      return;
    }

    const heading = card.querySelector<HTMLElement>(
      ":scope > h2, :scope > h3, :scope > .ops-section-head > h2, :scope > .ops-section-head > h3",
    );
    if (!heading) {
      return;
    }

    const title = heading.textContent?.trim() || "Panel";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ops-card-disclosure-trigger";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = title;
    const iconSpan = document.createElement("span");
    iconSpan.className = "ops-card-disclosure-icon";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.textContent = "v";
    trigger.append(labelSpan, iconSpan);

    const body = document.createElement("div");
    body.className = "ops-card-disclosure-body";

    const nodesToMove = Array.from(card.childNodes).filter((node) => node !== heading);
    nodesToMove.forEach((node) => body.appendChild(node));

    const explicitDefaultOpen = card.dataset.disclosureDefaultOpen;
    let defaultOpen = index === 0;
    if (explicitDefaultOpen === "true") {
      defaultOpen = true;
    } else if (explicitDefaultOpen === "false") {
      defaultOpen = false;
    }
    trigger.setAttribute("aria-expanded", defaultOpen ? "true" : "false");
    trigger.setAttribute("aria-label", `Toggle ${title}`);
    if (!defaultOpen) {
      body.hidden = true;
      card.classList.add("ops-card-disclosure-collapsed");
    }

    trigger.addEventListener("click", () => {
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      const nextExpanded = !expanded;
      trigger.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
      body.hidden = !nextExpanded;
      card.classList.toggle("ops-card-disclosure-collapsed", !nextExpanded);
    });

    heading.hidden = true;
    heading.setAttribute("aria-hidden", "true");
    card.classList.add("ops-card-disclosure-ready");
    card.appendChild(trigger);
    card.appendChild(body);
    card.dataset.disclosureReady = "true";
  });
}

export function DashboardCardDisclosure() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/dashboard")) {
      return;
    }
    let attempts = 0;
    const tick = () => {
      applyDisclosureBehavior();
      attempts += 1;
      if (attempts >= 12) {
        window.clearInterval(interval);
      }
    };
    const interval = window.setInterval(tick, 250);
    tick();
    return () => {
      window.clearInterval(interval);
    };
  }, [pathname]);

  return null;
}
