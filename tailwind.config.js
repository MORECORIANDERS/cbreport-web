/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        // 品牌主色：紫色
        brand: {
          DEFAULT: '#8250DF',
          50: '#F5F0FD',
          100: '#EBE0FB',
          200: '#D6BDF7',
          300: '#BD9BF3',
          400: '#A878EE',
          500: '#8250DF',
          600: '#6E3FC4',
          700: '#5A30A8',
          800: '#472485',
          900: '#341A62'
        },
        // 涨跌色（A股惯例：红涨绿跌）
        up: '#FF4757',
        down: '#2ED573',
        gold: '#FDCB6E',
        // 文本层级
        ink: {
          DEFAULT: '#2D3436',
          medium: '#636E72',
          light: '#B2BEC3'
        },
        // 卡片 / 边框 / 分隔线
        surface: {
          DEFAULT: '#FFFFFF',
          alt: '#F8F9FA',
          border: '#E8E8E8',
          separator: '#E0E0E0',
          page: '#F1F2F6'
        }
      },
      fontFamily: {
        sans: ['"Noto Sans CJK SC"', '"PingFang SC"', '"WenQuanYi Micro Hei"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"DejaVu Sans Mono"', '"Consolas"', 'monospace'],
        script: ['"Segoe Script"', '"Palatino Linotype"', 'Georgia', 'serif']
      },
      maxWidth: {
        report: '750px'
      },
      // 自定义最大宽度断点：与原 CSS @media (max-width: 600px/380px) 对齐
      screens: {
        'mobile': { raw: '(max-width: 600px)' },
        'tiny': { raw: '(max-width: 380px)' }
      }
    }
  },
  plugins: []
};
