// ecosystem/hold.js v1.0.0
// Press-and-hold controls (03: hold Turn or ↑ to raise, ↓ to lower; 04: hold B to
// brake). One binding joins a button and keyboard keys: the action starts on press
// and ends on release, key repeat is ignored, and the action always ends if the
// pointer is lost, the window loses focus or the button is disabled. Keys are
// ignored while typing in a text box, so ↑ and ↓ still step number fields.
const Hold = (function () {
  'use strict';
  const typing = t => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  // o: { button, keys: ['ArrowUp'] or ['b', 'B'], keyTarget (default document),
  //      onStart(source), onEnd(source), enabled() }
  // source is 'pointer', 'key' or 'button-key'. Returns { active(), end(), dispose() }.
  function bind(o) {
    let active = null;                                   // the source holding, or null
    const keys = o.keys || [];
    const target = o.keyTarget || (typeof document !== 'undefined' ? document : null);
    const enabled = () => !o.enabled || o.enabled();
    function start(src) {
      if (active || !enabled()) return;
      active = src;
      if (o.button) o.button.setAttribute('aria-pressed', 'true');
      if (o.onStart) o.onStart(src);
    }
    function end() {
      if (!active) return;
      const src = active; active = null;
      if (o.button) o.button.setAttribute('aria-pressed', 'false');
      if (o.onEnd) o.onEnd(src);
    }
    const L = [];
    const on = (el, ev, fn, opt) => { if (el) { el.addEventListener(ev, fn, opt); L.push([el, ev, fn, opt]); } };

    if (o.button) {
      o.button.setAttribute('aria-pressed', 'false');
      on(o.button, 'pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        try { o.button.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
        start('pointer');
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => on(o.button, ev, () => { if (active === 'pointer') end(); }));
      // Space or Enter on the focused button holds too.
      on(o.button, 'keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start('button-key'); } else if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
      on(o.button, 'keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && active === 'button-key') { e.preventDefault(); end(); } });
      on(o.button, 'blur', () => { if (active === 'button-key') end(); });
      on(o.button, 'click', e => e.preventDefault());
    }
    if (keys.length && target) {
      on(target, 'keydown', e => {
        if (keys.indexOf(e.key) < 0 || typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
        if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return;
        e.preventDefault();
        if (!e.repeat) start('key');
      });
      on(target, 'keyup', e => { if (keys.indexOf(e.key) >= 0 && active === 'key') end(); });
    }
    if (typeof window !== 'undefined') on(window, 'blur', end);
    return {
      active: () => active,
      end,
      dispose() { end(); L.forEach(([el, ev, fn, opt]) => el.removeEventListener(ev, fn, opt)); L.length = 0; },
    };
  }

  return { bind, typing };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Hold;
