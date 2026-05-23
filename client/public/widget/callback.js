/* WeFixTrades free-tools Callback Form widget — vanilla
 *
 * Embedded via the v1 loader:
 *   <script src="https://wefixtrades.com/widget/v1.js"
 *           data-site-key="<32-hex-widget-token>"
 *           data-tool="callback"
 *           data-mode="inline" | "popup"          (default inline)
 *           async></script>
 *
 * v1.js dispatches here when data-tool="callback". Reads the queued
 * context from window.__WFT_WIDGET_CTX_callback[], fetches
 * /api/widget/:token/callback-config, renders a small form (or a launcher
 * button + popup), submits to /api/widget/:token/callback.
 *
 * Anti-spam:
 *   * Honeypot field (hp) — invisible to humans, bots fill it. Backend
 *     accepts then drops.
 *   * Backend rate-limits 3 submissions/hour per token+IP.
 */
(function () {
  "use strict";

  var CTX_KEY = "__WFT_WIDGET_CTX_callback";
  var STYLE_ID = "wft-cb-style";
  var ACCENT = "#0066cc";
  var ACCENT_SOFT = "rgba(0, 102, 204, 0.08)";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ""
      + ".wft-cb-root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;max-width:420px;margin:0;}"
      + ".wft-cb-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}"
      + ".wft-cb-heading{margin:0 0 12px;font-size:16px;font-weight:600;color:#0f172a;}"
      + ".wft-cb-field{margin-bottom:10px;}"
      + ".wft-cb-label{display:block;font-size:11px;font-weight:500;color:#475569;margin-bottom:4px;}"
      + ".wft-cb-input,.wft-cb-area{width:100%;box-sizing:border-box;padding:9px 11px;font-size:14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font-family:inherit;}"
      + ".wft-cb-input:focus,.wft-cb-area:focus{outline:none;border-color:" + ACCENT + ";box-shadow:0 0 0 3px " + ACCENT_SOFT + ";}"
      + ".wft-cb-area{resize:vertical;min-height:64px;}"
      + ".wft-cb-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}"
      + ".wft-cb-btn{display:inline-block;padding:10px 16px;font-size:14px;font-weight:600;color:#fff;background:" + ACCENT + ";border:none;border-radius:8px;cursor:pointer;width:100%;}"
      + ".wft-cb-btn:hover{background:#0058b3;}"
      + ".wft-cb-btn:disabled{opacity:0.6;cursor:not-allowed;}"
      + ".wft-cb-success{padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;font-size:14px;}"
      + ".wft-cb-error{padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:13px;margin-bottom:10px;}"
      + ".wft-cb-powered{margin-top:8px;font-size:11px;color:#94a3b8;text-align:right;}"
      + ".wft-cb-powered a{color:#64748b;text-decoration:none;border-bottom:1px dotted #cbd5e1;}"
      + ".wft-cb-launcher{position:fixed;bottom:24px;right:24px;z-index:999997;background:" + ACCENT + ";color:#fff;border:none;border-radius:999px;padding:13px 20px;font-size:14px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,0.14);cursor:pointer;}"
      + ".wft-cb-popup{position:fixed;bottom:88px;right:24px;width:min(380px,calc(100vw - 32px));z-index:999998;}"
      + ".wft-cb-close{position:absolute;top:8px;right:10px;background:transparent;border:none;font-size:20px;line-height:1;color:#94a3b8;cursor:pointer;padding:4px;}";
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

  function buildForm(cfg, opts) {
    var fields = cfg.fields || {};
    var html = '<div class="wft-cb-card" role="form" aria-label="' + esc(cfg.heading || "Request a callback") + '">';
    if (opts && opts.closable) {
      html += '<button type="button" class="wft-cb-close" aria-label="Close">×</button>';
    }
    html += '<h3 class="wft-cb-heading">' + esc(cfg.heading || "Request a callback") + "</h3>";
    html += '<div class="wft-cb-error" style="display:none;" data-role="error"></div>';
    html += '<form data-role="form" novalidate>';
    if (fields.name !== false) {
      html += '<div class="wft-cb-field"><label class="wft-cb-label" for="wft-cb-name">Name</label>'
        + '<input class="wft-cb-input" type="text" id="wft-cb-name" name="name" required autocomplete="name" /></div>';
    }
    // Phone is always required — it's the lead.
    html += '<div class="wft-cb-field"><label class="wft-cb-label" for="wft-cb-phone">Phone</label>'
      + '<input class="wft-cb-input" type="tel" id="wft-cb-phone" name="phone" required autocomplete="tel" /></div>';
    if (fields.best_time !== false) {
      html += '<div class="wft-cb-field"><label class="wft-cb-label" for="wft-cb-best">Best time to call</label>'
        + '<input class="wft-cb-input" type="text" id="wft-cb-best" name="best_time" placeholder="e.g. weekday afternoons" /></div>';
    }
    if (fields.message !== false) {
      html += '<div class="wft-cb-field"><label class="wft-cb-label" for="wft-cb-msg">What can we help with?</label>'
        + '<textarea class="wft-cb-area" id="wft-cb-msg" name="message" rows="3"></textarea></div>';
    }
    // Honeypot — invisible, real users skip it.
    html += '<input class="wft-cb-hp" type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />';
    html += '<button type="submit" class="wft-cb-btn" data-role="submit">' + esc(cfg.ctaLabel || "Send request") + "</button>";
    html += "</form>";
    if (cfg.poweredBy) {
      html += '<div class="wft-cb-powered">Powered by '
        + '<a href="https://wefixtrades.com?utm_source=widget&utm_medium=callback" target="_blank" rel="noopener">WeFixTrades</a>'
        + "</div>";
    }
    html += "</div>";
    return html;
  }

  function wireForm(root, ctx) {
    var form = root.querySelector('[data-role="form"]');
    var submitBtn = root.querySelector('[data-role="submit"]');
    var errorEl = root.querySelector('[data-role="error"]');
    if (!form || !submitBtn) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        message: String(fd.get("message") || "").trim() || undefined,
        best_time: String(fd.get("best_time") || "").trim() || undefined,
        hp: String(fd.get("hp") || ""),
        source_url: window.location.href.slice(0, 500),
      };
      if (!payload.name || !payload.phone) {
        errorEl.textContent = "Name and phone are required.";
        errorEl.style.display = "";
        return;
      }
      errorEl.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      var url = ctx.apiBase + "/api/widget/" + encodeURIComponent(ctx.siteKey) + "/callback";
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
        })
        .then(function (resp) {
          if (!resp.ok) {
            errorEl.textContent = (resp.data && resp.data.error) || "Couldn't send. Please try again.";
            errorEl.style.display = "";
            submitBtn.disabled = false;
            submitBtn.textContent = "Send request";
            return;
          }
          // Replace card with success message.
          var card = root.querySelector(".wft-cb-card");
          if (card) {
            card.innerHTML = '<div class="wft-cb-success">Thanks! We\'ll get back to you shortly.</div>';
          }
        })
        .catch(function () {
          errorEl.textContent = "Network error — please try again.";
          errorEl.style.display = "";
          submitBtn.disabled = false;
          submitBtn.textContent = "Send request";
        });
    });
  }

  function renderInline(target, cfg, ctx) {
    var root = document.createElement("div");
    root.className = "wft-cb-root";
    root.innerHTML = buildForm(cfg, { closable: false });
    target.parentNode.insertBefore(root, target.nextSibling);
    wireForm(root, ctx);
  }

  function renderPopup(cfg, ctx) {
    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "wft-cb-launcher";
    launcher.setAttribute("aria-label", "Open callback request form");
    launcher.textContent = "📞 " + (cfg.heading || "Request a callback");
    document.body.appendChild(launcher);

    var popup = null;
    function open() {
      if (popup) return;
      popup = document.createElement("div");
      popup.className = "wft-cb-popup wft-cb-root";
      popup.innerHTML = buildForm(cfg, { closable: true });
      document.body.appendChild(popup);
      wireForm(popup, ctx);
      var close = popup.querySelector(".wft-cb-close");
      if (close) close.addEventListener("click", destroy);
    }
    function destroy() {
      if (!popup) return;
      popup.parentNode.removeChild(popup);
      popup = null;
    }
    launcher.addEventListener("click", function () { popup ? destroy() : open(); });
  }

  function mount(ctx) {
    var url = ctx.apiBase + "/api/widget/" + encodeURIComponent(ctx.siteKey) + "/callback-config";
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || cfg.enabled === false) return;
        ensureStyle();
        var mode = (ctx.script && ctx.script.getAttribute("data-mode") || "inline").toLowerCase();
        if (mode === "popup") {
          renderPopup(cfg, ctx);
        } else {
          var target = ctx.target ? document.querySelector(ctx.target) : ctx.script;
          if (!target) return;
          renderInline(target, cfg, ctx);
        }
      })
      .catch(function () { /* silent */ });
  }

  var queue = window[CTX_KEY] || [];
  while (queue.length) mount(queue.shift());
  window[CTX_KEY] = { push: function (ctx) { mount(ctx); } };
})();
