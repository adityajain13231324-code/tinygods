// A dry, quiet UI tick. The menu does not start the town's music or ambience.
export function installMenuClicks(root) {
  let context = null;
  let lastSound = -Infinity;
  let disposed = false;
  let resuming = false;
  const muted = () => { try { return localStorage.getItem('tinygods.muted') === '1'; } catch { return false; } };
  function play() {
    if (disposed || muted() || performance.now() - lastSound < 35) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context ??= new Audio();
      if (context.state === 'suspended') {
        if (resuming) return;
        resuming = true;
        lastSound = performance.now();
        context.resume().then(() => {
          resuming = false;
          if (!disposed && !muted() && context.state === 'running') tick();
        }).catch(() => { resuming = false; });
        return;
      }
      if (context.state === 'running') tick();
    } catch { /* Audio may be unavailable or blocked. Menu controls must still work. */ }
  }
  function tick() {
    try {
      const now = context.currentTime;
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(720, now);
      tone.frequency.exponentialRampToValueAtTime(360, now + 0.045);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.025, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      tone.connect(gain).connect(context.destination);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      tone.start(now);
      tone.stop(now + 0.05);
      lastSound = performance.now();
    } catch { /* Device loss must not stop a menu action. */ }
  }
  const inMenu = target => root.isConnected && (root.contains(target) || target.closest('.menu2-overlay'));
  const click = e => {
    const control = e.target.closest?.('button, [role="button"], summary');
    if (control && inMenu(control) && !control.disabled && control.getAttribute('aria-disabled') !== 'true') play();
  };
  const change = e => {
    if (e.target.matches?.('input[type="checkbox"], select') && inMenu(e.target)) play();
  };
  document.addEventListener('click', click, true); // includes controls which stop propagation
  document.addEventListener('change', change); // read Sound after its setting has changed
  const tail = () => context && !muted() ? Math.max(0, 65 - (performance.now() - lastSound)) : 0;
  const remove = root.remove.bind(root);
  root.remove = () => {
    if (!disposed) {
      const delay = tail();
      disposed = true;
      document.removeEventListener('click', click, true);
      document.removeEventListener('change', change);
      if (context) setTimeout(() => { context.close().catch(() => {}); }, delay);
    }
    remove();
  };
  return { tail };
}
