(function() {
  'use strict';

  // ===== 工具函数 =====
  // 转义 HTML 特殊字符防 XSS
  // & 必须最先替换(其他实体里含 &);单引号也补上,防止未来有人写 class='...'
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 涨跌色：A股惯例红涨绿跌
  function gainColorClass(val) {
    var n = parseFloat(String(val).replace('%', ''));
    if (isNaN(n)) return 'text-ink';
    if (n > 0) return 'text-up font-bold';
    if (n < 0) return 'text-down font-bold';
    return 'text-ink font-bold';
  }

  // ===== 模板：加载与错误状态 =====
  function errorTpl(msg) {
    return '' +
      '<div class="text-center py-10">' +
        '<div class="text-up text-sm mb-3">数据加载失败: ' + esc(msg) + '</div>' +
        '<button id="retry-btn" type="button" ' +
          'class="inline-block px-4 py-1.5 rounded border border-brand text-brand text-sm font-bold hover:bg-brand hover:text-white transition-colors">' +
          '重试' +
        '</button>' +
      '</div>';
  }

  // 绑定重试按钮:渲染 errorTpl 后必须调用一次
  function bindRetry() {
    var btn = document.getElementById('retry-btn');
    if (btn) btn.addEventListener('click', loadData);
  }

  // ===== 模板：新鲜度标签 =====
  // 用北京时间(UTC+8)计算日期差,避免海外用户本地时区导致标签错位
  function freshnessTpl(tradeDate) {
    // 把任意 Date 折算成"北京时间当天的 00:00"对应的 UTC 毫秒数
    // 例如:北京 7-25 00:00 = UTC 7-24 16:00,这一步让两个日期都按北京日历对齐
    function toBJMidnight(date) {
      // getUTCHours()+8 等于北京小时数;Math.floor(utcMs/86400000) 拿到当天的 UTC 零点
      // 这里换算方式:把时间转到北京时区,然后取北京日期的 00:00(等价于 UTC 16:00 前一天)
      var bjOffset = 8 * 3600 * 1000; // 北京比 UTC 快 8 小时
      return Math.floor((date.getTime() + bjOffset) / 86400000) * 86400000;
    }
    var nowBJ = toBJMidnight(new Date());
    var trade = toBJMidnight(new Date(tradeDate + 'T00:00:00'));
    var dayDiff = Math.round((nowBJ - trade) / 86400000);

    var label, cls;
    if (dayDiff < 0) {
      // 数据日期比今天还晚(云函数时区错位或预告数据),用中性灰提示
      label = '未来数据'; cls = 'bg-[#e2e3e5] text-[#383d41]';
    } else if (dayDiff === 0) {
      label = '今日数据'; cls = 'bg-[#d4edda] text-[#155724]';
    } else if (dayDiff === 1) {
      label = '昨日数据'; cls = 'bg-[#fff3cd] text-[#856404]';
    } else if (dayDiff >= 2 && dayDiff <= 3) {
      label = dayDiff + '日前数据'; cls = 'bg-[#ffe8a3] text-[#856404]';
    } else {
      label = dayDiff + '日前数据'; cls = 'bg-[#f8d7da] text-[#721c24]';
    }
    return '<span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ' + cls + '">' + label + '</span>';
  }

  // ===== 模板：页头 =====
  function headerTpl(data) {
    return '' +
      '<header class="text-center mb-6 mobile:mb-4">' +
        '<h1 class="font-script italic font-bold text-brand text-[34px] mobile:text-[21px] tiny:text-[19px]">Study Convertible Bond Everyday</h1>' +
        '<div class="w-20 h-0.5 bg-brand mx-auto mt-2 mb-1 mobile:w-[60px] mobile:mt-1.5"></div>' +
        '<div class="flex items-center justify-center gap-2 flex-wrap mt-1 text-sm text-ink-medium mobile:text-xs mobile:gap-1.5">' +
          freshnessTpl(data.tradeDate) +
          '<span>数据日期: ' + esc(data.tradeDate) + '</span>' +
          '<span class="text-xs text-ink-light mobile:text-[11px]">| 页面更新: ' + esc(data.generateTime) + '</span>' +
        '</div>' +
        '<div class="text-[11px] text-ink-light mt-1 mobile:text-[10px] mobile:mt-[3px]">下次自动更新: 工作日 15:15 (北京时间) | 由 CloudBase 云函数自动生成</div>' +
      '</header>';
  }

  // ===== 模板：市场概况卡片 =====
  function marketCardTpl(m) {
    function row(label, value, valueClass) {
      return '<div class="flex items-baseline text-[15px] mobile:text-[13px] tiny:text-xs">' +
        '<span class="whitespace-nowrap text-ink">' + label + '</span>' +
        '<span class="font-mono text-[17px] font-bold mobile:text-[15px] tiny:text-sm ' + valueClass + '">' + value + '</span>' +
      '</div>';
    }
    function col(rows) {
      return '<div class="flex flex-col gap-2">' + rows.join('') + '</div>';
    }
    return '' +
      '<div class="bg-white border border-surface-border rounded-lg p-4 flex flex-col sm:flex-row sm:justify-between gap-4 mobile:p-3 mobile:gap-2.5">' +
        col([
          row('上涨：', esc(m.up), 'text-up'),
          row('下跌：', esc(m.down), 'text-down'),
          row('平盘：', esc(m.flat), 'text-ink')
        ]) +
        col([
          row('总成交额：', esc(m.totalAmount), 'text-brand'),
          row('涨幅前十：', esc(m.top10Gain) + '(' + esc(m.top10GainPct) + ')', 'text-brand'),
          row('涨幅前二十：', esc(m.top20Gain) + '(' + esc(m.top20GainPct) + ')', 'text-brand')
        ]) +
        col([
          row('价格中位数：', esc(m.priceMedian), 'text-brand'),
          row('涨幅中位数：', esc(m.gainMedian), gainColorClass(m.gainMedian)),
          row('成交额中位数：', esc(m.amountMedian), 'text-brand')
        ]) +
      '</div>';
  }

  // ===== 模板：表格 =====
  function tableTpl(tableData, colWidths, stickyCount) {
    stickyCount = stickyCount || 1;
    var colLabels = tableData.colLabels;
    var rows = tableData.rows;
    var barColIndices = tableData.barColIndices || [];
    var changePctCol = tableData.changePctCol;

    // 计算 bar 最大值
    var maxBarValues = {};
    barColIndices.forEach(function(idx) {
      var label = colLabels[idx] || '';
      var isBidi = label.indexOf('涨幅中位数') >= 0;
      var maxVal = 0;
      rows.forEach(function(r) {
        var v = r[idx];
        if (v === '-' || v === '') return;
        var n = parseFloat(String(v).replace('%', ''));
        if (!isNaN(n)) maxVal = Math.max(maxVal, isBidi ? Math.abs(n) : n);
      });
      maxBarValues[idx] = maxVal || 1;
    });

    // 冻结列固定宽度（仅"排名"列固定 36px）
    var frozenWidths = [];
    for (var i = 0; i < stickyCount; i++) {
      frozenWidths.push((colLabels[i] || '') === '排名' ? 36 : 0);
    }
    var leftOffsets = [];
    var acc = 0;
    for (var i2 = 0; i2 < stickyCount; i2++) {
      leftOffsets.push(acc);
      acc += frozenWidths[i2];
    }

    // 表头
    var headCells = colLabels.map(function(label, i) {
      var isSticky = i < stickyCount;
      var baseClass = 'bg-brand text-white text-[13px] font-bold px-1 py-[7px] text-center whitespace-nowrap mobile:py-[5px] mobile:text-[11px]';
      if (isSticky) {
        var w = frozenWidths[i];
        var styleParts = ['left:' + leftOffsets[i] + 'px', 'z-index:3'];
        if (w > 0) { styleParts.push('width:' + w + 'px', 'min-width:' + w + 'px'); }
        return '<th class="' + baseClass + ' sticky" style="' + styleParts.join(';') + '">' + esc(label) + '</th>';
      }
      var w2 = colWidths ? colWidths[i] * 100 : (100 / colLabels.length);
      return '<th class="' + baseClass + '" style="width:' + w2.toFixed(1) + '%">' + esc(label) + '</th>';
    }).join('');

    var CENTER_COLS = ['排名', '涨幅', '价格', '成交额(亿)', '可转债',
      '行业一级', '行业二级', '剩余规模', '到期日期',
      '涨幅中位数', '成交额中位数(亿)', '价格区间', '数量', '上涨', '下跌'];

    // 表体
    var bodyRows = rows.map(function(row, r) {
      var isAlt = r % 2 === 1;
      var rowBg = isAlt ? 'bg-surface-alt' : 'bg-white';

      var cells = colLabels.map(function(colName, c) {
        var val = String(row[c] != null ? row[c] : '');
        var isNumeric = /^[-]?[\d,]+\.?\d*%?$/.test(val.trim());
        var isCenter = !isNumeric || CENTER_COLS.indexOf(colName) >= 0;
        var alignClass = isCenter ? 'text-center' : 'text-left pl-2';

        // 颜色：涨幅列红涨绿跌；"涨幅中位数"列除外（保持中性）
        var colorClass = 'text-ink';
        if (c === changePctCol || colName === '涨幅') {
          colorClass = gainColorClass(val);
        }
        if (colName === '涨幅中位数') {
          colorClass = 'text-ink font-normal';
        }

        var isMono = isNumeric || /^[\d.%\-]+$/.test(val.trim());
        var monoClass = isMono ? 'font-mono' : '';

        // sticky 列：需要带背景色以遮盖滚动内容
        var stickyClass = '';
        var stickyStyle = '';
        if (c < stickyCount) {
          var w = frozenWidths[c];
          var styleParts = ['left:' + leftOffsets[c] + 'px', 'z-index:2'];
          if (w > 0) { styleParts.push('width:' + w + 'px', 'min-width:' + w + 'px'); }
          stickyStyle = ' style="' + styleParts.join(';') + '"';
          stickyClass = ' sticky ' + rowBg;
        } else {
          // 非 sticky 单元格由 tr 的 bg 接管背景
        }

        // bar 渲染
        var barHtml = '';
        if (barColIndices.indexOf(c) >= 0 && val !== '-' && val !== '') {
          var rawNum = parseFloat(String(val).replace('%', ''));
          if (!isNaN(rawNum)) {
            var isBidi = colName.indexOf('涨幅中位数') >= 0;
            if (isBidi) {
              var ratio = Math.min(Math.abs(rawNum) / (maxBarValues[c] || 1), 1);
              var barW = 45 * ratio;
              if (rawNum >= 0) {
                barHtml = '<div class="bar-track-bidi"><div class="bar-right" style="width:' + barW + '%;background:#FF4757"></div></div>';
              } else {
                barHtml = '<div class="bar-track-bidi"><div class="bar-left" style="width:' + barW + '%;background:#2ED573"></div></div>';
              }
            } else if (rawNum > 0) {
              var ratio2 = Math.min(rawNum / (maxBarValues[c] || 1), 1);
              var barW2 = 90 * ratio2;
              barHtml = '<div class="bar-track"><div class="bar-fill" style="width:' + barW2 + '%;background:#FDCB6E"></div></div>';
            }
          }
        }
        var tdPos = barHtml ? ' relative' : '';
        var tdClass = alignClass + ' ' + monoClass + ' ' + colorClass + (stickyClass ? ' ' + stickyClass : '') +
          ' whitespace-nowrap px-1 py-[5px] border-b border-surface-separator text-[13px] mobile:py-1 mobile:text-[11px]' + tdPos;
        return '<td class="' + tdClass + '"' + stickyStyle + '>' + esc(val) + barHtml + '</td>';
      }).join('');

      return '<tr class="' + rowBg + '">' + cells + '</tr>';
    }).join('');

    return '' +
      '<div class="table-wrapper">' +
        '<table class="w-full text-[13px] mobile:text-[11px] mobile:min-w-[480px] border-collapse">' +
          '<thead><tr>' + headCells + '</tr></thead>' +
          '<tbody>' + bodyRows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  // ===== 模板：模块容器 =====
  function moduleTpl(title, subtitle, content) {
    return '' +
      '<section class="mb-6 mobile:mb-4">' +
        '<div class="flex items-center justify-between h-9 mb-1.5 mobile:min-h-[30px] mobile:mb-1 mobile:flex-wrap mobile:gap-1">' +
          '<h2 class="flex items-center gap-2.5 text-xl font-bold text-ink mobile:text-base mobile:gap-1.5">' +
            '<span class="inline-block w-1 h-7 rounded-sm bg-brand mobile:h-[22px]"></span>' +
            esc(title) +
          '</h2>' +
          (subtitle ? '<span class="text-sm text-ink-medium mobile:text-[11px]">' + esc(subtitle) + '</span>' : '') +
        '</div>' +
        content +
      '</section>';
  }

  // ===== 主渲染 =====
  function renderPage(data) {
    var distColWidths = [0.18, 0.10, 0.08, 0.08, 0.16, 0.20, 0.20];
    var top10ColWidths = [0.05, 0.12, 0.08, 0.10, 0.14, 0.13, 0.13, 0.13, 0.12];

    var tableConfigs = [
      { title: '价格分布统计', data: data.tables.priceDist, widths: distColWidths, sticky: 1, subtitle: null },
      { title: '行业分布统计', data: data.tables.industryDist, widths: distColWidths, sticky: 1, subtitle: null },
      { title: '涨幅TOP10', data: data.tables.topGainers, widths: top10ColWidths, sticky: 2, subtitle: data.tables.topGainers.subtitle },
      { title: '成交额TOP10', data: data.tables.topAmount, widths: top10ColWidths, sticky: 2, subtitle: data.tables.topAmount.subtitle },
      { title: '跌幅TOP10', data: data.tables.topLosers, widths: top10ColWidths, sticky: 2, subtitle: data.tables.topLosers.subtitle }
    ];

    var tablesHtml = tableConfigs.map(function(cfg) {
      return moduleTpl(cfg.title, cfg.subtitle, tableTpl(cfg.data, cfg.widths, cfg.sticky));
    }).join('');

    return '' +
      headerTpl(data) +
      moduleTpl('市场概况', null, marketCardTpl(data.market)) +
      tablesHtml +
      '<footer class="text-center mt-5 text-[11px] text-brand mobile:text-[10px] mobile:mt-3.5">免责声明：本图表来自公开数据源 仅整理供学习研究 不作为投资建议</footer>' +
      '<div class="text-center mt-2 text-xs text-ink-light mobile:text-[10px]">共 ' + esc(data.bondCount) + ' 只可转债 | 数据自动更新中</div>';
  }

  // ===== 入口：加载数据 =====
  // 8 秒超时,避免服务器挂起导致永久 loading
  var FETCH_TIMEOUT_MS = 8000;
  // 用模块级 controller 引用,允许下一次 loadData 时取消上一次未完成的请求
  var currentAbortController = null;

  function loadData() {
    // 取消上一次未完成的请求(比如用户连续点重试)
    if (currentAbortController) {
      try { currentAbortController.abort(); } catch (e) { /* 忽略已完成的 */ }
    }
    var controller = new AbortController();
    currentAbortController = controller;
    var timer = setTimeout(function() {
      try { controller.abort(); } catch (e) { /* 忽略 */ }
    }, FETCH_TIMEOUT_MS);

    var url = 'data.json?t=' + Date.now();
    fetch(url, { signal: controller.signal })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        clearTimeout(timer);
        currentAbortController = null;
        document.title = '可转债日报 - ' + data.tradeDate;
        document.getElementById('app').innerHTML = renderPage(data);
      })
      .catch(function(err) {
        clearTimeout(timer);
        currentAbortController = null;
        // AbortError 是我们自己触发的超时,给用户更友好的提示
        var msg = (err && err.name === 'AbortError')
          ? '请求超时,请检查网络后重试'
          : (err && err.message) ? err.message : '未知错误';
        document.getElementById('app').innerHTML = errorTpl(msg);
        bindRetry();
      });
  }

  loadData();
})();
