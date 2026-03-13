/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        carris: {
          yellow: '#FFCC00',
          dark: '#121212',
          gray: '#1E1E1E',
          light: '#F5F5F5'
        }
      }
    },
  },
  plugins: [],
}
