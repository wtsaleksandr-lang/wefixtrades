/* ReputationShield — Review Widget embed script
 *
 * Embedded via (copied from the customer's portal):
 *   <script src="https://wefixtrades.com/widget/embed.js"
 *     data-wft-widget="badge"
 *     data-wft-token="..."></script>
 *
 * No framework, no dependencies. Inline-injected at the script's own
 * location in the DOM — the embed code is just a <script> tag, so the
 * widget renders a container right where that tag sits.
 *
 *   data-wft-token   (required) — the client's widget token
 *   data-wft-widget  (optional) — "badge" (default) or "carousel"
 *   data-wft-theme   (optional) — "light" (default) or "dark"
 *
 * Data feed: GET /api/review-widget/:token (CORS-open, 10-min cached).
 * Fails silent on the host site — never renders an error box.
 */
(function () {
  "use strict";

  /* Locate this script tag. Multiple embeds on one page are allowed
     (e.g. a header badge + a landing-page carousel), so we do NOT
     guard with a global "already loaded" flag — each tag self-mounts. */
  var scripts = document.getElementsByTagName("script");
  var thisScript = null;
  for (var i = scripts.length - 1; i >= 0; i--) {
    var s = scripts[i];
    if (s.src && s.src.indexOf("/widget/embed.js") !== -1 && !s.__wftMounted) {
      thisScript = s;
      break;
    }
  }
  if (!thisScript) return;
  thisScript.__wftMounted = true;

  var token = thisScript.getAttribute("data-wft-token");
  if (!token || token.length < 16) {
    console.warn("[ReputationShield] Missing or invalid data-wft-token.");
    return;
  }
  var mode = thisScript.getAttribute("data-wft-widget") === "carousel" ? "carousel" : "badge";
  var theme = thisScript.getAttribute("data-wft-theme") === "dark" ? "dark" : "light";
  var apiBase = thisScript.src.replace(/\/widget\/embed\.js.*$/, "");

  var C = theme === "dark"
    ? { bg: "#1a1f26", card: "#232a33", text: "#e8eaed", muted: "#9aa0a6", border: "#333b45" }
    : { bg: "#ffffff", card: "#f7f8fa", text: "#1f2933", muted: "#6b7280", border: "#e3e6ea" };
  var STAR = "#fbbc05";

  /* Mount container, inserted right before the script tag. */
  var mount = document.createElement("div");
  mount.className = "wft-review-widget";
  if (thisScript.parentNode) {
    thisScript.parentNode.insertBefore(mount, thisScript);
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function stars(rating) {
    var full = Math.round(rating || 0), out = "";
    for (var i = 1; i <= 5; i++) {
      out += '<span style="color:' + (i <= full ? STAR : C.border) +
        ';font-size:15px;line-height:1;">★</span>';
    }
    return out;
  }

  function fmtDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    } catch (e) { return ""; }
  }

  function header(data) {
    return '<div style="display:flex;align-items:center;gap:10px;">' +
      '<span style="font-size:28px;font-weight:700;">' + esc(data.average_rating) + "</span>" +
      "<span>" + stars(data.average_rating) +
      '<div style="font-size:12px;color:' + C.muted + ';margin-top:2px;">' +
      esc(data.total_reviews) + " review" + (data.total_reviews === 1 ? "" : "s") +
      " on Google</div></span></div>";
  }

  function footer() {
    return '<div style="margin-top:12px;font-size:10px;color:' + C.muted +
      ';text-align:right;">Reviews by ' +
      '<a href="https://wefixtrades.com/products/reputationshield" target="_blank" ' +
      'rel="noopener" style="color:' + C.muted + ';">ReputationShield</a></div>';
  }

  function render(data) {
    if (!data || !data.reviews) return;

    var wrap = document.createElement("div");
    wrap.style.cssText =
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
      "background:" + C.bg + ";color:" + C.text + ";border:1px solid " + C.border +
      ";border-radius:12px;padding:16px;max-width:420px;box-sizing:border-box;";

    var html = header(data);

    if (mode === "carousel" && data.reviews.length > 0) {
      html += '<div class="wft-rw-card" style="margin-top:14px;background:' + C.card +
        ";border-radius:10px;padding:14px;min-height:96px;transition:opacity .3s ease;\"></div>";
    }
    html += footer();
    wrap.innerHTML = html;
    mount.innerHTML = "";
    mount.appendChild(wrap);

    if (mode === "carousel" && data.reviews.length > 0) {
      var card = wrap.querySelector(".wft-rw-card");
      var idx = 0;
      function paint() {
        var r = data.reviews[idx];
        card.innerHTML =
          '<div style="margin-bottom:6px;">' + stars(r.rating) + "</div>" +
          '<div style="font-size:13px;line-height:1.5;">' + esc(r.text) + "</div>" +
          '<div style="font-size:12px;color:' + C.muted + ';margin-top:8px;">— ' +
          esc(r.author) + (r.date ? " · " + esc(fmtDate(r.date)) : "") + "</div>";
      }
      paint();
      if (data.reviews.length > 1) {
        setInterval(function () {
          card.style.opacity = "0";
          setTimeout(function () {
            idx = (idx + 1) % data.reviews.length;
            paint();
            card.style.opacity = "1";
          }, 300);
        }, 5000);
      }
    }
  }

  fetch(apiBase + "/api/review-widget/" + encodeURIComponent(token))
    .then(function (res) {
      if (!res.ok) throw new Error("widget feed " + res.status);
      return res.json();
    })
    .then(render)
    .catch(function (err) {
      // Fail silent on the host site.
      console.warn("[ReputationShield] Widget unavailable:", err.message);
    });
})();
