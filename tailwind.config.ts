import type { Config } from "tailwindcss";

const config: Config = {
  // dark: 使用 class 策略，支持手动切换暗色模式
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 主色：翡翠绿（与小柯盘风格对齐）
        primary: {
          50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7",
          400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857",
          800: "#065f46", 900: "#064e3b",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto",
          "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
