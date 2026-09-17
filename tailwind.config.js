/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Three explicit roles. Defining `sans` here also settles the app-wide
      // default: Tailwind's preflight sets html { font-family: theme(fontFamily.sans) },
      // so body text becomes a deliberate choice rather than falling through to
      // whatever ui-sans-serif resolves to on the device.
      fontFamily: {
        // Body and UI text. Named explicitly rather than relying on Tailwind's
        // default stack, so the app reads the same on macOS, Windows and Android.
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto',
          'Helvetica Neue', 'Arial', 'system-ui', 'sans-serif',
        ],
        // Labels and data. Unchanged — this is already used in ~50 places.
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Headers and display numbers. Applied to h1–h6 in index.css; use the
        // `font-display` utility for hero figures, which are divs, not headings.
        display: ['Syne', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
