/* WeFixTrades TradeLine chat widget — v1
 * Embedded via:
 *   <script src="https://wefixtrades.com/widget/v1.js" data-site-key="..."></script>
 *
 * No framework. Inline-injected (not iframe — strict-CSP sites need
 * the iframe variant which is on the roadmap). Communicates with
 * /api/widget/config/:key and /api/widget/chat.
 */
(function () {
  "use strict";

  // Find the loader script tag(s). We may be called multiple times when the
  // host page embeds the v1 loader for several different tools — once for
  // the TradeLine chat, again for a FAQ widget, etc. Each invocation now
  // dispatches on the script tag's data-tool attribute. The chat-only
  // singleton guard runs INSIDE the chat branch below.
  var scripts = document.getElementsByTagName("script");
  var thisScript = null;
  for (var i = scripts.length - 1; i >= 0; i--) {
    var s = scripts[i];
    if (s.src && s.src.indexOf("/widget/v1.js") !== -1) {
      thisScript = s;
      break;
    }
  }
  if (!thisScript) return;
  var siteKey = thisScript.getAttribute("data-site-key");
  if (!siteKey || !/^[a-f0-9]{32}$/.test(siteKey)) return;

  // Resolve the origin once (used by both dispatch + chat branches).
  var __apiBase;
  try {
    var __u = new URL(thisScript.src);
    __apiBase = __u.protocol + "//" + __u.host;
  } catch (e) {
    __apiBase = "";
  }

  // ── Free-tools dispatcher ────────────────────────────────────────────
  // If data-tool is one of the free-tool widgets, load the matching
  // sub-script (faq.js / hours.js / badges.js) and bail. The sub-script
  // self-locates the script tag via document.currentScript and renders.
  var __tool = (thisScript.getAttribute("data-tool") || "").toLowerCase();
  if (__tool === "faq" || __tool === "hours" || __tool === "badges") {
    // Stash context so the sub-script can find it without re-parsing.
    var __ctxKey = "__WFT_WIDGET_CTX_" + __tool;
    window[__ctxKey] = window[__ctxKey] || [];
    window[__ctxKey].push({
      siteKey: siteKey,
      target: thisScript.getAttribute("data-target") || null,
      script: thisScript,
      apiBase: __apiBase,
    });
    var __sub = document.createElement("script");
    __sub.src = __apiBase + "/widget/" + __tool + ".js";
    __sub.async = true;
    document.head.appendChild(__sub);
    return;
  }

  // ── TradeLine chat (default / backward-compat) ───────────────────────
  if (window.__wefixtradesWidgetLoaded) return;
  window.__wefixtradesWidgetLoaded = true;

  // Reuse the API base resolved above for the chat-specific fetch calls.
  var apiBase = __apiBase;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  // Lightweight state
  var state = {
    config: null,
    open: false,
    messages: [],
    sending: false,
    sessionId: null,
  };

  // === DOM helpers ===
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "style" && typeof attrs[k] === "object") {
          for (var sk in attrs[k]) e.style[sk] = attrs[k][sk];
        } else if (k === "html") {
          e.innerHTML = attrs[k];
        } else {
          e.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return e;
  }

  // === Render ===
  var root, panel, launcher, messagesEl, inputEl;

  function render() {
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);

    // Launcher button
    launcher = el(
      "button",
      {
        type: "button",
        "aria-label": "Open chat",
        style: {
          position: "fixed",
          bottom: "24px",
          right: state.config.position === "bottom-left" ? "auto" : "24px",
          left: state.config.position === "bottom-left" ? "24px" : "auto",
          zIndex: "999998",
          background: state.config.accentColor,
          color: "#fff",
          border: "none",
          borderRadius: "999px",
          padding: "14px 20px",
          fontSize: "14px",
          fontWeight: "600",
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          boxShadow: "0 6px 24px rgba(0,0,0,0.14)",
          cursor: "pointer",
          display: state.open ? "none" : "inline-flex",
          alignItems: "center",
          gap: "8px",
        },
      },
      ["💬 Chat with us"],
    );
    launcher.addEventListener("click", function () { setOpen(true); });

    // Chat panel
    if (state.open) {
      panel = el(
        "div",
        {
          role: "dialog",
          "aria-label": (state.config.displayName || "WeFixTrades") + " chat",
          style: {
            position: "fixed",
            bottom: "24px",
            right: state.config.position === "bottom-left" ? "auto" : "24px",
            left: state.config.position === "bottom-left" ? "24px" : "auto",
            width: "min(380px, calc(100vw - 32px))",
            height: "min(540px, calc(100vh - 48px))",
            background: "#ffffff",
            color: "#0F172A",
            borderRadius: "16px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.20)",
            zIndex: "999999",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            fontSize: "14px",
          },
        },
        [
          renderHeader(),
          renderMessages(),
          renderInput(),
        ],
      );
      root.appendChild(panel);
    }

    root.appendChild(launcher);
  }

  function renderHeader() {
    var titleStack = el("div", {}, [
      el("div", { style: { fontWeight: "600" } }, [state.config.displayName || "WeFixTrades"]),
      el("div", { style: { fontSize: "11px", opacity: "0.85" } }, ["We typically reply within a minute"]),
    ]);
    var closeBtn = el(
      "button",
      {
        type: "button",
        "aria-label": "Close chat",
        style: {
          background: "transparent",
          border: "none",
          color: "#fff",
          fontSize: "20px",
          cursor: "pointer",
          padding: "0 4px",
          lineHeight: "1",
        },
      },
      ["×"],
    );
    closeBtn.addEventListener("click", function () { setOpen(false); });

    return el(
      "div",
      {
        style: {
          background: state.config.accentColor,
          color: "#fff",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      [titleStack, closeBtn],
    );
  }

  function renderMessages() {
    messagesEl = el("div", {
      style: {
        flex: "1",
        overflowY: "auto",
        padding: "12px 14px",
        background: "#F8FAFC",
      },
    });
    var msgs = state.messages.slice();
    if (msgs.length === 0) {
      msgs.push({ role: "assistant", content: state.config.greeting });
    }
    for (var i = 0; i < msgs.length; i++) {
      messagesEl.appendChild(renderMessage(msgs[i]));
    }
    if (state.sending) {
      messagesEl.appendChild(el("div", {
        style: { fontSize: "11px", color: "#64748B", padding: "4px 8px", fontStyle: "italic" },
      }, ["typing…"]));
    }
    setTimeout(function () {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 0);
    return messagesEl;
  }

  function renderMessage(m) {
    var isUser = m.role === "user";
    var bubble = el(
      "div",
      {
        style: {
          maxWidth: "82%",
          padding: "8px 12px",
          borderRadius: "14px",
          background: isUser ? state.config.accentColor : "#FFFFFF",
          color: isUser ? "#FFFFFF" : "#0F172A",
          border: isUser ? "none" : "1px solid #E2E8F0",
          fontSize: "14px",
          lineHeight: "1.45",
          whiteSpace: "pre-wrap",
        },
      },
      [m.content],
    );
    return el(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: isUser ? "flex-end" : "flex-start",
          marginBottom: "8px",
        },
      },
      [bubble],
    );
  }

  function renderInput() {
    inputEl = el("input", {
      type: "text",
      placeholder: "Type a message…",
      style: {
        flex: "1",
        padding: "8px 12px",
        borderRadius: "8px",
        border: "1px solid #E2E8F0",
        fontSize: "14px",
        outline: "none",
      },
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") send();
    });

    var sendBtn = el(
      "button",
      {
        type: "button",
        style: {
          padding: "8px 14px",
          borderRadius: "8px",
          background: state.config.accentColor,
          color: "#fff",
          border: "none",
          fontWeight: "600",
          cursor: "pointer",
          fontSize: "13px",
        },
      },
      ["Send"],
    );
    sendBtn.addEventListener("click", send);

    var footer = el(
      "div",
      {
        style: {
          display: "flex",
          gap: "8px",
          padding: "10px 12px",
          borderTop: "1px solid #E2E8F0",
          background: "#FFFFFF",
        },
      },
      [inputEl, sendBtn],
    );

    var poweredBy = el(
      "div",
      {
        style: {
          padding: "4px 12px 8px",
          background: "#FFFFFF",
          fontSize: "10px",
          color: "#94A3B8",
          textAlign: "center",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        },
      },
      ["Powered by WeFixTrades"],
    );

    var wrap = el("div", {});
    wrap.appendChild(footer);
    wrap.appendChild(poweredBy);
    return wrap;
  }

  // === Actions ===
  function setOpen(v) {
    state.open = !!v;
    render();
    if (state.open && inputEl) setTimeout(function () { inputEl.focus(); }, 50);
  }

  function send() {
    if (state.sending || !inputEl) return;
    var text = (inputEl.value || "").trim();
    if (!text) return;
    inputEl.value = "";
    state.messages.push({ role: "user", content: text });
    state.sending = true;
    render();

    fetch(apiBase + "/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteKey: siteKey, sessionId: state.sessionId || undefined, messages: state.messages }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.sending = false;
        if (d.sessionId) state.sessionId = d.sessionId;
        state.messages.push({ role: "assistant", content: d.reply || "Sorry, something went wrong." });
        render();
      })
      .catch(function () {
        state.sending = false;
        state.messages.push({
          role: "assistant",
          content: "I couldn't reach the team — please try again in a moment.",
        });
        render();
      });
  }

  // === Boot ===
  ready(function () {
    fetch(apiBase + "/api/widget/config/" + siteKey)
      .then(function (r) {
        if (!r.ok) throw new Error("Widget config failed");
        return r.json();
      })
      .then(function (cfg) {
        state.config = cfg;
        root = document.createElement("div");
        root.id = "wefixtrades-widget-root";
        document.body.appendChild(root);
        render();
      })
      .catch(function () {
        // Silent fail — widget just doesn't render
      });
  });
})();
