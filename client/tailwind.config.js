/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Mobile-first large tap targets
      spacing: {
        'tap': '44px',
      },
    },
  },
  plugins: [],
};
