/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050b1a',
          900: '#081127',
          850: '#0b1631',
          800: '#0f1d3d',
          700: '#172a52',
          600: '#22386a',
          500: '#3a5185',
        },
        accent: {
          DEFAULT: '#2dd4bf',
          soft: '#5eead4',
          deep: '#0f766e',
        },
        ink: {
          DEFAULT: '#e6edf7',
          muted: '#9fb0cc',
          faint: '#6b7fa3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        'pulse-ring': { '0%': { transform: 'scale(1)', opacity: '0.6' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
      },
      animation: {
        'fade-up': 'fade-up 300ms ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
