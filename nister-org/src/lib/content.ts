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
    body: "Enter your phone number and Wi-Fi password.",
  },
  {
    title: "Browse",
    body: "Your active plan connects you to the internet.",
  },
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
