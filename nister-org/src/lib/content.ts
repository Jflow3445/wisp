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
    title: "Join Nister Wi-Fi",
    body: "Choose Nister Wi-Fi from the Wi-Fi list on your phone, tablet, or laptop.",
  },
  {
    title: "Open wifi.nister.org",
    body: "Keep your device on Nister Wi-Fi, then open wifi.nister.org in your browser.",
  },
  {
    title: "Log in or buy access",
    body: "Enter your phone number, voucher, or access details when the page asks.",
  },
  {
    title: "You're connected",
    body: "Once access is confirmed, use the internet for study, work, calls, payments and browsing.",
  },
] as const;

export const networkExperiencePanels = [
  {
    eyebrow: "Join Wi-Fi",
    title: "Start by connecting your device to Nister Wi-Fi.",
    body: "Your phone must stay on Nister Wi-Fi while the access page checks what you need next.",
  },
  {
    eyebrow: "Open the page",
    title: "Use wifi.nister.org after joining the network.",
    body: "If the login page does not open by itself, type wifi.nister.org into a fresh browser tab.",
  },
  {
    eyebrow: "Get help",
    title: "Ask for help if the page still does not work.",
    body: "Tell support where you are, what device you are using and what message you see.",
  },
] as const;

export const networkPreLoginChecks = [
  "You are at a place where Nister Wi-Fi is available.",
  "Your device is connected to Nister Wi-Fi.",
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
    body: "Open a fresh browser tab and type wifi.nister.org. Some devices need a direct visit before the page appears.",
  },
  {
    title: "Send what you see",
    body: "When asking for help, include your location, device and the message on your screen.",
  },
] as const;

export const homeSections = [
  {
    eyebrow: "Managed Wi-Fi for Hostels",
    title: "Better Wi-Fi for your residents. Less work for you.",
    body:
      "Nister helps you set up and manage your hostel Wi-Fi, control resident access, handle internet payments and see what the service is earning.",
  },
  {
    eyebrow: "After the connection",
    title: "You run the hostel. We help run the Wi-Fi.",
    body:
      "Nister manages what happens after internet reaches your hostel, including coverage, resident access, payments and service visibility.",
  },
  {
    eyebrow: "Already have fibre?",
    title: "Great. We may be able to work with it.",
    body:
      "Your provider brings internet to the building. Nister helps you turn that connection into a service your residents can actually use.",
  },
  {
    eyebrow: "Your Wi-Fi options",
    title: "Residents can pay, Wi-Fi can be included, or Nister can review helping with setup.",
    body:
      "Tell us what you want your hostel internet to do and we will recommend the setup that makes sense.",
  },
  {
    eyebrow: "Dashboard",
    title: "See what is happening at your hostel.",
    body:
      "Your dashboard can show residents online, internet sales, your earnings, network status and recent transactions where those apply.",
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
    placeholder: "Full name of the person Nister should contact",
  },
  {
    name: "contact_phone",
    label: "Best phone number",
    type: "tel",
    required: true,
    placeholder: "+233...",
    help: "Use a number the Nister team can call for hostel questions.",
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
    label: "Hostel name",
    type: "text",
    required: true,
    placeholder: "Hostel, apartment, student housing, or property name",
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
    placeholder: "Describe the route, landmarks, gates and blocks.",
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
    label: "Nearby campus or landmark",
    type: "text",
    placeholder: "University, polytechnic, training college, school, or landmark",
  },
  {
    name: "number_of_buildings",
    label: "Number of buildings",
    type: "number",
    min: 0,
    placeholder: "Buildings needing Wi-Fi",
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
    placeholder: "People who may need internet",
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
    label: "Does the hostel currently provide Wi-Fi?",
    type: "select",
    required: true,
    options: binaryYesNoOptions,
  },
  {
    name: "current_provider",
    label: "Current internet provider",
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
    label: "Managing who gets access is difficult.",
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
    label: "Preferred Wi-Fi setup",
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
    title: "Nister Wi-Fi for hostels",
    description: "Managed Wi-Fi for hostels that need better coverage, easier access, payments and visibility.",
  },
  {
    path: "/how-it-works",
    label: "How It Works",
    title: "How Nister Wi-Fi works",
    description: "What happens after you ask Nister to assess your hostel for managed Wi-Fi.",
  },
  {
    path: "/plans",
    label: "Plans",
    title: "Wi-Fi options for your hostel",
    description: "Choose whether residents pay, Wi-Fi is included, or Nister reviews helping with setup cost.",
  },
  {
    path: "/request-installation",
    label: "Request Nister",
    title: "Request a Nister hostel assessment",
    description: "Tell Nister about your hostel, rooms, residents and current internet.",
  },
  {
    path: "/resources",
    label: "Resources",
    title: "Practical hostel Wi-Fi guides",
    description: "Guides for hostel owners thinking about coverage, access, payments and installation.",
  },
  {
    path: "/faq",
    label: "FAQ",
    title: "Nister Wi-Fi frequently asked questions",
    description: "Answers about Nister Wi-Fi for hostels, residents, payments, coverage and support.",
  },
  {
    path: "/coverage",
    label: "Coverage",
    title: "Request Nister coverage",
    description: "Tell Nister where your hostel is so the team can review whether an assessment is possible.",
  },
  {
    path: "/about",
    label: "About",
    title: "About Nister Wi-Fi",
    description: "Nister helps hostels make internet easier to run and more useful to the property.",
  },
] as const satisfies readonly PublicRoute[];

export const faqItems = [
  {
    question: "Can Nister work with the fibre my hostel already has?",
    answer:
      "Yes, potentially. If your current connection is suitable, Nister may be able to manage the Wi-Fi, access and payments around it.",
  },
  {
    question: "Can residents pay for their own internet?",
    answer:
      "Yes. If that model fits your hostel, residents can buy the access they need while you see what the service is earning.",
  },
  {
    question: "Can Wi-Fi be included with accommodation instead?",
    answer:
      "Yes. Some hostels want internet to be part of the stay. Nister can help you offer managed Wi-Fi as a hostel amenity.",
  },
  {
    question: "Can Nister help with setup cost?",
    answer:
      "For selected hostels, Nister may consider helping with the network setup. It depends on the hostel and is not guaranteed.",
  },
  {
    question: "What details should I send first?",
    answer:
      "Send the hostel name, town, location or map pin, number of rooms, approximate residents and what internet problem you want solved.",
  },
  {
    question: "How do residents get online after installation?",
    answer:
      "Residents join Nister Wi-Fi, open wifi.nister.org, log in or buy access where needed, and use the internet once access is confirmed.",
  },
  {
    question: "Who should I contact if something is not working?",
    answer:
      "Use WhatsApp support and include the hostel name, town, device and what appears on screen.",
  },
] as const;

export const coverageAreas = [
  {
    region: "Tell us where your hostel is",
    towns: ["Hostel name", "Town", "Map pin"],
    focus: "Nister reviews new hostel requests when the location details are clear enough for assessment.",
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
    slug: "why-wifi-works-in-the-hallway-but-not-rooms",
    title: "Why Wi-Fi works in the hallway but not in your rooms",
    description: "Why a hostel can have internet in one place but still give residents a poor room experience.",
    category: "Coverage",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "3 min read",
    path: "/resources/why-wifi-works-in-the-hallway-but-not-rooms",
    sections: [
      {
        heading: "A signal at reception is not the same as hostel coverage",
        paragraphs: [
          "Many hostels start with a good connection near the office or reception area. The problem appears when residents try to use Wi-Fi behind walls, upstairs, in corner rooms or in a separate block.",
          "Rooms, doors, concrete, distance and the number of connected devices all affect the experience. That is why adding one more router often does not solve the whole problem.",
        ],
      },
      {
        heading: "Plan around where residents actually live",
        paragraphs: [
          "A useful Wi-Fi assessment looks at buildings, floors, rooms and where residents spend time. It also considers the current connection and the complaints residents already make.",
          "When you request Nister, describe the weak rooms or floors as plainly as possible. That helps the review focus on the real coverage problem.",
        ],
      },
    ],
  },
  {
    slug: "should-residents-pay-or-include-wifi",
    title: "Should residents pay for Wi-Fi, or should you include it in rent?",
    description: "How to think about separate resident internet payments compared with Wi-Fi included in accommodation.",
    category: "Wi-Fi choices",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "3 min read",
    path: "/resources/should-residents-pay-or-include-wifi",
    sections: [
      {
        heading: "When residents pay separately",
        paragraphs: [
          "Resident-paid Wi-Fi can make sense when internet use differs from person to person. A resident who needs more access can buy more, while someone with lighter use can buy less.",
          "The important part is to avoid manual collection. Payments should connect clearly to access so your hostel is not constantly checking who paid.",
        ],
      },
      {
        heading: "When Wi-Fi is included",
        paragraphs: [
          "Included Wi-Fi can make sense when you want internet to be part of what residents receive when they stay at your hostel. It is simpler to explain, but the service still needs to be managed properly.",
          "The better choice depends on your rooms, residents, budget and what kind of resident experience you want to offer.",
        ],
      },
    ],
  },
  {
    slug: "how-many-access-points-hostel-needs",
    title: "How many access points might your hostel need?",
    description: "Why room count, floors, walls and resident density matter more than a quick guess.",
    category: "Planning",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "3 min read",
    path: "/resources/how-many-access-points-hostel-needs",
    sections: [
      {
        heading: "The answer depends on the hostel",
        paragraphs: [
          "A small hostel with open corridors is different from a multi-block property with thick walls. The number of rooms matters, but so do floor layout, building materials and where residents actually use the internet.",
          "That is why Nister asks for buildings, floors, rooms and approximate residents before recommending a setup.",
        ],
      },
      {
        heading: "What to prepare before an assessment",
        paragraphs: [
          "Count the buildings and floors that need Wi-Fi. Note the rooms with weak signal. Share whether residents gather in courtyards, study rooms or outdoor spaces.",
          "A simple description is enough to begin. Estimates are better than silence.",
        ],
      },
    ],
  },
  {
    slug: "why-one-shared-wifi-password-becomes-a-problem",
    title: "Why one shared Wi-Fi password becomes a problem",
    description: "A plain-language guide to the access and payment problems created by shared hostel passwords.",
    category: "Access",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "3 min read",
    path: "/resources/why-one-shared-wifi-password-becomes-a-problem",
    sections: [
      {
        heading: "Shared passwords are simple at first",
        paragraphs: [
          "At the beginning, one Wi-Fi password feels easy. You give it to residents and they connect. The problem is that the password does not stay with only the people who should have it.",
          "It can be shared with visitors, old residents and people who have not paid. When the network slows down, everyone feels the effect.",
        ],
      },
      {
        heading: "Structured access is easier to manage",
        paragraphs: [
          "A better system gives residents their own way to use the service. It helps make access clearer, especially when residents pay for internet separately.",
          "If shared passwords are already causing problems at your hostel, include that in your Nister request.",
        ],
      },
    ],
  },
  {
    slug: "questions-before-hostel-wifi-installation",
    title: "What to ask before paying for a hostel Wi-Fi installation",
    description: "Questions that help you avoid spending money on Wi-Fi that still frustrates residents.",
    category: "Installation",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingTime: "4 min read",
    path: "/resources/questions-before-hostel-wifi-installation",
    sections: [
      {
        heading: "Ask what problem the installation is solving",
        paragraphs: [
          "Do you need better room coverage, a better way to control access, easier resident payments, more reliable equipment, or all of these together?",
          "A useful installation plan should match the real problem. Buying equipment without answering this question can leave you with the same complaints in a new form.",
        ],
      },
      {
        heading: "Ask how the service will be managed afterwards",
        paragraphs: [
          "The work does not end when devices are installed. Residents still need to connect, pay where needed, renew access, report problems and understand what to do when something changes.",
          "Before paying for hostel Wi-Fi, ask who will handle those day-to-day parts of the service.",
        ],
      },
      {
        heading: "Ask what you will be able to see",
        paragraphs: [
          "If internet matters to your hostel, you should not be blind after installation. Ask whether you will be able to see network status, resident activity and earnings where residents pay for access.",
        ],
      },
    ],
  },
] as const satisfies readonly ResourceArticle[];
