(function () {
  'use strict';

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var slug = script.getAttribute('data-calculator-slug');
  if (!slug) return;

  var PANEL_WIDTH = 320;
  var PANEL_HEIGHT = 480;
  var BUBBLE_SIZE = 56;
  var BUBBLE_MARGIN = 24;
  var ACCENT_COLOR = script.getAttribute('data-accent-color') || '#6366f1';

  var isOpen = false;

  var bubble = document.createElement('button');
  bubble.setAttribute('aria-label', 'Open AI assistant');
  bubble.setAttribute('data-testid', 'embed-chat-bubble');
  Object.assign(bubble.style, {
    position: 'fixed',
    bottom: BUBBLE_MARGIN + 'px',
    right: BUBBLE_MARGIN + 'px',
    zIndex: '2147483646',
    width: BUBBLE_SIZE + 'px',
    height: BUBBLE_SIZE + 'px',
    borderRadius: '50%',
    background: ACCENT_COLOR,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
  });

  bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

  var iframeContainer = document.createElement('div');
  Object.assign(iframeContainer.style, {
    position: 'fixed',
    zIndex: '2147483645',
    bottom: (BUBBLE_SIZE + BUBBLE_MARGIN + 12) + 'px',
    right: BUBBLE_MARGIN + 'px',
    width: PANEL_WIDTH + 'px',
    height: PANEL_HEIGHT + 'px',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    display: 'none',
    background: '#fff',
  });

  var iframeUrl = (script.getAttribute('data-base-url') || window.location.origin) + '/Calculator?slug=' + encodeURIComponent(slug) + '&embed=true&chat=true';

  var iframe = document.createElement('iframe');
  iframe.src = iframeUrl;
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('data-testid', 'embed-chat-iframe');
  Object.assign(iframe.style, {
    width: '100%',
    height: '100%',
    border: 'none',
  });

  iframeContainer.appendChild(iframe);

  function isMobile() {
    return window.innerWidth < 640;
  }

  function openPanel() {
    isOpen = true;
    bubble.setAttribute('aria-label', 'Close AI assistant');
    bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    if (isMobile()) {
      Object.assign(iframeContainer.style, {
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100%',
        height: '100%',
        borderRadius: '0',
      });
    } else {
      Object.assign(iframeContainer.style, {
        top: '',
        left: '',
        right: BUBBLE_MARGIN + 'px',
        bottom: (BUBBLE_SIZE + BUBBLE_MARGIN + 12) + 'px',
        width: PANEL_WIDTH + 'px',
        height: PANEL_HEIGHT + 'px',
        borderRadius: '16px',
      });
    }
    iframeContainer.style.display = 'block';
  }

  function closePanel() {
    isOpen = false;
    bubble.setAttribute('aria-label', 'Open AI assistant');
    bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    iframeContainer.style.display = 'none';
  }

  bubble.addEventListener('click', function () {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  window.addEventListener('resize', function () {
    if (isOpen) {
      if (isMobile()) {
        Object.assign(iframeContainer.style, {
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          width: '100%',
          height: '100%',
          borderRadius: '0',
        });
      } else {
        Object.assign(iframeContainer.style, {
          top: '',
          left: '',
          right: BUBBLE_MARGIN + 'px',
          bottom: (BUBBLE_SIZE + BUBBLE_MARGIN + 12) + 'px',
          width: PANEL_WIDTH + 'px',
          height: PANEL_HEIGHT + 'px',
          borderRadius: '16px',
        });
      }
    }
  });

  document.body.appendChild(iframeContainer);
  document.body.appendChild(bubble);
})();
