/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f0ff',
          100: '#e1e1ff',
          200: '#c3c3ff',
          300: '#a5a5ff',
          400: '#8787ff',
          500: '#7879F1',
          600: '#6a6ae8',
          700: '#5c5cd9',
          800: '#4e4ecb',
          900: '#4040bd',
        },
        blue: {
          50: '#f0f0ff',
          100: '#e1e1ff',
          200: '#c3c3ff',
          300: '#a5a5ff',
          400: '#8787ff',
          500: '#7879F1',
          600: '#6a6ae8',
          700: '#5c5cd9',
          800: '#4e4ecb',
          900: '#4040bd',
        },
        chat: {
          bg: '#ffffff',
          sidebar: '#f8fafc',
          message: {
            sent: '#7879F1',
            received: '#f1f5f9',
            text: {
              sent: '#ffffff',
              received: '#1e293b',
            }
          },
          border: '#e2e8f0',
          hover: '#f1f5f9',
          selected: '#e1e1ff',
        },
        dark: {
          bg: '#0f172a',
          sidebar: '#1e293b',
          message: {
            sent: '#7879F1',
            received: '#334155',
            text: {
              sent: '#ffffff',
              received: '#f1f5f9',
            }
          },
          border: '#334155',
          hover: '#1e293b',
          selected: '#4040bd',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'bounce-in': 'bounceIn 0.5s ease-out',
        'typing': 'typing 1.4s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        typing: {
          '0%, 60%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-10px)' },
        },
      },
      boxShadow: {
        'chat': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'chat-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
} 