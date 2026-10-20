/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: { 50: '#f4f7f7', 100: '#e8eeee', 200: '#cdd9db', 300: '#aebfc2', 400: '#8c9fa3', 500: '#73888d', 600: '#52696f', 700: '#34494f', 800: '#26363c', 900: '#17252b', 950: '#101b20' },
        blue: { 50: '#effcf8', 100: '#d1f6e9', 200: '#a7edd7', 300: '#7ddfc3', 400: '#53cfad', 500: '#2ebc97', 600: '#167b65', 700: '#116451', 800: '#155142', 900: '#163f36', 950: '#0b2923' },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        }
      },
      fontFamily: {
        sans: ['Manrope Variable', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
