/** @type {import('tailwindcss').Config} */
// Theme mirrors Priya's Avanse token set (mockups/meeting-room-booking/index.html :root).
// Colors are exposed as CSS vars in index.css so we keep one source of truth and can
// theme later; Tailwind references them via rgb/var indirection where useful.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        rail: 'var(--rail)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          press: 'var(--accent-press)',
        },
        busy: { DEFAULT: 'var(--busy)', edge: 'var(--busy-edge)', ink: 'var(--busy-ink)' },
        mine: { DEFAULT: 'var(--mine)', edge: 'var(--mine-edge)' },
        success: { DEFAULT: 'var(--success)', tint: 'var(--success-tint)', ink: 'var(--success-ink)' },
        danger: { DEFAULT: 'var(--danger)', tint: 'var(--danger-tint)', ink: 'var(--danger-ink)' },
        warn: { DEFAULT: 'var(--warn)', tint: 'var(--warn-tint)' },
        lime: 'var(--brand-lime)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        sm: 'var(--sh-sm)',
        DEFAULT: 'var(--sh)',
        pop: 'var(--sh-pop)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Jost', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'grad-brand': 'var(--grad-brand)',
        'grad-lime': 'var(--grad-lime)',
      },
    },
  },
  plugins: [],
}
