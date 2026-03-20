import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-sans)", "system-ui", "sans-serif"],
        serif:   ["var(--font-serif)", "Georgia", "serif"],
        display: ["var(--font-serif)", "Georgia", "serif"],
      },
      colors: {
        // Milano palette
        mi: {
          bg:           "#FAF9F6",
          card:         "#FFFFFF",
          sidebar:      "#FFFFFF",
          border:       "#E7E5E4",
          divider:      "#F0EFED",
          primary:      "#B84C2E",
          "primary-dark": "#7A3420",
          secondary:    "#D4A055",
          hover:        "#F7F5F2",
          "active-bg":  "#FEF2ED",
          text:         "#1C1917",
          muted:        "#78716C",
          subtle:       "#A8A29E",
          stats:        "#F5F3F0",
        },
        // shadcn tokens
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        border: "var(--border)",
        ring:   "var(--ring)",
      },
      borderRadius: {
        card: "12px",
        xl:   "12px",
        "2xl": "16px",
        "3xl": "20px",
      },
      boxShadow: {
        card:       "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
        "card-md":  "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        "card-lg":  "0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
