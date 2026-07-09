import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        parchment: {
          DEFAULT: "rgb(var(--parchment) / <alpha-value>)",
          dim: "rgb(var(--parchment-dim) / <alpha-value>)",
          faint: "rgb(var(--parchment-faint) / <alpha-value>)",
        },
        carimbo: {
          DEFAULT: "rgb(var(--carimbo) / <alpha-value>)",
          bright: "rgb(var(--carimbo-bright) / <alpha-value>)",
        },
        selo: "rgb(var(--selo) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        jade: "rgb(var(--jade) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        rise: "rise 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
