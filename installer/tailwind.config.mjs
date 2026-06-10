/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        // Baloo 2 = rounded, friendly display; Nunito = warm, readable body/UI.
        display: ['"Baloo 2"', 'system-ui', 'cursive'],
        sans: ['"Nunito"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // "Sprout" — driven by CSS variables so Light/Dark flip via `data-theme`.
        // Accent colors use the `<alpha-value>` channel form so Tailwind opacity
        // modifiers (e.g. text-coral/60, bg-danger/[0.07]) keep working.
        bg: {
          DEFAULT: 'var(--bg)',
          card: 'var(--card)',
          tile: 'var(--tile)',
          well: 'var(--well)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          dim: 'var(--ink-dim)',
          faint: 'var(--ink-faint)',
        },
        green: {
          DEFAULT: 'rgb(var(--green-rgb) / <alpha-value>)',
          bright: 'var(--green-bright)',
          deep: 'var(--green-deep)',
        },
        coral: 'rgb(var(--coral-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
        mint: 'var(--mint)',
        peach: 'var(--peach)',
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
      },
      borderRadius: {
        card: '28px',
        tile: '18px',
        field: '14px',
      },
      boxShadow: {
        glow: '0 14px 26px -8px rgba(47, 214, 143, 0.6)',
        card: '0 30px 60px -28px rgba(0, 0, 0, 0.65)',
      },
    },
  },
  plugins: [],
};
