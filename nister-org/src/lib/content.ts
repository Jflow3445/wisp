export const EXTERNAL_LINKS = {
  main: "https://nister.org/",
  network: "https://wifi.nister.org/",
  login: "https://pay.nister.org/",
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
    body: "Stay connected to Nister Wi-Fi, then open this address in your browser.",
  },
  {
    title: "Login",
    body: "Enter your details, voucher, or phone number when the access page asks for it.",
  },
  {
    title: "Browse",
    body: "Once you are approved, use the internet for study, work, calls, payments, and everyday browsing.",
  },
] as const;

export const networkExperiencePanels = [
  {
    eyebrow: "At a hostel",
    title: "Find the network and get back to what you came to do.",
    body:
      "Whether you need to study, message home, submit work, stream a class, or make a payment, start by joining Nister Wi-Fi from your device.",
  },
  {
    eyebrow: "In a remote area",
    title: "Stay connected while the login page checks your device.",
    body:
      "Do not switch back to mobile data during login. The access page can recognize you only while your device is on the local Nister Wi-Fi network.",
  },
  {
    eyebrow: "Away from coverage",
    title: "You can read the steps here, but you must be on-site to login.",
    body:
      "If you are seeing this page through mobile data or another internet provider, return to a Nister Wi-Fi location before trying to buy access or check status.",
  },
] as const;

export const networkPreLoginChecks = [
  "You are at a hostel, community location, or coverage area where Nister Wi-Fi is available.",
  "Your phone, tablet, or laptop is connected to Nister Wi-Fi.",
  "You opened wifi.nister.org after joining the Wi-Fi network.",
  "Your phone number, voucher, or access details are ready if the login page asks for them.",
] as const;

export const networkTroubleshootingSteps = [
  {
    title: "Stay on Nister Wi-Fi",
    body: "If your phone returns to mobile data, reconnect to Nister Wi-Fi and refresh wifi.nister.org.",
  },
  {
    title: "Try the address again",
    body:
      "Open a fresh browser tab and type wifi.nister.org. Some devices need a manual visit before the login page appears.",
  },
  {
    title: "Ask for help with your location",
    body:
      "Tell support where you are, what device you are using, and what message you see. That makes the problem easier to find.",
  },
] as const;

export const homeSections = [
  {
    eyebrow: "The access gap",
    title: "Internet access should not depend on where people live or study.",
    body:
      "About 2.2 billion people remain offline globally, and the rural access gap is still visible: ITU reported 83% urban internet use compared with 48% rural internet use in 2024. For hostels and remote communities, that gap becomes lost study time, harder communication, and fewer digital opportunities.",
  },
  {
    eyebrow: "What Nister Wi-Fi provides",
    title: "Managed connectivity for places standard providers often overlook.",
    body:
      "Nister Wi-Fi provides practical internet access for hostels and remote communities where connectivity needs to be shared, supportable, and simple for users to understand.",
  },
  {
    eyebrow: "For hostels",
    title: "A clearer Wi-Fi experience for residents and operators.",
    body:
      "Hostel residents need dependable access for study, communication, research, and daily services. Operators need a structured network experience that reduces confusion around login, payment, and access instructions.",
  },
  {
    eyebrow: "For remote communities",
    title: "Connectivity that can support daily life beyond city centers.",
    body:
      "Remote communities need internet access models that can work in real conditions. Nister Wi-Fi focuses on practical coverage points that help people learn, communicate, work, and reach essential digital services.",
  },
  {
    eyebrow: "Expansion case",
    title: "Why this, why now.",
    body:
      "Reliable internet access is now a foundation for learning, work, payments, public information, and community participation. Targeted Wi-Fi deployments can help close access gaps for hostels and remote communities when supported by the right partners.",
  },
] as const;
