export const EXTERNAL_LINKS = {
  main: "https://nister.org/",
  network: "https://wifi.nister.org/",
  login: "https://pay.nister.org/",
  ownerLead: "https://pay.nister.org/owner/lead.php",
  support: "https://wa.me/233530488905",
  coverageRequest:
    "https://wa.me/233530488905?text=Hello%20Nister%20Wi-Fi%2C%20I%20want%20to%20request%20coverage.",
  partnershipRequest:
    "https://wa.me/233530488905?text=Hello%20Nister%20Wi-Fi%2C%20I%20want%20to%20discuss%20a%20partnership.",
} as const;

export const CONNECTIVITY_SOURCES = [
  {
    label: "ITU Facts and Figures 2025",
    href: "https://www.itu.int/en/mediacentre/Pages/PR-2025-11-17-Facts-and-Figures.aspx",
    summary: "About 6 billion people online; 2.2 billion people still offline.",
  },
  {
    label: "ITU Rural and Urban Internet Use 2024",
    href: "https://www.itu.int/itu-d/reports/statistics/2024/11/10/ff24-internet-use-in-urban-and-rural-areas/",
    summary: "83% urban internet use compared with 48% rural internet use.",
  },
] as const;

export const networkAccessSteps = [
  {
    title: "Connect to Nister Wi-Fi",
    body: "Choose Nister Wi-Fi from the Wi-Fi list on your phone, tablet, or laptop.",
  },
  {
    title: "Open wifi.nister.org",
    body: "Keep your device on Nister Wi-Fi, then open this address in your browser.",
  },
  {
    title: "Log in",
    body: "Enter your phone number, voucher, or access details when the page asks.",
  },
  {
    title: "Browse",
    body: "Once access is approved, use the internet for study, work, calls, payments, and everyday browsing.",
  },
] as const;

export const networkExperiencePanels = [
  {
    eyebrow: "At a hostel",
    title: "Get online and get back to what you came to do.",
    body:
      "Whether you need to study, message home, submit work, stream a class, or make a payment, start by choosing Nister Wi-Fi on your device.",
  },
  {
    eyebrow: "In a remote area",
    title: "Stay on Nister Wi-Fi while the access page checks your device.",
    body:
      "Do not switch back to mobile data while logging in. The access page can recognize you only while your device is on the local Nister Wi-Fi network.",
  },
  {
    eyebrow: "Away from coverage",
    title: "You can read the steps here, but you must be on-site to log in.",
    body:
      "If you are using mobile data or another internet provider, go to a Nister Wi-Fi location before trying to buy access or check your status.",
  },
] as const;

export const networkPreLoginChecks = [
  "You are at a hostel, community location, or coverage area where Nister Wi-Fi is available.",
  "Your phone, tablet, or laptop is connected to Nister Wi-Fi.",
  "You opened wifi.nister.org after joining the Wi-Fi network.",
  "Your phone number, voucher, or access details are ready if the page asks for them.",
] as const;

export const networkTroubleshootingSteps = [
  {
    title: "Stay on Nister Wi-Fi",
    body: "If your phone returns to mobile data, reconnect to Nister Wi-Fi and refresh wifi.nister.org.",
  },
  {
    title: "Type the address again",
    body:
      "Open a fresh browser tab and type wifi.nister.org. Some devices need a direct visit before the login page appears.",
  },
  {
    title: "Share your location with support",
    body:
      "Tell support where you are, what device you are using, and what message you see. Those details make the issue easier to find.",
  },
] as const;

export const homeSections = [
  {
    eyebrow: "Managed Wi-Fi for Hostels",
    title: "Make internet work for your property.",
    body:
      "Nister helps hostel owners manage resident Wi-Fi, access and payments while giving the property options for cost recovery, revenue sharing or included Wi-Fi.",
  },
  {
    eyebrow: "After the connection",
    title: "Nister manages what happens after the internet reaches your property.",
    body:
      "You focus on running the hostel. Nister helps run the connectivity service around it: resident access, payments, reporting and day-to-day service structure.",
  },
  {
    eyebrow: "Already have fibre?",
    title: "Good. Nister can work around a suitable existing connection.",
    body:
      "Your internet provider supplies the connection. Nister helps you run the resident Wi-Fi, access and payment service around it.",
  },
  {
    eyebrow: "Commercial options",
    title: "Your internet does not have to be just another monthly bill.",
    body:
      "You can let residents pay for access, include Wi-Fi with accommodation or ask Nister to assess whether a funded deployment could make sense.",
  },
  {
    eyebrow: "Owner visibility",
    title: "See what matters without becoming the network engineer.",
    body:
      "Approved owners can view request progress, linked property details, high-level network state, read-only transactions and applicable owner share reporting.",
  },
] as const;

export type LeadFormFieldName =
  | "contact_name"
  | "contact_phone"
  | "contact_whatsapp"
  | "contact_email"
  | "property_name"
  | "country"
  | "region"
  | "town"
  | "address"
  | "digital_address"
  | "google_maps_url"
  | "nearby_campus"
  | "number_of_buildings"
  | "number_of_floors"
  | "number_of_rooms"
  | "estimated_residents"
  | "current_occupancy"
  | "has_wifi"
  | "current_provider"
  | "connection_type"
  | "current_monthly_cost"
  | "current_speed"
  | "poor_coverage"
  | "slow_internet"
  | "downtime"
  | "payment_problem"
  | "user_management_problem"
  | "shared_password_problem"
  | "starting_from_scratch"
  | "deployment_preference";

export type LeadFormField = {
  name: LeadFormFieldName;
  label: string;
  type: "text" | "tel" | "email" | "url" | "number" | "select" | "textarea" | "checkbox";
  required?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  step?: string;
  inputMode?: "numeric" | "decimal";
  options?: readonly { value: string; label: string }[];
};

const binaryYesNoOptions = [
  { value: "1", label: "Yes" },
  { value: "0", label: "No" },
] as const;

export const deploymentPreferenceOptions = [
  { value: "owner_funded", label: "We'll buy the equipment" },
  { value: "request_nister_funding", label: "We'd like Nister to consider funding it" },
  { value: "property_paid_wifi", label: "We want Wi-Fi included with accommodation" },
  { value: "recommend_for_me", label: "Recommend what makes sense" },
] as const;

export const leadFormFields = [
  {
    name: "contact_name",
    label: "Your name",
    type: "text",
    required: true,
    placeholder: "Full name of the property owner or operator",
  },
  {
    name: "contact_phone",
    label: "Best phone number",
    type: "tel",
    required: true,
    placeholder: "+233...",
    help: "Use a number the Nister team can call for site questions.",
  },
  {
    name: "contact_whatsapp",
    label: "WhatsApp number",
    type: "tel",
    placeholder: "+233...",
    help: "Leave blank only if it is the same as the primary phone.",
  },
  {
    name: "contact_email",
    label: "Email address",
    type: "email",
    placeholder: "name@example.com",
  },
  {
    name: "property_name",
    label: "Hostel/property name",
    type: "text",
    required: true,
    placeholder: "Hostel, apartment, campus housing, or community name",
  },
  {
    name: "country",
    label: "Country",
    type: "text",
    required: true,
    placeholder: "Ghana",
  },
  {
    name: "region",
    label: "Region",
    type: "text",
    required: true,
    placeholder: "Ashanti, Greater Accra, Central, Northern...",
  },
  {
    name: "town",
    label: "Town or city",
    type: "text",
    required: true,
    placeholder: "Town, city, or nearby district",
  },
  {
    name: "address",
    label: "Street address or directions",
    type: "textarea",
    required: true,
    placeholder: "Describe the route, landmarks, gates, and blocks to assess.",
  },
  {
    name: "digital_address",
    label: "Digital address",
    type: "text",
    placeholder: "GhanaPost GPS or local digital address",
  },
  {
    name: "google_maps_url",
    label: "Google Maps URL",
    type: "url",
    placeholder: "https://maps.google.com/...",
  },
  {
    name: "nearby_campus",
    label: "Nearby campus or institution",
    type: "text",
    placeholder: "University, polytechnic, training college, school, or landmark",
  },
  {
    name: "number_of_buildings",
    label: "Number of buildings",
    type: "number",
    min: 0,
    placeholder: "Buildings needing coverage",
  },
  {
    name: "number_of_floors",
    label: "Number of floors",
    type: "number",
    min: 0,
    placeholder: "Typical floors per building",
  },
  {
    name: "number_of_rooms",
    label: "Approximate number of rooms",
    type: "number",
    min: 0,
    placeholder: "Rooms or units residents occupy",
  },
  {
    name: "estimated_residents",
    label: "Approximate number of residents",
    type: "number",
    min: 0,
    placeholder: "People who may need access",
  },
  {
    name: "current_occupancy",
    label: "Current occupancy",
    type: "number",
    min: 0,
    inputMode: "numeric",
    placeholder: "120",
    help: "Enter the approximate current resident count. Leave blank if occupancy is not known.",
  },
  {
    name: "has_wifi",
    label: "Does the property currently provide Wi-Fi?",
    type: "select",
    required: true,
    options: binaryYesNoOptions,
  },
  {
    name: "current_provider",
    label: "Current provider",
    type: "text",
    placeholder: "Provider name, if any",
  },
  {
    name: "connection_type",
    label: "Current connection type",
    type: "select",
    options: [
      { value: "fiber", label: "Fiber" },
      { value: "wireless", label: "Wireless broadband" },
      { value: "mobile_router", label: "Mobile router or MiFi" },
      { value: "satellite", label: "Satellite" },
      { value: "none", label: "No current connection" },
      { value: "not_sure", label: "Not sure" },
    ],
  },
  {
    name: "current_monthly_cost",
    label: "Current monthly internet cost (GHS)",
    type: "number",
    min: 0,
    step: "0.01",
    inputMode: "decimal",
    placeholder: "1200.00",
    help: "Enter the approximate monthly amount in Ghana cedis. Use digits and decimals only.",
  },
  {
    name: "current_speed",
    label: "Current speed",
    type: "text",
    placeholder: "Advertised or observed speed, if known",
  },
  {
    name: "poor_coverage",
    label: "Wi-Fi does not reach every room.",
    type: "checkbox",
  },
  {
    name: "slow_internet",
    label: "Internet feels too slow.",
    type: "checkbox",
  },
  {
    name: "downtime",
    label: "Connection goes down too often.",
    type: "checkbox",
  },
  {
    name: "payment_problem",
    label: "Collecting internet payments is difficult.",
    type: "checkbox",
  },
  {
    name: "user_management_problem",
    label: "Managing access is difficult.",
    type: "checkbox",
  },
  {
    name: "shared_password_problem",
    label: "Wi-Fi passwords get shared.",
    type: "checkbox",
  },
  {
    name: "starting_from_scratch",
    label: "We need Wi-Fi installed from scratch.",
    type: "checkbox",
  },
  {
    name: "deployment_preference",
    label: "Commercial preference",
    type: "select",
    required: true,
    options: deploymentPreferenceOptions,
  },
] as const satisfies readonly LeadFormField[];

export type PublicRoute = {
  path: string;
  label: string;
  title: string;
  description: string;
};

export const publicRoutes = [
  {
    path: "/for-hostels",
    label: "For Hostels",
    title: "Nister Wi-Fi for hostels and shared properties",
    description:
      "A practical owner-facing overview of how Nister Wi-Fi helps hostel operators plan resident internet access, payments, support, and coverage.",
  },
  {
    path: "/how-it-works",
    label: "How It Works",
    title: "How Nister Wi-Fi deployment works",
    description:
      "The request, site review, installation, resident onboarding, billing, and support flow for property owners and operators.",
  },
  {
    path: "/plans",
    label: "Plans",
    title: "Commercial models for property Wi-Fi",
    description:
      "Owner-facing deployment and billing models for resident-paid access, property-paid access, owner-funded rollout, and funding review.",
  },
  {
    path: "/request-installation",
    label: "Request Nister",
    title: "Request a Nister property assessment",
    description:
      "Tell Nister about your hostel, rooms, residents, current internet, and preferred setup so the property can be assessed.",
  },
  {
    path: "/resources",
    label: "Resources",
    title: "Nister Wi-Fi resources for property owners",
    description:
      "Practical guides for hostel owners and operators planning shared internet, coverage, resident access, and billing.",
  },
  {
    path: "/faq",
    label: "FAQ",
    title: "Nister Wi-Fi frequently asked questions",
    description:
      "Answers about installation, coverage, billing, resident access, payments, and support for Nister Wi-Fi property requests.",
  },
  {
    path: "/coverage",
    label: "Coverage",
    title: "Nister Wi-Fi coverage requests",
    description:
      "Where Nister reviews hostel, campus-area, town, and remote community requests for shared Wi-Fi access.",
  },
  {
    path: "/about",
    label: "About",
    title: "About Nister Wi-Fi",
    description:
      "Nister Wi-Fi focuses on practical shared internet access for hostels and remote communities.",
  },
] as const satisfies readonly PublicRoute[];

export const faqItems = [
  {
    question: "Can Nister install Wi-Fi for an existing hostel?",
    answer:
      "Yes. The first step is a property request so the team can understand the building layout, current internet setup, resident demand, and the kind of coverage problem residents face.",
  },
  {
    question: "Does a request create an owner account immediately?",
    answer:
      "No. The public request form captures the lead first. Owner account creation, OTP verification, and dashboard access are handled later on the pay.nister.org owner portal.",
  },
  {
    question: "Can residents pay for their own access?",
    answer:
      "A resident-paid model is one supported commercial option. Nister reviews the property, expected usage pattern, and owner preference before recommending a billing setup.",
  },
  {
    question: "Can the property pay for internet instead of each resident paying?",
    answer:
      "Yes. Some owners prefer a property-paid model where internet is included in the resident experience. The property assessment request asks for enough detail to discuss that option.",
  },
  {
    question: "What if the property already has a provider?",
    answer:
      "The request form includes current provider, connection type, cost, speed, coverage, downtime, and user-management fields so the review starts with the actual situation.",
  },
  {
    question: "How do residents get online after installation?",
    answer:
      "Residents connect to Nister Wi-Fi, open wifi.nister.org while on the local network, log in or manage access through the approved flow, and browse after access is confirmed.",
  },
  {
    question: "How should I ask for support?",
    answer:
      "Use WhatsApp support and include the property name, town, device, and what the resident or owner sees on screen. Location details help the team narrow the issue quickly.",
  },
] as const;

export const coverageAreas = [
  {
    region: "Ashanti Region",
    towns: ["Kumasi", "Ejisu", "Ayeduase", "Kotei", "Bomso"],
    focus: "Campus-area hostels, private student housing, and dense residential blocks near institutions.",
  },
  {
    region: "Greater Accra Region",
    towns: ["Accra", "Madina", "Adenta", "East Legon", "Tema"],
    focus: "Shared housing, hostel-style properties, and operator-led locations where residents need managed access.",
  },
  {
    region: "Central Region",
    towns: ["Cape Coast", "Winneba", "Elmina"],
    focus: "Student accommodation and community access points near schools, campuses, and training centers.",
  },
  {
    region: "Northern Ghana",
    towns: ["Tamale", "Savelugu", "Walewale"],
    focus: "Remote community requests, education-focused access points, and properties with limited broadband options.",
  },
  {
    region: "Other Ghanaian towns",
    towns: ["Tell us the town", "Share landmarks", "Add a map pin"],
    focus: "Nister can review new hostel and community requests when the location details are clear enough for assessment.",
  },
] as const;

export type ResourceArticleSection = {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
};

export type ResourceArticle = {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  readingTime: string;
  path: `/resources/${string}`;
  sections: readonly ResourceArticleSection[];
};

export const resourceArticles = [
  {
    slug: "plan-hostel-wifi-before-installation",
    title: "How hostel owners should prepare before requesting Wi-Fi installation",
    description:
      "A practical checklist for owners who want Nister Wi-Fi to review a hostel, apartment block, or student housing property.",
    category: "Installation planning",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "4 min read",
    path: "/resources/plan-hostel-wifi-before-installation",
    sections: [
      {
        heading: "Start with the property shape",
        paragraphs: [
          "A useful property assessment request explains the physical site before it asks for a package. Nister needs the property name, town, address, landmarks, number of buildings, floors, rooms, and estimated residents because Wi-Fi design depends on walls, distance, room layout, and where people gather.",
          "If you already know the weak spots, list them plainly. Examples include rooms behind thick walls, upper floors, outdoor study areas, reception spaces, or blocks that lose signal when many residents are online. These details make the first review more practical.",
        ],
      },
      {
        heading: "Explain the current connection honestly",
        paragraphs: [
          "Owners often request new Wi-Fi because the current service is hard to manage, not only because it is slow. Share the provider, connection type, monthly cost, speed if known, and the most common resident complaints. A clear picture helps Nister compare repair, redesign, and new deployment options.",
          "Do not worry if you are starting from scratch. A request can still be useful when there is no provider, no cabling, or no formal resident access process yet.",
        ],
      },
      {
        heading: "Choose the commercial direction",
        paragraphs: [
          "The installation form asks for a deployment preference because owners run properties differently. Some want resident-paid access, some want the property to fund internet as part of rent, and others want Nister to recommend a model after reviewing the site.",
        ],
        bullets: [
          "Use owner-funded when you expect to pay for the rollout directly.",
          "Use request Nister funding review when the property needs help evaluating the upfront model.",
          "Use property-paid Wi-Fi when internet should be part of the resident experience.",
          "Use recommend for me when the location and resident pattern should guide the decision.",
        ],
      },
    ],
  },
  {
    slug: "resident-paid-vs-property-paid-wifi",
    title: "Resident-paid and property-paid Wi-Fi models for hostels",
    description:
      "How owners can think about billing responsibility, resident experience, and access management before selecting a Wi-Fi model.",
    category: "Billing model",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "3 min read",
    path: "/resources/resident-paid-vs-property-paid-wifi",
    sections: [
      {
        heading: "Resident-paid access",
        paragraphs: [
          "Resident-paid Wi-Fi can fit properties where residents prefer to buy access based on personal need. This model can reduce manual collection work for owners because each resident manages access through the approved payment and login path.",
          "The owner still matters. Building access, equipment placement, resident communication, and escalation rules need coordination with the property operator so the network can be supported properly.",
        ],
      },
      {
        heading: "Property-paid access",
        paragraphs: [
          "Property-paid Wi-Fi can fit owners who want internet to be part of the property offer. It may simplify resident expectations because the owner decides how internet is included, explained, and supported.",
          "This model needs a clear agreement on service scope, coverage expectations, payment responsibility, and how resident issues are routed. It should not be treated as a generic broadband bill without access management.",
        ],
      },
      {
        heading: "How to choose",
        paragraphs: [
          "The better model depends on occupancy, resident behavior, building layout, the owner budget, and whether payment collection or support is currently the bigger problem. Nister uses the property assessment request to begin that discussion without promising a one-size-fits-all package.",
        ],
      },
    ],
  },
  {
    slug: "why-shared-passwords-break-hostel-wifi",
    title: "Why shared passwords make hostel Wi-Fi harder to operate",
    description:
      "A plain-language guide to the access, support, and billing problems created when residents share one Wi-Fi password.",
    category: "Operations",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "3 min read",
    path: "/resources/why-shared-passwords-break-hostel-wifi",
    sections: [
      {
        heading: "Shared passwords hide the real problem",
        paragraphs: [
          "When many residents use one password, the network operator cannot easily tell who is online, who should have access, or which device is causing a complaint. That turns ordinary Wi-Fi issues into long arguments about fairness and responsibility.",
          "Shared passwords also make billing harder. A resident who paid may feel cheated when others use the same access without contributing, while the owner has less information for support decisions.",
        ],
      },
      {
        heading: "Managed access is clearer",
        paragraphs: [
          "A managed access flow gives residents a clearer path: connect to Nister Wi-Fi, open wifi.nister.org, log in or manage access, and browse after approval. The goal is not to make internet complicated; it is to make access understandable and supportable.",
        ],
      },
      {
        heading: "What owners should share in the request",
        paragraphs: [
          "If shared passwords are already a problem, say so in the property assessment request. Include whether residents complain about speed, whether payment collection is difficult, and whether some rooms or floors have weaker coverage. These details help the review focus on the operational problem, not only the signal.",
        ],
      },
    ],
  },
] as const satisfies readonly ResourceArticle[];
