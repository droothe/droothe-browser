/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        browser: {
          base: "#090d16",
          panel: "#0f172a",
          indigo: "#4f46e5",
          cyan: "#06b6d4",
        },
      },
    },
  },
  plugins: [],
};
