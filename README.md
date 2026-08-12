# 可转债看板 Web 版

> 每日自动更新的可转债市场看板页面，部署在 GitHub Pages。

## 页面地址

https://morecorianders.github.io/cbreport-web/

## 技术栈

- **HTML + Vanilla JS**：单文件渲染，无前端框架依赖
- **Tailwind CSS 3**（CLI 构建模式）：工具类驱动样式，构建产物提交到仓库
- **GitHub Pages**：纯静态托管

## 项目结构

```
.
├── index.html              # 页面 + 渲染脚本
├── data.json               # 由 CloudBase 云函数推送的最新数据
├── styles.css              # Tailwind 构建产物（提交到仓库，GitHub Pages 直接使用）
├── src/input.css           # Tailwind 入口（含 @tailwind 指令与组件层）
├── tailwind.config.js      # Tailwind 配置（自定义色板、字体、断点）
├── package.json            # npm 脚本：build / dev / serve
└── README.md
```

## 本地开发

```bash
# 安装依赖（首次）
npm install

# 同时起 Tailwind watch + 本地静态服务（推荐开两个终端）
npm run dev      # 监听 src/input.css 变化，自动重建 styles.css
npm run serve    # 启动 http://localhost:8000

# 或一次性构建生产 CSS
npm run build
```

> 修改 `index.html` 或 `src/input.css` 后，记得运行 `npm run build` 重建 `styles.css` 并提交，
> 因为 GitHub Pages 直接读取仓库中的 `styles.css`，没有构建步骤。

## 设计系统

| Token | 值 | 用途 |
|------|------|------|
| `brand` | `#8250DF` | 品牌主色：标题、模块竖条、表头背景、关键字段 |
| `up` | `#FF4757` | 涨幅色（A 股惯例：红涨） |
| `down` | `#2ED573` | 跌幅色（绿跌） |
| `gold` | `#FDCB6E` | 数值条形图填充色 |
| `ink` / `ink-medium` / `ink-light` | `#2D3436` / `#636E72` / `#B2BEC3` | 文本三级灰度 |
| `surface-page` | `#F1F2F6` | 页面背景 |
| `surface-alt` | `#F8F9FA` | 表格隔行底色 |

断点：`mobile` (max-width: 600px)、`tiny` (max-width: 380px)，与原 CSS 的两段 `@media` 一致。

## 更新机制

- **更新时间**：每个工作日 15:15（北京时间）自动更新
- **数据来源**：A 股可转债公开市场数据
- **生成方式**：腾讯云 CloudBase 云函数自动查询数据库、计算统计指标、生成 `data.json` 并推送到本仓库
- **页面渲染**：客户端 `fetch('data.json')` 后由 `index.html` 中的脚本动态渲染

## 页面内容

| 模块 | 说明 |
|------|------|
| 市场概况 | 上涨/下跌/平盘数量、总成交额、价格/涨幅/成交额中位数 |
| 价格分布 | 按价格区间统计可转债分布 |
| 行业分布 | 按行业统计可转债分布 |
| 涨幅 TOP10 | 当日涨幅前 10 名 |
| 成交额 TOP10 | 当日成交额前 10 名 |
| 跌幅 TOP10 | 当日跌幅前 10 名 |

## 数据新鲜度标注

页面顶部会显示彩色标签，标注数据时效性：

- 绿色 今日数据 - 数据日期为当天
- 黄色 昨日数据 - 数据日期为前一天
- 橙色 N日前数据 - 数据日期为 2-3 天前
- 红色 N日前数据 - 数据日期超过 3 天

## 免责声明

本页面数据来自公开数据源，仅整理供学习研究，不作为投资建议。
