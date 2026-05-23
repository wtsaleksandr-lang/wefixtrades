/* WeFixTrades free-tools FAQ widget — vanilla
 *
 * Embedded via the v1 loader:
 *   <script src="https://wefixtrades.com/widget/v1.js"
 *           data-site-key="<32-hex-widget-token>"
 *           data-tool="faq" async></script>
 *
 * v1.js dispatches here when data-tool="faq". For each invocation we read
 * the queued context from window.__WFT_WIDGET_CTX_faq[], fetch
 * /api/widget/:token/faq, render a native <details>/<summary> accordion,
 * and inject a FAQPage JSON-LD block for Google rich results.
 */
(function () {
  "use strict";

  var CTX_KEY = "__WFT_WIDGET_CTX_faq";
  var STYLE_ID = "wft-faq-style";
  var ACCENT = "#0066cc"; // brand-blue
  var ACCENT_SOFT = "rgba(0, 102, 204, 0.08)";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ""
      + ".wft-faq-root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;max-width:720px;margin:0;}"
      + ".wft-faq-root .wft-faq-item{border:1px solid #e2e8f0;border-radius:10px;background:#fff;margin-bottom:8px;overflow:hidden;}"
      + ".wft-faq-root .wft-faq-item[open]{box-shadow:0 1px 3px rgba(0,0,0,0.04);}"
      + ".wft-faq-root .wft-faq-q{cursor:pointer;padding:12px 16px;font-weight:600;font-size:15px;line-height:1.45;color:#0f172a;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;}"
      + ".wft-faq-root .wft-faq-q::-webkit-details-marker{display:none;}"
      + ".wft-faq-root .wft-faq-q:hover{background:" + ACCENT_SOFT + ";}"
      + ".wft-faq-root .wft-faq-q:focus-visible{outline:2px solid " + ACCENT + ";outline-offset:-2px;}"
      + ".wft-faq-root .wft-faq-caret{flex:0 0 auto;width:16px;height:16px;color:" + ACCENT + ";transition:transform 0.15s;}"
      + ".wft-faq-root .wft-faq-item[open] .wft-faq-caret{transform:rotate(180deg);}"
      + ".wft-faq-root .wft-faq-a{padding:0 16px 14px;font-size:14px;line-height:1.55;color:#334155;white-space:pre-wrap;}"
      + ".wft-faq-root .wft-faq-empty{padding:16px;font-size:13px;color:#64748b;border:1px dashed #cbd5e1;border-radius:10px;background:#fff;}"
      + ".wft-faq-root .wft-faq-powered{margin-top:10px;font-size:11px;color:#94a3b8;text-align:right;}"
      + ".wft-faq-root .wft-faq-powered a{color:#64748b;text-decoration:none;border-bottom:1px dotted #cbd5e1;}"
      + ".wft-faq-root .wft-faq-powered a:hover{color:" + ACCENT + ";border-bottom-color:" + ACCENT + ";}";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function esc(s) {
    if (s == null) return "";
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function render(target, data) {
    var root = document.createElement("div");
    root.className = "wft-faq-root";

    if (!data.items || !data.items.length) {
      root.innerHTML = '<div class="wft-faq-empty">No FAQs published yet.</div>';
      target.parentNode.insertBefore(root, target.nextSibling);
      return;
    }

    var caret = '<svg class="wft-faq-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    var html = "";
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      html += '<details class="wft-faq-item">'
        + '<summary class="wft-faq-q">'
          + '<span>' + esc(it.question) + '</span>'
          + caret
        + '</summary>'
        + '<div class="wft-faq-a">' + esc(it.answer) + '</div>'
        + '</details>';
    }

    if (data.poweredBy) {
      html += '<div class="wft-faq-powered">Powered by '
        + '<a href="https://wefixtrades.com?utm_source=widget&utm_medium=faq" target="_blank" rel="noopener">WeFixTrades</a>'
        + '</div>';
    }

    root.innerHTML = html;
    target.parentNode.insertBefore(root, target.nextSibling);

    // JSON-LD FAQPage schema for SEO rich results.
    var schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: data.items.map(function (it) {
        return {
          "@type": "Question",
          name: it.question,
          acceptedAnswer: { "@type": "Answer", text: it.answer },
        };
      }),
    };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.appendChild(document.createTextNode(JSON.stringify(schema)));
    target.parentNode.insertBefore(s, target.nextSibling);
  }

  function mount(ctx) {
    var url = ctx.apiBase + "/api/widget/" + encodeURIComponent(ctx.siteKey) + "/faq";
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
  // Replace the array with a push-trap so any late v1.js invocation still works.
  window[CTX_KEY] = { push: function (ctx) { mount(ctx); } };
})();
