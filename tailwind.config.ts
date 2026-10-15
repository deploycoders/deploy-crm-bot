import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#08111f",
        panel: "#101927",
        line: "rgba(148, 163, 184, 0.18)",
        signal: "#37f29a",
      },
      boxShadow: {
        glow: "0 0 32px rgba(55, 242, 154, 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
