(function () {
  "use strict";

  // ===== 列名常量(消除魔法字符串,防止 data.json 改列名时静默失效) =====
  // 集中定义后,所有判断只引用常量,改名只需改一处
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

  // 涨跌符号:色盲用户无法仅靠红绿区分涨跌,补 ▲/▼ 让信息不依赖颜色
  // WCAG 1.4.1 要求"不能仅靠颜色传达信息"
  function gainSign(val) {
    const n = parseFloat(String(val).replace("%", ""));
    if (isNaN(n) || n === 0) return "";
    return n > 0 ? "▲ " : "▼ ";
  }

  // schema 校验:数据残缺时报错信息对用户友好,而不是把原始 JS 错误抛给用户
  // 返回 null = 校验通过;返回字符串 = 错误描述
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

  // ===== 模板：加载与错误状态 =====
  function errorTpl(msg) {
    return (
      "" +
      '<div class="text-center py-10">' +
      '<div class="text-up text-sm mb-3">数据加载失败: ' +
      esc(msg) +
      "</div>" +
      '<button id="retry-btn" type="button" ' +
      'class="inline-block px-4 py-1.5 rounded border border-brand text-brand text-sm font-bold hover:bg-brand hover:text-white transition-colors">' +
      "重试" +
      "</button>" +
      "</div>"
    );
  }

  // 绑定重试按钮:渲染 errorTpl 后必须调用一次
  function bindRetry() {
    const btn = document.getElementById("retry-btn");
    if (btn) btn.addEventListener("click", loadData);
  }

  // ===== 模板：新鲜度标签 =====
  // 用北京时间(UTC+8)计算日期差,避免海外用户本地时区导致标签错位
  function freshnessTpl(tradeDate) {
    // 把任意 Date 折算成"北京时间当天的 00:00"对应的 UTC 毫秒数
    function toBJMidnight(date) {
      const bjOffset = 8 * 3600 * 1000; // 北京比 UTC 快 8 小时
      return Math.floor((date.getTime() + bjOffset) / 86400000) * 86400000;
    }
    const nowBJ = toBJMidnight(new Date());
    const trade = toBJMidnight(new Date(tradeDate + "T00:00:00"));
    const dayDiff = Math.round((nowBJ - trade) / 86400000);

    let label, cls;
    if (dayDiff < 0) {
      // 数据日期比今天还晚(云函数时区错位或预告数据),用中性灰提示
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

  // ===== 模板：页头 =====
  function headerTpl(data) {
    return (
      "" +
      '<header class="text-center mb-6 mobile:mb-4">' +
      '<h1 class="font-script italic font-bold text-brand text-[34px] mobile:text-[21px] tiny:text-[19px]">Study Convertible Bond Everyday</h1>' +
      '<div class="w-20 h-0.5 bg-brand mx-auto mt-2 mb-1 mobile:w-[60px] mobile:mt-1.5"></div>' +
      '<div class="flex items-center justify-center gap-2 flex-wrap mt-1 text-sm text-ink-medium mobile:text-xs mobile:gap-1.5">' +
      freshnessTpl(data.tradeDate) +
      "<span>数据日期: " +
      esc(data.tradeDate) +
      "</span>" +
      '<span class="text-xs text-ink-light mobile:text-[11px]">| 页面更新: ' +
      esc(data.generateTime) +
      "</span>" +
      "</div>" +
      '<div class="text-[11px] text-ink-light mt-1 mobile:text-[10px] mobile:mt-[3px]">下次自动更新: 工作日 15:15 (北京时间) | 由 CloudBase 云函数自动生成</div>' +
      "</header>"
    );
  }

  // ===== 模板：市场概况卡片 =====
  // 上段:6 个指标分左右两栏(桌面端平分宽度,手机端纵向堆叠)
  // 下段:涨跌分布进度条,左红=上涨 / 中灰=平盘 / 右绿=下跌
  // 两端标数字(不写"上涨/下跌"文字),靠位置+颜色+端点数字传达语义
  function marketCardTpl(m) {
    function row(label, value, valueClass) {
      return (
        '<div class="flex items-baseline text-[15px] mobile:text-[13px] tiny:text-xs">' +
        '<span class="whitespace-nowrap text-ink">' +
        label +
        "</span>" +
        '<span class="font-mono text-[17px] font-bold mobile:text-[15px] tiny:text-sm ' +
        valueClass +
        '">' +
        value +
        "</span>" +
        "</div>"
      );
    }
    function col(rows) {
      return '<div class="flex flex-col gap-2 flex-1">' + rows.join("") + "</div>";
    }

    // 进度条三段宽度按 up/flat/down 占总家数比例分配
    const upNum = parseFloat(m.up) || 0;
    const downNum = parseFloat(m.down) || 0;
    const flatNum = parseFloat(m.flat) || 0;
    const total = upNum + downNum + flatNum || 1; // 防 0 除
    const upPct = (upNum / total) * 100;
    const flatPct = (flatNum / total) * 100;
    const downPct = (downNum / total) * 100;
    // 视觉上不写文字,但 a11y 必须有描述给屏幕阅读器
    const barAriaLabel = "上涨 " + upNum + " 家,平盘 " + flatNum + " 家,下跌 " + downNum + " 家";

    return (
      "" +
      '<div class="bg-white border border-surface-border rounded-lg p-4 mobile:p-3">' +
      // 上段:左右两栏指标(手机端也保持左右平分,不堆叠)
      '<div class="flex flex-row gap-4 mobile:gap-2.5">' +
      col([
        row("总成交额：", esc(m.totalAmount), "text-brand"),
        row("涨幅前十：", esc(m.top10Gain) + "(" + esc(m.top10GainPct) + ")", "text-brand"),
        row("涨幅前二十：", esc(m.top20Gain) + "(" + esc(m.top20GainPct) + ")", "text-brand"),
      ]) +
      col([
        row("价格中位数：", esc(m.priceMedian), "text-brand"),
        // 涨幅中位数:自动着红/绿色,但不加 ▲/▼ 符号(进度条已用颜色传达涨跌)
        row("涨幅中位数：", esc(m.gainMedian), gainColorClass(m.gainMedian)),
        row("成交额中位数：", esc(m.amountMedian), "text-brand"),
      ]) +
      "</div>" +
      // 下段:涨跌分布进度条
      '<div class="mt-4 mobile:mt-3 flex items-center gap-2">' +
      '<span class="font-mono font-bold text-[15px] text-up mobile:text-[13px]">' +
      esc(m.up) +
      "</span>" +
      '<div class="flex-1 flex h-2 rounded overflow-hidden bg-surface-alt" role="img" aria-label="' +
      esc(barAriaLabel) +
      '">' +
      '<div class="bg-up" style="width:' +
      upPct.toFixed(2) +
      '%"></div>' +
      '<div class="bg-surface-separator" style="width:' +
      flatPct.toFixed(2) +
      '%"></div>' +
      '<div class="bg-down" style="width:' +
      downPct.toFixed(2) +
      '%"></div>' +
      "</div>" +
      '<span class="font-mono font-bold text-[15px] text-down mobile:text-[13px]">' +
      esc(m.down) +
      "</span>" +
      "</div>" +
      "</div>"
    );
  }

  // ===== 模板：表格 =====
  // caption:表格的可访问标题,渲染成 sr-only <caption>,屏幕阅读器会念出来
  function tableTpl(tableData, colWidths, stickyCount, caption) {
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

    // 冻结列固定宽度（仅"排名"列固定 36px）
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

    // 表头(scope="col" 让屏幕阅读器明确这是列头,可朗读列名给每个单元格)
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

            // 颜色：涨幅列红涨绿跌；"涨幅中位数"列除外（保持中性）
            let colorClass = "text-ink";
            const isChangeCol = c === changePctCol || colName === COL.CHANGE;
            if (isChangeCol) {
              colorClass = gainColorClass(val);
            }
            if (colName === COL.CHANGE_MEDIAN) {
              colorClass = "text-ink font-normal";
            }

            // 涨跌符号:仅给"涨幅"列加(让色盲用户也能区分涨跌)
            // "涨幅中位数"列不加,因为它是中性参考列
            let displayVal = val;
            if (isChangeCol && val !== "-" && val !== "") {
              displayVal = gainSign(val) + val;
            }

            const isMono = isNumeric || /^[\d.%-]+$/.test(val.trim());
            const monoClass = isMono ? "font-mono" : "";

            // sticky 列：需要带背景色以遮盖滚动内容
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

    // sr-only caption:屏幕阅读器念出表格标题,视觉隐藏不影响布局
    const captionHtml = caption ? '<caption class="sr-only">' + esc(caption) + "</caption>" : "";

    return (
      "" +
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

  // ===== 模板：模块容器 =====
  function moduleTpl(title, subtitle, content) {
    return (
      "" +
      '<section class="mb-6 mobile:mb-4">' +
      '<div class="flex items-center justify-between h-9 mb-1.5 mobile:min-h-[30px] mobile:mb-1 mobile:flex-wrap mobile:gap-1">' +
      '<h2 class="flex items-center gap-2.5 text-xl font-bold text-ink mobile:text-base mobile:gap-1.5">' +
      '<span class="inline-block w-1 h-7 rounded-sm bg-brand mobile:h-[22px]"></span>' +
      esc(title) +
      "</h2>" +
      (subtitle ? '<span class="text-sm text-ink-medium mobile:text-[11px]">' + esc(subtitle) + "</span>" : "") +
      "</div>" +
      content +
      "</section>"
    );
  }

  // ===== 主渲染 =====
  function renderPage(data) {
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

    const tablesHtml = tableConfigs
      .map(function (cfg) {
        return moduleTpl(cfg.title, cfg.subtitle, tableTpl(cfg.data, cfg.widths, cfg.sticky, cfg.title));
      })
      .join("");

    return (
      "" +
      headerTpl(data) +
      moduleTpl("市场概况", null, marketCardTpl(data.market)) +
      tablesHtml +
      '<footer class="text-center mt-5 text-[11px] text-brand mobile:text-[10px] mobile:mt-3.5">免责声明：本图表来自公开数据源 仅整理供学习研究 不作为投资建议</footer>' +
      '<div class="text-center mt-2 text-xs text-ink-light mobile:text-[10px]">共 ' +
      esc(data.bondCount) +
      " 只可转债 | 数据自动更新中</div>"
    );
  }

  // ===== 入口：加载数据 =====
  // 8 秒超时,避免服务器挂起导致永久 loading
  const FETCH_TIMEOUT_MS = 8000;
  // 模块级 controller 引用,允许下一次 loadData 时取消上一次未完成的请求
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

    const appEl = document.getElementById("app");
    const url = "data.json?t=" + Date.now();
    fetch(url, { signal: controller.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        currentAbortController = null;
        // schema 校验:数据残缺时给用户友好提示,不抛原始 JS 错误
        const validationError = validateData(data);
        if (validationError) {
          appEl.setAttribute("aria-busy", "false");
          appEl.innerHTML = errorTpl("数据格式异常: " + validationError);
          bindRetry();
          return;
        }
        appEl.setAttribute("aria-busy", "false");
        document.title = "可转债日报 - " + data.tradeDate;
        appEl.innerHTML = renderPage(data);
      })
      .catch(function (err) {
        clearTimeout(timer);
        currentAbortController = null;
        appEl.setAttribute("aria-busy", "false");
        // AbortError 是我们自己触发的超时,给用户更友好的提示
        const msg =
          err && err.name === "AbortError"
            ? "请求超时,请检查网络后重试"
            : err && err.message
              ? err.message
              : "未知错误";
        appEl.innerHTML = errorTpl(msg);
        bindRetry();
      });
  }

  loadData();
})();
