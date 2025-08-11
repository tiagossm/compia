/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/react-app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // COMPIA Brand Colors
        'compia-blue': '#3B82F6',
        'compia-purple': '#8B5CF6', 
        'compia-green': '#10B981',
        'compia-gray': {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // Keep existing color mappings but with COMPIA palette
        primary: '#3B82F6',
        secondary: '#8B5CF6',
        success: '#10B981',
      },
      fontFamily: {
        'heading': ['Montserrat', 'system-ui', '-apple-system', 'sans-serif'],
        'body': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
