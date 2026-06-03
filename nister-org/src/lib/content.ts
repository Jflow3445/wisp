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
    eyebrow: "The access gap",
    title: "People should not lose opportunities because the internet stops at their doorstep.",
    body:
      "About 2.2 billion people remain offline globally, and the rural access gap is still visible: ITU reported 83% urban internet use compared with 48% rural internet use in 2024. In hostels and remote communities, that gap shows up as lost study time, missed messages, harder payments, and fewer digital opportunities.",
  },
  {
    eyebrow: "What Nister Wi-Fi provides",
    title: "Shared Wi-Fi that is easier to find, use, and support.",
    body:
      "Nister Wi-Fi provides practical internet access for hostels and remote communities where people need a clear way to get online and operators need a network experience they can explain.",
  },
  {
    eyebrow: "For hostels",
    title: "Less confusion for residents. A cleaner flow for operators.",
    body:
      "Residents need internet for study, communication, research, and daily services. Hostel operators need clear log-in, payment, and access instructions so support questions do not become the whole Wi-Fi experience.",
  },
  {
    eyebrow: "For remote communities",
    title: "A practical connection point for daily life beyond city centers.",
    body:
      "Remote communities need access models that can work in real conditions. Nister Wi-Fi focuses on coverage points that help people learn, communicate, work, and reach essential digital services.",
  },
  {
    eyebrow: "Expansion case",
    title: "The case for focused Wi-Fi expansion.",
    body:
      "Reliable internet access now supports learning, work, payments, public information, and community participation. Targeted Wi-Fi deployments can help close access gaps for hostels and remote communities when the right partners support them.",
  },
] as const;
