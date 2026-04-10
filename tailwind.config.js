/* eslint-disable @typescript-eslint/no-require-imports */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "#0188B1",
          foreground: "#ffffff",
          50: "#e6f6fb",
          100: "#ccecf7",
          200: "#99d8ee",
          300: "#66c5e6",
          400: "#33b1dd",
          500: "#0188B1",
          600: "#016d8e",
          700: "#01526b",
          800: "#003648",
          900: "#001b24",
        },
        accent: {
          DEFAULT: "#0389B5",
          foreground: "#ffffff",
        },
        surface: {
          DEFAULT: "#0b1220",
          elevated: "#111827",
          muted: "#1f2937",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
