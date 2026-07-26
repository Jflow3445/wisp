import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18201e",
        navy: "#1e3a5f",
        paper: "#f4f6f7",
        line: "#d8dee1",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(24,32,30,.06), 0 8px 24px rgba(24,32,30,.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
