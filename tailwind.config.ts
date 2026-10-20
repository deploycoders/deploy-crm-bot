import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#051424",
        panel: "#0d1c2d",
        line: "rgba(28, 43, 60, 0.7)",
        signal: "#4edea3",
        // Cockpit theme tokens
        primary: "#4edea3",
        "primary-container": "#10b981",
        "on-primary": "#003824",
        "on-primary-container": "#00422b",
        secondary: "#45dfa4",
        "secondary-container": "#00bd85",
        "on-secondary": "#003825",
        tertiary: "#ffb95f",
        "tertiary-container": "#e29100",
        background: "#051424",
        surface: "#051424",
        "surface-container-lowest": "#010f1f",
        "surface-container-low": "#0d1c2d",
        "surface-container": "#122131",
        "surface-container-high": "#1c2b3c",
        "surface-container-highest": "#273647",
        "surface-bright": "#2c3a4c",
        "on-surface": "#d4e4fa",
        "on-surface-variant": "#bbcabf",
        outline: "#86948a",
        "outline-variant": "#3c4a42",
        error: "#ffb4ab",
        "error-container": "#93000a",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        glow: "0 0 32px rgba(78, 222, 163, 0.18)",
        card: "0 1px 8px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
