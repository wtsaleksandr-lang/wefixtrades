/**
 * QuoteQuick Widget Embed Script
 *
 * Usage (inline):
 *   <script src="https://YOUR_DOMAIN/embed-widget.js"
 *     data-calculator-slug="your-slug"
 *     async></script>
 *   <div id="quotequick-widget"></div>
 *
 * Usage (popup):
 *   <script src="https://YOUR_DOMAIN/embed-widget.js"
 *     data-calculator-slug="your-slug"
 *     data-mode="popup"
 *     data-button-label="Get a Free Quote"
 *     async></script>
 *
 * Usage (floating — BD-3m):
 *   <script src="https://YOUR_DOMAIN/embed-widget.js"
 *     data-calculator-slug="your-slug"
 *     data-mode="floating"
 *     data-position="bottom-right"
 *     async></script>
 *
 * Attributes:
 *   data-calculator-slug  (required) — your calculator slug
 *   data-mode             (optional) — "inline" (default), "popup", or "floating"
 *   data-position         (optional, floating only) — "bottom-right" (default),
 *                          "bottom-left", "top-right", "top-left"
 *   data-button-label     (optional) — popup button text (default: "Get a Free Quote")
 *   data-accent-color     (optional) — popup button color (default: #394247)
 *   data-base-url         (optional) — override base URL for self-hosted installs
 *
 * BD-3m — floating mode renders a 56×56 circular launcher icon docked into
 * the chosen corner. Clicking expands the full widget in a 480×720 panel
 * (auto-fits viewport; goes full-screen with backdrop scrim on ≤ 768px).
 * The launcher collides defensively with the AI chat bubble (qq-chat-position
 * localStorage): when both pick the same corner, the launcher offsets 72px
 * horizontally on desktop or vertically on mobile so they never overlap.
 */
(function () {
  'use strict';

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var slug = script.getAttribute('data-calculator-slug');
  if (!slug) {
    console.warn('[QuoteQuick] Missing data-calculator-slug attribute.');
    return;
  }

  var baseUrl = script.getAttribute('data-base-url') || script.src.replace(/\/embed-widget\.js.*$/, '');
  var mode = script.getAttribute('data-mode') || 'inline';
  var accentColor = script.getAttribute('data-accent-color') || '#394247';
  var buttonLabel = script.getAttribute('data-button-label') || 'Get a Free Quote';
  // BD-3m — floating mode position. Defaults to bottom-right; falls back
  // to that default for any unrecognised value.
  var rawPosition = script.getAttribute('data-position') || 'bottom-right';
  var VALID_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
  var position = VALID_POSITIONS.indexOf(rawPosition) >= 0 ? rawPosition : 'bottom-right';

  var iframeSrc = baseUrl + '/calculator?slug=' + encodeURIComponent(slug) + '&embed=true';

  /* ─── Inline Mode ─── */
  if (mode === 'inline') {
    var container = document.getElementById('quotequick-widget');
    if (!container) {
      // Fallback: insert after the script tag
      container = document.createElement('div');
      container.id = 'quotequick-widget';
      script.parentNode.insertBefore(container, script.nextSibling);
    }

    var iframe = document.createElement('iframe');
    iframe.src = iframeSrc;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('title', 'Instant Quote Calculator');
    Object.assign(iframe.style, {
      width: '100%',
      minHeight: '520px',
      border: 'none',
      borderRadius: '16px',
      display: 'block',
    });

    // Auto-resize via postMessage from the embedded widget.
    // Audit 2026-05-24 P0 #3 — verify source is the iframe we mounted, not
    // an arbitrary window on the host page spoofing the message shape.
    window.addEventListener('message', function (e) {
      if (e.source !== iframe.contentWindow) return;
      if (e.data && e.data.type === 'quotequick-resize' && e.data.slug === slug) {
        iframe.style.height = e.data.height + 'px';
      }
    });

    container.appendChild(iframe);
    return;
  }

  /* ─── Floating Mode — BD-3m ───────────────────────────────────────
   *
   * A 56×56 (mobile: 48×48) circular launcher icon docked in the chosen
   * corner. Clicking expands the full widget in a 480×720 panel; mobile
   * goes full-screen with a backdrop scrim. State persists in
   * `qq-launcher-state-${slug}` localStorage (default closed). The
   * launcher reads `qq-chat-position` to detect collision with the AI
   * chat bubble and offsets 72px on the long axis when they share a corner.
   *
   * Iframe-of-AdvancedCalculator — same /calculator?slug=…&embed=true URL
   * the inline mode uses. The host page never sees the React app, only
   * the iframe; CSP-friendly. */
  if (mode === 'floating') {
    var LAUNCHER_STORAGE_KEY = 'qq-launcher-state-' + slug;
    var CHAT_POSITION_KEY = 'qq-chat-position';
    var EDGE = 20;
    var COLLISION_OFFSET = 72;
    var MOBILE_BREAKPOINT = 768;
    var ANIM_MS = 240;
    var LAUNCHER_BRAND_BLUE = '#0d3cfc';

    function readStorage(key) {
      try { return window.localStorage.getItem(key); } catch (_) { return null; }
    }
    function writeStorage(key, value) {
      try { window.localStorage.setItem(key, value); } catch (_) { /* silent */ }
    }
    function isMobile() {
      return window.innerWidth <= MOBILE_BREAKPOINT;
    }
    function reducedMotion() {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch (_) { return false; }
    }
    /* Read the AI chat panel's stored {x, y} and translate to a corner.
     * Returns null if no value is stored (chat never opened). */
    function resolveChatCorner() {
      var raw = readStorage(CHAT_POSITION_KEY);
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var left = parsed.x < vw / 2;
        var top = parsed.y < vh / 2;
        return (top ? 'top' : 'bottom') + '-' + (left ? 'left' : 'right');
      } catch (_) { return null; }
    }
    function collides() {
      return resolveChatCorner() === position;
    }

    // ─── Launcher icon — brand-blue Calculator on white circle. ──
    // Inline SVG instead of a font dependency. 24×24 viewBox of lucide
    // Calculator, scaled to fit the 56px / 48px circle.
    var LAUNCHER_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="' + LAUNCHER_BRAND_BLUE + '" stroke-width="2.25" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<rect width="16" height="20" x="4" y="2" rx="2"/>' +
      '<line x1="8" x2="16" y1="6" y2="6"/>' +
      '<line x1="16" x2="16" y1="14" y2="18"/>' +
      '<path d="M16 10h.01"/>' +
      '<path d="M12 10h.01"/>' +
      '<path d="M8 10h.01"/>' +
      '<path d="M12 14h.01"/>' +
      '<path d="M8 14h.01"/>' +
      '<path d="M12 18h.01"/>' +
      '<path d="M8 18h.01"/>' +
      '</svg>';

    var launcher = document.createElement('button');
    launcher.setAttribute('type', 'button');
    launcher.setAttribute('aria-label', 'Open quote calculator');
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.setAttribute('data-testid', 'qq-launcher');
    launcher.setAttribute('data-position', position);
    launcher.innerHTML = LAUNCHER_SVG;

    var panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Quote calculator');
    panel.setAttribute('data-testid', 'qq-launcher-panel');

    var scrim = document.createElement('div');
    scrim.setAttribute('aria-hidden', 'true');
    scrim.setAttribute('data-testid', 'qq-launcher-scrim');

    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close calculator');
    closeBtn.setAttribute('data-testid', 'qq-launcher-close');
    closeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#0f172a" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '2',
      width: '32px',
      height: '32px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fff',
      border: '1px solid rgba(15,23,42,0.12)',
      borderRadius: '999px',
      cursor: 'pointer',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      padding: '0',
    });

    var iframeEl = document.createElement('iframe');
    iframeEl.src = iframeSrc;
    iframeEl.setAttribute('frameborder', '0');
    iframeEl.setAttribute('allowtransparency', 'true');
    iframeEl.setAttribute('title', 'Instant Quote Calculator');
    Object.assign(iframeEl.style, {
      width: '100%',
      height: '100%',
      border: 'none',
      display: 'block',
    });

    // ─── Static styling ─────────────────────────────────────────────
    function applyLauncherStyle() {
      var mobile = isMobile();
      var size = mobile ? 48 : 56;
      var hCollide = collides() && !mobile ? COLLISION_OFFSET : 0;
      var vCollide = collides() && mobile ? COLLISION_OFFSET : 0;
      var style = {
        position: 'fixed',
        width: size + 'px',
        height: size + 'px',
        zIndex: '9990',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        padding: '0',
        boxShadow: '0 6px 18px rgba(15,23,42,0.18)',
        transition: reducedMotion() ? 'none' : 'transform 120ms ease-out, box-shadow 120ms ease-out',
        // Reset corner anchors before re-applying
        top: '', right: '', bottom: '', left: '',
      };
      if (position === 'bottom-right') { style.bottom = (EDGE + vCollide) + 'px'; style.right = (EDGE + hCollide) + 'px'; }
      else if (position === 'bottom-left') { style.bottom = (EDGE + vCollide) + 'px'; style.left = (EDGE + hCollide) + 'px'; }
      else if (position === 'top-right') { style.top = (EDGE + vCollide) + 'px'; style.right = (EDGE + hCollide) + 'px'; }
      else if (position === 'top-left') { style.top = (EDGE + vCollide) + 'px'; style.left = (EDGE + hCollide) + 'px'; }
      // Override the SVG fill: re-size to match the circle.
      var svg = launcher.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', String(mobile ? 22 : 26));
        svg.setAttribute('height', String(mobile ? 22 : 26));
      }
      Object.assign(launcher.style, style);
    }

    function applyPanelStyle() {
      var mobile = isMobile();
      var base = {
        position: 'fixed',
        zIndex: '9991',
        background: '#fff',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transformOrigin: position.replace('-', ' '),
        // Reset corner anchors before re-applying
        top: '', right: '', bottom: '', left: '',
        width: '', height: '', inset: '',
        borderRadius: mobile ? '0' : '16px',
      };
      if (mobile) {
        base.inset = '0';
        base.width = '100vw';
        base.height = '100vh';
      } else {
        base.width = 'min(480px, calc(100vw - 32px))';
        base.height = 'min(720px, calc(100vh - 32px))';
        if (position === 'bottom-right') { base.bottom = EDGE + 'px'; base.right = EDGE + 'px'; }
        else if (position === 'bottom-left') { base.bottom = EDGE + 'px'; base.left = EDGE + 'px'; }
        else if (position === 'top-right') { base.top = EDGE + 'px'; base.right = EDGE + 'px'; }
        else if (position === 'top-left') { base.top = EDGE + 'px'; base.left = EDGE + 'px'; }
      }
      Object.assign(panel.style, base);
    }

    function applyScrimStyle() {
      Object.assign(scrim.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '9991',
        background: 'rgba(15,23,42,0.42)',
      });
    }

    applyLauncherStyle();
    applyPanelStyle();
    applyScrimStyle();

    panel.appendChild(closeBtn);
    panel.appendChild(iframeEl);

    // ─── Reduced-motion + keyframe stylesheet ───────────────────────
    var styleEl = document.createElement('style');
    styleEl.textContent =
      '@keyframes qq-launcher-expand { 0% { opacity: 0; transform: scale(0.92); } 100% { opacity: 1; transform: scale(1); } }' +
      '@media (prefers-reduced-motion: reduce) {' +
      '  [data-testid="qq-launcher"], [data-testid="qq-launcher-panel"] {' +
      '    animation: none !important; transition: none !important;' +
      '  }' +
      '}';
    document.head.appendChild(styleEl);

    var isOpen = false;
    function setOpen(next) {
      isOpen = next;
      launcher.style.display = next ? 'none' : 'inline-flex';
      panel.style.display = next ? 'flex' : 'none';
      scrim.style.display = next && isMobile() ? 'block' : 'none';
      if (next && !reducedMotion()) {
        panel.style.animation = 'qq-launcher-expand ' + ANIM_MS + 'ms ease-out';
      } else {
        panel.style.animation = '';
      }
      writeStorage(LAUNCHER_STORAGE_KEY, next ? 'open' : 'closed');
    }

    // Default closed; honour saved state on load.
    panel.style.display = 'none';
    scrim.style.display = 'none';
    if (readStorage(LAUNCHER_STORAGE_KEY) === 'open') {
      // Defer to next tick so the styles apply before showing.
      setTimeout(function () { setOpen(true); }, 0);
    }

    launcher.addEventListener('click', function () { setOpen(true); });
    closeBtn.addEventListener('click', function () { setOpen(false); });
    scrim.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) setOpen(false);
    });

    // Hover scale on desktop (skipped when reduced-motion).
    launcher.addEventListener('mouseenter', function () {
      if (reducedMotion()) return;
      launcher.style.transform = 'scale(1.04)';
    });
    launcher.addEventListener('mouseleave', function () {
      if (reducedMotion()) return;
      launcher.style.transform = 'scale(1)';
    });

    // Auto-resize: the panel is fixed-size on desktop; we ignore the
    // postMessage height bump and let the iframe scroll internally. (The
    // panel content has its own scrollbars via overflow:hidden.) The
    // inline + popup modes keep the auto-resize behaviour they always had.

    // Recompute on viewport changes (mobile/desktop crossing) + on storage
    // events (chat bubble dragged in another tab → may collide now).
    function recompute() {
      applyLauncherStyle();
      applyPanelStyle();
      // Re-apply visibility — applyLauncherStyle resets `display`.
      launcher.style.display = isOpen ? 'none' : 'inline-flex';
      panel.style.display = isOpen ? 'flex' : 'none';
      scrim.style.display = isOpen && isMobile() ? 'block' : 'none';
    }
    window.addEventListener('resize', recompute);
    window.addEventListener('storage', function (e) {
      if (e.key === CHAT_POSITION_KEY) recompute();
    });

    document.body.appendChild(scrim);
    document.body.appendChild(panel);
    document.body.appendChild(launcher);
    return;
  }

  /* ─── Popup Mode ─── */
  var BUBBLE_SIZE = 'auto';
  var BUBBLE_MARGIN = 20;
  var isOpen = false;

  // Popup button
  var btn = document.createElement('button');
  btn.textContent = buttonLabel;
  btn.setAttribute('aria-label', buttonLabel);
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: BUBBLE_MARGIN + 'px',
    right: BUBBLE_MARGIN + 'px',
    zIndex: '2147483646',
    padding: '14px 24px',
    borderRadius: '999px',
    background: accentColor,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '700',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  });
  btn.addEventListener('mouseenter', function () { btn.style.transform = 'scale(1.03)'; });
  btn.addEventListener('mouseleave', function () { btn.style.transform = 'scale(1)'; });

  // Overlay
  var overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483645',
    background: 'rgba(0,0,0,0.4)',
    display: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease',
  });

  // Modal container
  var modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed',
    zIndex: '2147483646',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) scale(0.96)',
    width: 'min(95vw, 576px)',
    maxHeight: '90vh',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
    background: '#fff',
    display: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
  });

  var popupIframe = document.createElement('iframe');
  popupIframe.src = iframeSrc;
  popupIframe.setAttribute('frameborder', '0');
  popupIframe.setAttribute('allowtransparency', 'true');
  popupIframe.setAttribute('title', 'Instant Quote Calculator');
  Object.assign(popupIframe.style, {
    width: '100%',
    height: '600px',
    border: 'none',
    display: 'block',
  });

  // Auto-resize.
  // Audit 2026-05-24 P0 #3 — verify source is the iframe we mounted, not
  // an arbitrary window on the host page spoofing the message shape.
  window.addEventListener('message', function (e) {
    if (e.source !== popupIframe.contentWindow) return;
    if (e.data && e.data.type === 'quotequick-resize' && e.data.slug === slug) {
      popupIframe.style.height = Math.min(e.data.height, window.innerHeight * 0.85) + 'px';
    }
  });

  modal.appendChild(popupIframe);

  function openModal() {
    isOpen = true;
    overlay.style.display = 'block';
    modal.style.display = 'block';
    btn.style.display = 'none';
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
      modal.style.opacity = '1';
      modal.style.transform = 'translate(-50%, -50%) scale(1)';
    });
  }

  function closeModal() {
    isOpen = false;
    overlay.style.opacity = '0';
    modal.style.opacity = '0';
    modal.style.transform = 'translate(-50%, -50%) scale(0.96)';
    setTimeout(function () {
      overlay.style.display = 'none';
      modal.style.display = 'none';
      btn.style.display = 'block';
    }, 200);
  }

  btn.addEventListener('click', openModal);
  overlay.addEventListener('click', closeModal);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeModal();
  });

  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  document.body.appendChild(btn);
})();
