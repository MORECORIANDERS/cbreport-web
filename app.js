(function () {
  "use strict";

  // ===== 列名常量(消除魔法字符串,防止 data.json 改列名时静默失效) =====
  const COL = {
    RANK: "排名",
    CHANGE: "涨幅",
    CHANGE_MEDIAN: "涨幅中位数",
    BOND: "可转债",
    PRICE: "价格",
    AMOUNT: "成交额(亿)",
    INDUSTRY1: "行业一级",
    INDUSTRY2: "行业二级",
    REMAINING: "剩余规模",
    EXPIRE: "到期日期",
    AMOUNT_MEDIAN: "成交额中位数(亿)",
    PRICE_RANGE: "价格区间",
    COUNT: "数量",
    UP_COUNT: "上涨",
    DOWN_COUNT: "下跌",
  };

  // 居中显示的列(数值类需要居中,文本左对齐)
  const CENTER_COLS = [
    COL.RANK,
    COL.CHANGE,
    COL.PRICE,
    COL.AMOUNT,
    COL.BOND,
    COL.INDUSTRY1,
    COL.INDUSTRY2,
    COL.REMAINING,
    COL.EXPIRE,
    COL.CHANGE_MEDIAN,
    COL.AMOUNT_MEDIAN,
    COL.PRICE_RANGE,
    COL.COUNT,
    COL.UP_COUNT,
    COL.DOWN_COUNT,
  ];

  // 5 张表的列宽配置(视觉决策,留在前端更合理)
  const DIST_COL_WIDTHS = [0.18, 0.1, 0.08, 0.08, 0.16, 0.2, 0.2];
  const TOP10_COL_WIDTHS = [0.05, 0.12, 0.08, 0.1, 0.14, 0.13, 0.13, 0.13, 0.12];

  // ===== 工具函数 =====
  // 转义 HTML 特殊字符防 XSS(表格用 v-html 渲染,拼接时仍需手动转义)
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 涨跌色:A股惯例红涨绿跌
  // 在 Petite-Vue 模板里通过 :class="stat.valueClass" 绑定
  function gainColorClass(val) {
    const n = parseFloat(String(val).replace("%", ""));
    if (isNaN(n)) return "text-ink";
    if (n > 0) return "text-up font-bold";
    if (n < 0) return "text-down font-bold";
    return "text-ink font-bold";
  }

  // schema 校验:数据残缺时报错信息对用户友好
  function validateData(data) {
    if (!data || typeof data !== "object") return "数据格式错误";
    if (!data.tradeDate) return "缺少交易日期";
    if (!data.market || typeof data.market !== "object") return "缺少市场概况";
    if (!data.tables || typeof data.tables !== "object") return "缺少表格数据";
    const requiredTables = ["priceDist", "industryDist", "topGainers", "topAmount", "topLosers"];
    for (let i = 0; i < requiredTables.length; i++) {
      const t = data.tables[requiredTables[i]];
      if (!t || !Array.isArray(t.rows) || !Array.isArray(t.colLabels)) {
        return "缺少表格或表格结构异常: " + requiredTables[i];
      }
    }
    return null;
  }

  // ===== freshness 彩色标签:颜色+文案都按 dayDiff 动态变化 =====
  // 返回带 class 的 span HTML 字符串,模板里用 v-html 渲染
  // (label 内容是固定枚举,无注入风险)
  function freshnessHTML(tradeDate) {
    function toBJMidnight(date) {
      const bjOffset = 8 * 3600 * 1000;
      return Math.floor((date.getTime() + bjOffset) / 86400000) * 86400000;
    }
    const nowBJ = toBJMidnight(new Date());
    const trade = toBJMidnight(new Date(tradeDate + "T00:00:00"));
    const dayDiff = Math.round((nowBJ - trade) / 86400000);

    let label, cls;
    if (dayDiff < 0) {
      label = "未来数据";
      cls = "bg-[#e2e3e5] text-[#383d41]";
    } else if (dayDiff === 0) {
      label = "今日数据";
      cls = "bg-[#d4edda] text-[#155724]";
    } else if (dayDiff === 1) {
      label = "昨日数据";
      cls = "bg-[#fff3cd] text-[#856404]";
    } else if (dayDiff >= 2 && dayDiff <= 3) {
      label = dayDiff + "日前数据";
      cls = "bg-[#ffe8a3] text-[#856404]";
    } else {
      label = dayDiff + "日前数据";
      cls = "bg-[#f8d7da] text-[#721c24]";
    }
    return '<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ' + cls + '">' + label + "</span>";
  }

  // ===== 表格 HTML 生成(行列数每天变,必须动态生成) =====
  // sticky 列、bar 图逻辑复杂,保留字符串拼接比改写成 v-for 更清晰
  function buildTableHTML(tableData, colWidths, stickyCount, caption) {
    stickyCount = stickyCount || 1;
    const colLabels = tableData.colLabels;
    const rows = tableData.rows;
    const barColIndices = tableData.barColIndices || [];
    const changePctCol = tableData.changePctCol;

    // 计算 bar 最大值
    const maxBarValues = {};
    barColIndices.forEach(function (idx) {
      const label = colLabels[idx] || "";
      const isBidi = label.indexOf(COL.CHANGE_MEDIAN) >= 0;
      let maxVal = 0;
      rows.forEach(function (r) {
        const v = r[idx];
        if (v === "-" || v === "") return;
        const n = parseFloat(String(v).replace("%", ""));
        if (!isNaN(n)) maxVal = Math.max(maxVal, isBidi ? Math.abs(n) : n);
      });
      maxBarValues[idx] = maxVal || 1;
    });

    // 冻结列固定宽度(仅"排名"列固定 36px)
    const frozenWidths = [];
    for (let i = 0; i < stickyCount; i++) {
      frozenWidths.push((colLabels[i] || "") === COL.RANK ? 36 : 0);
    }
    const leftOffsets = [];
    let acc = 0;
    for (let i = 0; i < stickyCount; i++) {
      leftOffsets.push(acc);
      acc += frozenWidths[i];
    }

    // 表头(scope="col" 让屏幕阅读器明确这是列头)
    const headCells = colLabels
      .map(function (label, i) {
        const isSticky = i < stickyCount;
        const baseClass =
          "bg-brand text-white text-[13px] font-bold px-1 py-[7px] text-center whitespace-nowrap mobile:py-[5px] mobile:text-[11px]";
        if (isSticky) {
          const w = frozenWidths[i];
          const styleParts = ["left:" + leftOffsets[i] + "px", "z-index:3"];
          if (w > 0) {
            styleParts.push("width:" + w + "px", "min-width:" + w + "px");
          }
          return (
            '<th scope="col" class="' +
            baseClass +
            ' sticky" style="' +
            styleParts.join(";") +
            '">' +
            esc(label) +
            "</th>"
          );
        }
        const w2 = colWidths ? colWidths[i] * 100 : 100 / colLabels.length;
        return '<th scope="col" class="' + baseClass + '" style="width:' + w2.toFixed(1) + '%">' + esc(label) + "</th>";
      })
      .join("");

    // 表体
    const bodyRows = rows
      .map(function (row, r) {
        const isAlt = r % 2 === 1;
        const rowBg = isAlt ? "bg-surface-alt" : "bg-white";

        const cells = colLabels
          .map(function (colName, c) {
            const val = String(row[c] != null ? row[c] : "");
            const isNumeric = /^[-]?[\d,]+\.?\d*%?$/.test(val.trim());
            const isCenter = !isNumeric || CENTER_COLS.indexOf(colName) >= 0;
            const alignClass = isCenter ? "text-center" : "text-left pl-2";

            // 颜色:涨幅列红涨绿跌;"涨幅中位数"列除外(保持中性)
            let colorClass = "text-ink";
            const isChangeCol = c === changePctCol || colName === COL.CHANGE;
            if (isChangeCol) {
              colorClass = gainColorClass(val);
            }
            if (colName === COL.CHANGE_MEDIAN) {
              colorClass = "text-ink font-normal";
            }

            // 涨跌符号:仅给"涨幅"列加(让色盲用户也能区分涨跌)
            let displayVal = val;
            if (isChangeCol && val !== "-" && val !== "") {
              const n = parseFloat(String(val).replace("%", ""));
              if (!isNaN(n) && n !== 0) {
                displayVal = (n > 0 ? "▲ " : "▼ ") + val;
              }
            }

            const isMono = isNumeric || /^[\d.%-]+$/.test(val.trim());
            const monoClass = isMono ? "font-mono" : "";

            // sticky 列:需要带背景色以遮盖滚动内容
            let stickyClass = "";
            let stickyStyle = "";
            if (c < stickyCount) {
              const w = frozenWidths[c];
              const styleParts = ["left:" + leftOffsets[c] + "px", "z-index:2"];
              if (w > 0) {
                styleParts.push("width:" + w + "px", "min-width:" + w + "px");
              }
              stickyStyle = ' style="' + styleParts.join(";") + '"';
              stickyClass = " sticky " + rowBg;
            }

            // bar 渲染(aria-hidden="true" 让屏幕阅读器跳过装饰性可视化)
            let barHtml = "";
            if (barColIndices.indexOf(c) >= 0 && val !== "-" && val !== "") {
              const rawNum = parseFloat(String(val).replace("%", ""));
              if (!isNaN(rawNum)) {
                const isBidi = colName.indexOf(COL.CHANGE_MEDIAN) >= 0;
                if (isBidi) {
                  const ratio = Math.min(Math.abs(rawNum) / (maxBarValues[c] || 1), 1);
                  const barW = 45 * ratio;
                  if (rawNum >= 0) {
                    barHtml =
                      '<div class="bar-track-bidi" aria-hidden="true"><div class="bar-right" style="width:' +
                      barW +
                      '%;background:#FF4757"></div></div>';
                  } else {
                    barHtml =
                      '<div class="bar-track-bidi" aria-hidden="true"><div class="bar-left" style="width:' +
                      barW +
                      '%;background:#2ED573"></div></div>';
                  }
                } else if (rawNum > 0) {
                  const ratio2 = Math.min(rawNum / (maxBarValues[c] || 1), 1);
                  const barW2 = 90 * ratio2;
                  barHtml =
                    '<div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:' +
                    barW2 +
                    '%;background:#FDCB6E"></div></div>';
                }
              }
            }
            const tdPos = barHtml ? " relative" : "";
            const tdClass =
              alignClass +
              " " +
              monoClass +
              " " +
              colorClass +
              (stickyClass ? " " + stickyClass : "") +
              " whitespace-nowrap px-1 py-[5px] border-b border-surface-separator text-[13px] mobile:py-1 mobile:text-[11px]" +
              tdPos;
            return '<td class="' + tdClass + '"' + stickyStyle + ">" + esc(displayVal) + barHtml + "</td>";
          })
          .join("");

        return '<tr class="' + rowBg + '">' + cells + "</tr>";
      })
      .join("");

    const captionHtml = caption ? '<caption class="sr-only">' + esc(caption) + "</caption>" : "";

    return (
      '<div class="table-wrapper">' +
      '<table class="w-full text-[13px] mobile:text-[11px] mobile:min-w-[480px] border-collapse">' +
      captionHtml +
      "<thead><tr>" +
      headCells +
      "</tr></thead>" +
      "<tbody>" +
      bodyRows +
      "</tbody>" +
      "</table>" +
      "</div>"
    );
  }

  // ===== Petite-Vue 应用 =====
  // 数据加载完后调用 mount,把 data 注入响应式作用域
  // 模板里的 {{ data.market.up }} / {{ stat.main }} / :class="stat.valueClass" 都从这里取值
  function App(initialData) {
    return {
      // 状态
      loading: false,
      errorMsg: "",
      data: initialData || { market: {}, tables: {} },

      // ===== 计算属性:在模板里直接访问 =====

      // freshness 标签 HTML(颜色+文案都按 dayDiff 算,必须 JS 生成)
      get freshnessHTML() {
        if (!this.data.tradeDate) return "";
        return freshnessHTML(this.data.tradeDate);
      },

      // 左栏 3 个指标(配置驱动:标签、主值、副值、颜色)
      // 配置数组让 HTML 模板能用 v-for 渲染,避免重复写 3 遍结构
      get leftStats() {
        const m = this.data.market || {};
        return [
          { label: "总成交额", main: m.totalAmount, sub: null, valueClass: "text-brand" },
          { label: "涨幅前十", main: m.top10Gain, sub: m.top10GainPct, valueClass: "text-brand" },
          { label: "涨幅前二十", main: m.top20Gain, sub: m.top20GainPct, valueClass: "text-brand" },
        ];
      },

      // 右栏 3 个指标
      get rightStats() {
        const m = this.data.market || {};
        return [
          { label: "价格中位数", main: m.priceMedian, sub: null, valueClass: "text-brand" },
          // 涨幅中位数:按正负切换颜色类(用函数返回,模板里 :class="stat.valueClass" 绑定)
          { label: "涨幅中位数", main: m.gainMedian, sub: null, valueClass: gainColorClass(m.gainMedian) },
          { label: "成交额中位数", main: m.amountMedian, sub: null, valueClass: "text-brand" },
        ];
      },

      // 进度条三段宽度(按 up/flat/down 占比算)
      get upPct() {
        const m = this.data.market || {};
        const up = parseFloat(m.up) || 0;
        const total = up + (parseFloat(m.down) || 0) + (parseFloat(m.flat) || 0) || 1;
        return (up / total) * 100;
      },
      get flatPct() {
        const m = this.data.market || {};
        const flat = parseFloat(m.flat) || 0;
        const total = (parseFloat(m.up) || 0) + flat + (parseFloat(m.down) || 0) || 1;
        return (flat / total) * 100;
      },
      get downPct() {
        const m = this.data.market || {};
        const down = parseFloat(m.down) || 0;
        const total = (parseFloat(m.up) || 0) + (parseFloat(m.flat) || 0) + down || 1;
        return (down / total) * 100;
      },

      // 进度条 aria-label(屏幕阅读器念出来)
      get barAriaLabel() {
        const m = this.data.market || {};
        const up = parseFloat(m.up) || 0;
        const flat = parseFloat(m.flat) || 0;
        const down = parseFloat(m.down) || 0;
        return "上涨 " + up + " 家,平盘 " + flat + " 家,下跌 " + down + " 家";
      },

      // 5 个表格配置(标题/副标题/表格 HTML)
      // 表格 HTML 用 buildTableHTML 拼好,模板里 v-html 渲染
      // 数据没加载时返回空数组,避免 buildTableHTML 收到 undefined 报错
      // 模板里 v-if="!loading" 已保证只在有数据时渲染,但 Petite-Vue 初次挂载时
      // 仍会求值所有 getter,所以这里做防御:没数据就返回 []
      get tableConfigs() {
        const t = this.data.tables || {};
        if (!t.priceDist) return [];
        return [
          {
            title: "价格分布统计",
            subtitle: null,
            tableHTML: buildTableHTML(t.priceDist, DIST_COL_WIDTHS, 1, "价格分布统计"),
          },
          {
            title: "行业分布统计",
            subtitle: null,
            tableHTML: buildTableHTML(t.industryDist, DIST_COL_WIDTHS, 1, "行业分布统计"),
          },
          {
            title: "涨幅TOP10",
            subtitle: t.topGainers && t.topGainers.subtitle,
            tableHTML: buildTableHTML(t.topGainers, TOP10_COL_WIDTHS, 2, "涨幅TOP10"),
          },
          {
            title: "成交额TOP10",
            subtitle: t.topAmount && t.topAmount.subtitle,
            tableHTML: buildTableHTML(t.topAmount, TOP10_COL_WIDTHS, 2, "成交额TOP10"),
          },
          {
            title: "跌幅TOP10",
            subtitle: t.topLosers && t.topLosers.subtitle,
            tableHTML: buildTableHTML(t.topLosers, TOP10_COL_WIDTHS, 2, "跌幅TOP10"),
          },
        ];
      },

      // ===== 方法 =====
      // loadData 在模板里 @click="loadData" 绑给重试按钮
      // 也由启动时主动调用一次
      loadData() {
        // 这里实际由外部的 doLoadData 控制,这里只是占位
        // 真正的 fetch 逻辑在外面,因为加载顺序:先创建空 App 挂载,再 loadData
      },
    };
  }

  // ===== fetch + 超时控制(8 秒超时,避免永久 loading) =====
  const FETCH_TIMEOUT_MS = 8000;
  let currentAbortController = null;

  function doLoadData(appState) {
    if (currentAbortController) {
      try {
        currentAbortController.abort();
      } catch (e) {
        /* 忽略已完成的 */
      }
    }
    const controller = new AbortController();
    currentAbortController = controller;
    const timer = setTimeout(function () {
      try {
        controller.abort();
      } catch (e) {
        /* 忽略 */
      }
    }, FETCH_TIMEOUT_MS);

    appState.loading = true;
    appState.errorMsg = "";

    const url = "data.json?t=" + Date.now();
    fetch(url, { signal: controller.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        currentAbortController = null;
        const err = validateData(data);
        if (err) {
          appState.loading = false;
          appState.errorMsg = err;
          return;
        }
        // 用 Object.assign 触发 Petite-Vue 响应式更新
        appState.data = data;
        appState.loading = false;
        appState.errorMsg = "";
      })
      .catch(function (err) {
        clearTimeout(timer);
        currentAbortController = null;
        appState.loading = false;
        if (err && err.name === "AbortError") {
          appState.errorMsg = "请求超时,请稍后重试";
        } else {
          appState.errorMsg = err && err.message ? err.message : String(err);
        }
      });
  }

  // ===== 启动 =====
  // Petite-Vue 加载完(devfer 顺序保证)后挂载,挂载后立即触发首次 loadData
  window.addEventListener("DOMContentLoaded", function () {
    if (!window.PetiteVue) {
      console.error("Petite-Vue 未加载,检查 CDN");
      return;
    }
    const appState = App();
    // 把 loadData 方法绑定到 appState,模板里 @click="loadData" 能调到
    appState.loadData = function () {
      doLoadData(appState);
    };
    // 挂载:Petite-Vue 接管 #app 区域的模板渲染
    window.PetiteVue.createApp(appState).mount("#app");
    // 触发首次加载
    doLoadData(appState);
  });
})();
