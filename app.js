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

  // ===== 工具函数 =====
  // 转义 HTML 特殊字符防 XSS
  // & 必须最先替换(其他实体里含 &);单引号也补上,防止未来有人写 class='...'
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 涨跌色：A股惯例红涨绿跌
  function gainColorClass(val) {
    const n = parseFloat(String(val).replace("%", ""));
    if (isNaN(n)) return "text-ink";
    if (n > 0) return "text-up font-bold";
    if (n < 0) return "text-down font-bold";
    return "text-ink font-bold";
  }

  // schema 校验:数据残缺时报错信息对用户友好,而不是把原始 JS 错误抛给用户
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

  // 按 "a.b.c" 路径从对象取值
  // 用于 data-field="market.up" 这类声明式绑定
  function getByPath(obj, path) {
    return path.split(".").reduce(function (acc, key) {
      return acc == null ? undefined : acc[key];
    }, obj);
  }

  // ===== 静态部分填值:遍历所有 [data-field] 元素,按路径取值填进去 =====
  // 这是"声明式绑定"的核心:HTML 写 data-field="market.up",JS 自动找到 data.market.up 填值
  // 用 textContent 而非 innerHTML,浏览器自动转义,防 XSS
  function fillStaticFields(data) {
    const els = document.querySelectorAll("#real-content [data-field]");
    els.forEach(function (el) {
      const path = el.getAttribute("data-field");
      const val = getByPath(data, path);
      el.textContent = val == null ? "" : String(val);

      // 涨幅中位数这类需要按正负切换颜色类
      if (el.getAttribute("data-color-by-sign") === "true") {
        // 清掉可能存在的旧颜色类,再按当前值加新的
        el.classList.remove("text-up", "text-down", "text-ink", "font-bold");
        const cls = gainColorClass(val);
        cls.split(/\s+/).forEach(function (c) {
          if (c) el.classList.add(c);
        });
      }
    });
  }

  // ===== freshness 彩色标签:颜色 + 文案都按 dayDiff 动态变化,必须 JS 生成 =====
  function renderFreshness(tradeDate) {
    // 用北京时间(UTC+8)计算日期差,避免海外用户本地时区导致标签错位
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
    // 用 innerHTML 是因为要插入带 class 的 span;label 内容是固定枚举,不存在注入风险
    const el = document.getElementById("freshness");
    if (el) {
      el.innerHTML =
        '<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ' + cls + '">' + label + "</span>";
    }
  }

  // ===== 市场卡片进度条:三段宽度按 up/flat/down 占比算 =====
  function renderMarketBar(m) {
    const upNum = parseFloat(m.up) || 0;
    const downNum = parseFloat(m.down) || 0;
    const flatNum = parseFloat(m.flat) || 0;
    const total = upNum + downNum + flatNum || 1; // 防 0 除
    const upPct = (upNum / total) * 100;
    const flatPct = (flatNum / total) * 100;
    const downPct = (downNum / total) * 100;

    const bar = document.getElementById("market-bar");
    if (!bar) return;

    // aria-label 给屏幕阅读器念出来(视觉上不写文字)
    bar.setAttribute("aria-label", "上涨 " + upNum + " 家,平盘 " + flatNum + " 家,下跌 " + downNum + " 家");

    bar.querySelector('[data-bar="up"]').style.width = upPct.toFixed(2) + "%";
    bar.querySelector('[data-bar="flat"]').style.width = flatPct.toFixed(2) + "%";
    bar.querySelector('[data-bar="down"]').style.width = downPct.toFixed(2) + "%";
  }

  // ===== 表格模块标题条(对应原 moduleTpl 的标题部分) =====
  // 表格内容用 tableTpl 生成字符串后 innerHTML 填进去(因为 table 行列数每天变,必须动态生成)
  function moduleSectionHTML(title, subtitle, tableHTML) {
    return (
      '<section class="mb-6 mobile:mb-4">' +
      '<div class="flex items-center justify-between h-9 mb-1.5 mobile:min-h-[30px] mobile:mb-1 mobile:flex-wrap mobile:gap-1">' +
      '<h2 class="flex items-center gap-2.5 text-xl font-bold text-ink mobile:text-base mobile:gap-1.5">' +
      '<span class="inline-block w-1 h-7 rounded-sm bg-brand mobile:h-[22px]"></span>' +
      esc(title) +
      "</h2>" +
      (subtitle ? '<span class="text-sm text-ink-medium mobile:text-[11px]">' + esc(subtitle) + "</span>" : "") +
      "</div>" +
      tableHTML +
      "</section>"
    );
  }

  // ===== 表格 HTML 生成(行列数每天变,必须动态生成) =====
  function tableHTML(tableData, colWidths, stickyCount, caption) {
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

    // sr-only caption:屏幕阅读器念出表格标题
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

  // ===== 5 个表格模块:标题/副标题写死在配置里,表格 HTML 动态生成 =====
  function renderTables(data) {
    const distColWidths = [0.18, 0.1, 0.08, 0.08, 0.16, 0.2, 0.2];
    const top10ColWidths = [0.05, 0.12, 0.08, 0.1, 0.14, 0.13, 0.13, 0.13, 0.12];

    const tableConfigs = [
      { title: "价格分布统计", data: data.tables.priceDist, widths: distColWidths, sticky: 1, subtitle: null },
      { title: "行业分布统计", data: data.tables.industryDist, widths: distColWidths, sticky: 1, subtitle: null },
      {
        title: "涨幅TOP10",
        data: data.tables.topGainers,
        widths: top10ColWidths,
        sticky: 2,
        subtitle: data.tables.topGainers.subtitle,
      },
      {
        title: "成交额TOP10",
        data: data.tables.topAmount,
        widths: top10ColWidths,
        sticky: 2,
        subtitle: data.tables.topAmount.subtitle,
      },
      {
        title: "跌幅TOP10",
        data: data.tables.topLosers,
        widths: top10ColWidths,
        sticky: 2,
        subtitle: data.tables.topLosers.subtitle,
      },
    ];

    const html = tableConfigs
      .map(function (cfg) {
        return moduleSectionHTML(cfg.title, cfg.subtitle, tableHTML(cfg.data, cfg.widths, cfg.sticky, cfg.title));
      })
      .join("");

    const root = document.getElementById("tables-root");
    if (root) root.innerHTML = html;
  }

  // ===== 错误态:从 <template> 克隆,填错误信息,绑定重试 =====
  function showError(msg) {
    const tpl = document.getElementById("tpl-error");
    if (!tpl) return;
    const frag = tpl.content.cloneNode(true);
    const msgEl = frag.querySelector("[data-error-msg]");
    if (msgEl) msgEl.textContent = String(msg || "未知错误"); // textContent 自动转义

    // 把 #app(骨架屏)替换成错误态
    const appEl = document.getElementById("app");
    if (appEl) {
      appEl.innerHTML = "";
      appEl.appendChild(frag);
      appEl.setAttribute("aria-busy", "false");
    }

    // 绑定重试按钮
    const btn = document.getElementById("retry-btn");
    if (btn) btn.addEventListener("click", loadData);
  }

  // ===== 主渲染:静态部分填值 + 动态部分生成 =====
  function renderPage(data) {
    // 静态部分:页头日期、市场卡片 6 个指标 + 进度条数字、底部 bondCount
    fillStaticFields(data);
    renderFreshness(data.tradeDate);
    renderMarketBar(data.market);

    // 动态部分:5 个表格(行列数每天变,必须 JS 生成)
    renderTables(data);

    // 切换显示:隐藏骨架屏,显示真实内容
    const appEl = document.getElementById("app");
    const realEl = document.getElementById("real-content");
    if (appEl) {
      appEl.innerHTML = ""; // 清空骨架屏
      appEl.setAttribute("aria-busy", "false");
    }
    if (realEl) realEl.hidden = false;
  }

  // ===== 入口:加载数据 =====
  const FETCH_TIMEOUT_MS = 8000;
  let currentAbortController = null;

  function loadData() {
    // 取消上一次未完成的请求(比如用户连续点重试)
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
          showError(err);
          return;
        }
        renderPage(data);
      })
      .catch(function (err) {
        clearTimeout(timer);
        currentAbortController = null;
        // AbortController 触发的 abort 会进来,给个友好提示
        if (err && err.name === "AbortError") {
          showError("请求超时,请稍后重试");
        } else {
          showError(err && err.message ? err.message : String(err));
        }
      });
  }

  // ===== 启动 =====
  // defer 脚本执行时 DOM 已解析完成,DOMContentLoaded 可能已触发
  // 用 readyState 判断,避免错过事件导致 loadData 永远不执行
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadData);
  } else {
    // DOM 已就绪(readyState 是 interactive 或 complete),直接加载
    loadData();
  }
})();
