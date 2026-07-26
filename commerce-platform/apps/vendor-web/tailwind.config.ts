import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201d",
        forest: "#176b4d",
        paper: "#f5f7f6",
        line: "#d9dfdc",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(23,32,29,.06), 0 8px 24px rgba(23,32,29,.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
