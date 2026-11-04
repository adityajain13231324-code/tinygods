// Shared modal behavior, including cleanup when the online lobby replaces remove().
export function activateDialog(overlay, card) {
  const previous = document.activeElement;
  const siblings = [...document.body.children].filter(n => n !== overlay);
  const inert = siblings.map(n => [n, n.inert]);
  siblings.forEach(n => { n.inert = true; });
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1;
  const label = () => card.setAttribute('aria-label', card.querySelector('h2')?.textContent || 'Tiny Gods dialog');
  const observer = new MutationObserver(label);
  observer.observe(card, { childList: true, subtree: true });
  const focusables = () => [...card.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')].filter(n => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length && !n.closest('[hidden]'));
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); overlay.remove(); }
    if (e.key === 'Tab') {
      const items = focusables(), first = items[0] || card, last = items.at(-1) || card;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !card.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  };
  window.addEventListener('keydown', onKey, true);
  const nativeRemove = overlay.remove.bind(overlay);
  let removed = false;
  overlay.remove = () => {
    if (removed) return;
    removed = true;
    observer.disconnect();
    window.removeEventListener('keydown', onKey, true);
    inert.forEach(([n, old]) => { n.inert = old; });
    nativeRemove();
    if (previous?.isConnected) previous.focus();
  };
  queueMicrotask(() => { if (!removed) { label(); (focusables()[0] || card).focus(); } });
}
