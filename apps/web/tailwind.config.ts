import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Hearth palette — design source of truth (design-specification.md §3)
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        line: 'var(--line)',
        sage: 'var(--sage)',
        warning: 'var(--warning)',
        bin: {
          burgundy: 'var(--bin-burgundy)',
          blue: 'var(--bin-blue)',
          grey: 'var(--bin-grey)',
        },

        // shadcn/ui semantic names — remapped onto the Hearth tokens above
        border: 'var(--line)',
        input: 'var(--line)',
        ring: 'var(--accent)',
        background: 'var(--bg)',
        foreground: 'var(--ink)',
        primary: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--sage)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--accent-soft)',
          foreground: 'var(--muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--warning)',
          foreground: 'var(--destructive-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--ink)',
        },
        popover: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--ink)',
        },
      },
      fontFamily: {
        // design-specification.md §4
        sans: ['Hanken Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // design-specification.md §5
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        control: '10px',
        inner: '14px',
        card: '20px',
        pill: '999px',
        frame: '26px',
        'frame-phone': '38px',
      },
      boxShadow: {
        // Single ambient shadow — device frame only (design spec §5)
        ambient: '0 20px 50px -28px rgba(60, 40, 20, 0.45)',
      },
    },
  },
  plugins: [animate],
} satisfies Config
