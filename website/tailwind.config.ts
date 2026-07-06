import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        night: '#06050f',
        'night-card': '#0e0d1e',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
      },
      boxShadow: {
        'glow-blue': '0 0 40px rgba(59,130,246,0.25)',
        'glow-purple': '0 0 40px rgba(139,92,246,0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
