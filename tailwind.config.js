/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/renderer/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Cairo',
          'IBM Plex Sans Arabic',
          'Inter',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};
