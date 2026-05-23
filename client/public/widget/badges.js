/* WeFixTrades free-tools Trust Badges widget — vanilla
 *
 * Embedded via the v1 loader with data-tool="badges". Renders a horizontal
 * row of inline-SVG badges (no external image loads). Badges with a
 * `proofUrl` become anchors that open in a new tab.
 */
(function () {
  "use strict";

  var CTX_KEY = "__WFT_WIDGET_CTX_badges";
  var STYLE_ID = "wft-badges-style";
  var ACCENT = "#0066cc";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ""
      + ".wft-badges-root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;max-width:720px;}"
      + ".wft-badges-row{display:flex;flex-wrap:wrap;gap:14px;align-items:stretch;}"
      + ".wft-badge{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:6px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;min-width:90px;max-width:120px;text-decoration:none;color:#0f172a;transition:border-color 0.15s,transform 0.15s;}"
      + "a.wft-badge:hover{border-color:" + ACCENT + ";transform:translateY(-1px);}"
      + ".wft-badge-svg{width:48px;height:48px;color:" + ACCENT + ";}"
      + ".wft-badge-label{font-size:11px;font-weight:600;text-align:center;line-height:1.25;color:#334155;}"
      + ".wft-badge-value{font-size:10px;color:#64748b;text-align:center;}"
      + ".wft-badges-empty{padding:12px;font-size:13px;color:#64748b;border:1px dashed #cbd5e1;border-radius:10px;background:#fff;}"
      + ".wft-badges-powered{margin-top:10px;font-size:11px;color:#94a3b8;text-align:right;}"
      + ".wft-badges-powered a{color:#64748b;text-decoration:none;border-bottom:1px dotted #cbd5e1;}"
      + ".wft-badges-powered a:hover{color:" + ACCENT + ";border-bottom-color:" + ACCENT + ";}";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // Inline SVG library. Each entry is the inner contents of an
  // <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"
  //      stroke-linecap="round" stroke-linejoin="round"> wrapper.
  // Keep these line-art only — no fills, color via currentColor.
  var SVG_WRAP_OPEN = '<svg class="wft-badge-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var SVG_WRAP_CLOSE = '</svg>';
  var BADGE_SVGS = {
    "licensed-insured": '<path d="M24 4 L40 10 V22 C40 32 32 40 24 44 C16 40 8 32 8 22 V10 Z"/><path d="M17 24 L22 29 L32 19"/>',
    "bbb-member": '<circle cx="24" cy="24" r="18"/><path d="M14 18 H22 C25 18 25 24 22 24 H14 Z M14 24 H24 C27 24 27 30 24 30 H14 Z"/>',
    "google-rating": '<polygon points="24,7 28.5,18 40,18.5 31,26 34,37.5 24,31 14,37.5 17,26 8,18.5 19.5,18"/>',
    "veteran-owned": '<circle cx="24" cy="18" r="6"/><path d="M14 42 V36 C14 30 18 26 24 26 C30 26 34 30 34 36 V42"/><path d="M18 42 L20 38 H28 L30 42"/>',
    "family-owned": '<circle cx="16" cy="18" r="4"/><circle cx="32" cy="18" r="4"/><circle cx="24" cy="14" r="3"/><path d="M10 38 V32 C10 28 12 26 16 26 C20 26 22 28 22 32 M26 32 C26 28 28 26 32 26 C36 26 38 28 38 32 V38"/>',
    "local-business": '<path d="M10 22 L24 10 L38 22 V40 H10 Z"/><path d="M19 40 V28 H29 V40"/>',
    "eco-friendly": '<path d="M10 38 C18 38 28 32 36 18 C36 10 28 8 22 10 C16 12 12 18 12 24 C12 30 14 34 14 38"/><path d="M14 38 C18 30 24 24 32 20"/>',
    "247-service": '<circle cx="24" cy="24" r="18"/><path d="M24 14 V24 L30 30"/>',
    "free-estimates": '<rect x="10" y="8" width="28" height="32" rx="3"/><path d="M16 18 H32 M16 24 H32 M16 30 H26"/>',
    "satisfaction-guaranteed": '<path d="M24 6 L29 16 L40 17.5 L32 25 L34 36 L24 30.5 L14 36 L16 25 L8 17.5 L19 16 Z"/>',
    "background-checked": '<circle cx="24" cy="18" r="6"/><path d="M14 40 V34 C14 28 18 25 24 25 C30 25 34 28 34 34 V40"/><path d="M30 36 L34 40 L42 32"/>',
    "warranty-included": '<path d="M24 6 L38 12 V22 C38 32 31 40 24 42 C17 40 10 32 10 22 V12 Z"/><path d="M18 24 H30 M24 18 V30"/>',
    "emergency-service": '<polygon points="24,6 42,38 6,38"/><path d="M24 18 V28 M24 32 V34"/>',
    "fully-bonded": '<rect x="8" y="10" width="32" height="28" rx="3"/><circle cx="24" cy="24" r="6"/><path d="M14 14 L14 16 M34 14 L34 16 M14 32 L14 34 M34 32 L34 34"/>',
    "trusted-since": '<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="11"/><path d="M24 18 V24 L28 28"/>',
  };

  function esc(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function badgeSvg(slug) {
    var inner = BADGE_SVGS[slug] || BADGE_SVGS["licensed-insured"];
    return SVG_WRAP_OPEN + inner + SVG_WRAP_CLOSE;
  }

  function render(target, data) {
    var root = document.createElement("div");
    root.className = "wft-badges-root";

    if (!data.badges || !data.badges.length) {
      root.innerHTML = '<div class="wft-badges-empty">No badges selected yet.</div>';
      target.parentNode.insertBefore(root, target.nextSibling);
      return;
    }

    var inner = '<div class="wft-badges-row">';
    for (var i = 0; i < data.badges.length; i++) {
      var b = data.badges[i];
      if (!b || !b.slug || !b.label) continue;
      var svg = badgeSvg(b.slug);
      var label = '<div class="wft-badge-label">' + esc(b.label) + '</div>';
      var val = b.valueText ? '<div class="wft-badge-value">' + esc(b.valueText) + '</div>' : '';
      var body = svg + label + val;
      if (b.proofUrl) {
        inner += '<a class="wft-badge" href="' + esc(b.proofUrl) + '" target="_blank" rel="noopener" aria-label="' + esc(b.label) + ' (view proof)">' + body + '</a>';
      } else {
        inner += '<div class="wft-badge" role="img" aria-label="' + esc(b.label) + '">' + body + '</div>';
      }
    }
    inner += '</div>';

    if (data.poweredBy) {
      inner += '<div class="wft-badges-powered">Powered by '
        + '<a href="https://wefixtrades.com?utm_source=widget&utm_medium=badges" target="_blank" rel="noopener">WeFixTrades</a>'
        + '</div>';
    }

    root.innerHTML = inner;
    target.parentNode.insertBefore(root, target.nextSibling);
  }

  function mount(ctx) {
    var url = ctx.apiBase + "/api/widget/" + encodeURIComponent(ctx.siteKey) + "/badges";
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        var target = ctx.target ? document.querySelector(ctx.target) : ctx.script;
        if (!target) return;
        ensureStyle();
        render(target, data);
      })
      .catch(function () { /* silent */ });
  }

  var queue = window[CTX_KEY] || [];
  while (queue.length) mount(queue.shift());
  window[CTX_KEY] = { push: function (ctx) { mount(ctx); } };
})();
