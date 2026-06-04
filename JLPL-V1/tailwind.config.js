/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        jira: {
          blue: '#0052cc',
          'blue-dark': '#003d99',
          'blue-light': '#deebff',
          orange: '#f5a623',
          green: '#5cb85c',
          navy: '#006293',
        },
      },
    },
  },
  plugins: [],
}
