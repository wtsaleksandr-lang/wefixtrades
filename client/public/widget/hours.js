/* WeFixTrades free-tools Business Hours widget — vanilla
 *
 * Embedded via the v1 loader with data-tool="hours". Supports an optional
 * data-variant attribute on the script tag: "badge" | "table" | "both"
 * (default "both"). Auto-refreshes status every 60s so the "Open now"
 * badge flips on the minute.
 */
(function () {
  "use strict";

  var CTX_KEY = "__WFT_WIDGET_CTX_hours";
  var STYLE_ID = "wft-hours-style";
  var ACCENT = "#0066cc";
  var OPEN_COLOR = "#16a34a";
  var CLOSED_COLOR = "#dc2626";
  var REFRESH_MS = 60 * 1000;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ""
      + ".wft-hours-root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;max-width:380px;}"
      + ".wft-hours-badge{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;}"
      + ".wft-hours-dot{width:8px;height:8px;border-radius:999px;display:inline-block;}"
      + ".wft-hours-status-text{color:#0f172a;}"
      + ".wft-hours-status-sub{font-weight:500;color:#64748b;font-size:12px;margin-left:4px;}"
      + ".wft-hours-table{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-top:10px;font-size:13px;line-height:1.55;}"
      + ".wft-hours-row{display:flex;justify-content:space-between;padding:3px 0;}"
      + ".wft-hours-row.today{font-weight:600;color:" + ACCENT + ";}"
      + ".wft-hours-day{color:#475569;}"
      + ".wft-hours-time{color:#0f172a;font-variant-numeric:tabular-nums;}"
      + ".wft-hours-time.closed{color:#94a3b8;}"
      + ".wft-hours-empty{padding:10px 14px;font-size:13px;color:#64748b;border:1px dashed #cbd5e1;border-radius:10px;background:#fff;}"
      + ".wft-hours-powered{margin-top:8px;font-size:11px;color:#94a3b8;text-align:right;}"
      + ".wft-hours-powered a{color:#64748b;text-decoration:none;border-bottom:1px dotted #cbd5e1;}"
      + ".wft-hours-powered a:hover{color:" + ACCENT + ";border-bottom-color:" + ACCENT + ";}";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var DAY_LABELS = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

  function esc(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function todayKey(tz) {
    try {
      var w = new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "short" }).format(new Date());
      return w.toLowerCase().slice(0, 3);
    } catch (e) {
      var n = new Date().getDay();
      return DAY_KEYS[n];
    }
  }

  function fmtTime(t) {
    if (!t) return "";
    // "09:00" → "9:00 AM" — keep it simple, locale-agnostic for embed predictability.
    var parts = String(t).split(":");
    var h = parseInt(parts[0], 10);
    var m = parts[1] || "00";
    var suffix = h >= 12 ? "PM" : "AM";
    var hh = h % 12 || 12;
    return hh + ":" + m + " " + suffix;
  }

  function renderBadge(data) {
    var isOpen = data.status === "open";
    var color = isOpen ? OPEN_COLOR : CLOSED_COLOR;
    var sub = "";
    if (isOpen && data.closesAt) sub = " until " + fmtTime(data.closesAt);
    else if (!isOpen && data.opensAt) sub = " — opens " + fmtTime(data.opensAt);
    return '<span class="wft-hours-badge" role="status">'
      + '<span class="wft-hours-dot" style="background:' + color + ';"></span>'
      + '<span class="wft-hours-status-text">' + (isOpen ? "Open now" : "Closed") + '</span>'
      + (sub ? '<span class="wft-hours-status-sub">' + esc(sub) + '</span>' : '')
      + '</span>';
  }

  function renderTable(data) {
    var hours = data.hours || {};
    var today = todayKey(hours.tz);
    var html = '<div class="wft-hours-table">';
    for (var i = 0; i < DAY_KEYS.length; i++) {
      var k = DAY_KEYS[i];
      var spec = hours[k];
      var label = DAY_LABELS[k];
      var rowCls = "wft-hours-row" + (k === today ? " today" : "");
      var time, timeCls = "wft-hours-time";
      if (spec && spec.open && spec.opens && spec.closes) {
        time = fmtTime(spec.opens) + " – " + fmtTime(spec.closes);
      } else {
        time = "Closed";
        timeCls += " closed";
      }
      html += '<div class="' + rowCls + '">'
        + '<span class="wft-hours-day">' + label + '</span>'
        + '<span class="' + timeCls + '">' + esc(time) + '</span>'
        + '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderRoot(target, data, variant) {
    // Tear down a previous root if we're re-rendering for the refresh tick.
    var prev = target.__wftHoursRoot;
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    var root = document.createElement("div");
    root.className = "wft-hours-root";

    if (!data.hours || !Object.keys(data.hours).length) {
      root.innerHTML = '<div class="wft-hours-empty">Hours not set up yet.</div>';
    } else {
      var html = "";
      if (variant === "badge" || variant === "both") html += renderBadge(data);
      if (variant === "table" || variant === "both") html += renderTable(data);
      if (data.poweredBy) {
        html += '<div class="wft-hours-powered">Powered by '
          + '<a href="https://wefixtrades.com?utm_source=widget&utm_medium=hours" target="_blank" rel="noopener">WeFixTrades</a>'
          + '</div>';
      }
      root.innerHTML = html;
    }

    target.parentNode.insertBefore(root, target.nextSibling);
    target.__wftHoursRoot = root;
  }

  function mount(ctx) {
    var variant = (ctx.script && ctx.script.getAttribute("data-variant")) || "both";
    if (!/^(badge|table|both)$/.test(variant)) variant = "both";

    function fetchAndRender() {
      var url = ctx.apiBase + "/api/widget/" + encodeURIComponent(ctx.siteKey) + "/hours";
      fetch(url, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          var target = ctx.target ? document.querySelector(ctx.target) : ctx.script;
          if (!target) return;
          ensureStyle();
          renderRoot(target, data, variant);
        })
        .catch(function () { /* silent */ });
    }

    fetchAndRender();
    setInterval(fetchAndRender, REFRESH_MS);
  }

  var queue = window[CTX_KEY] || [];
  while (queue.length) mount(queue.shift());
  window[CTX_KEY] = { push: function (ctx) { mount(ctx); } };
})();
