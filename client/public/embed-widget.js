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
 * Attributes:
 *   data-calculator-slug  (required) — your calculator slug
 *   data-mode             (optional) — "inline" (default) or "popup"
 *   data-button-label     (optional) — popup button text (default: "Get a Free Quote")
 *   data-accent-color     (optional) — popup button color (default: #394247)
 *   data-base-url         (optional) — override base URL for self-hosted installs
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

    // Auto-resize via postMessage from the embedded widget
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'quotequick-resize' && e.data.slug === slug) {
        iframe.style.height = e.data.height + 'px';
      }
    });

    container.appendChild(iframe);
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

  // Auto-resize
  window.addEventListener('message', function (e) {
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
