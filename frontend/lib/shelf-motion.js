// Native scrolling preserves touch, wheel and keyboard navigation during autoplay.
export function shelfMotion(section, rail, original, loop, onLoop) {
  let distance = 0, frame, last = null, remainder = 0, wheelRemaining = 0;
  let visible = true, disposed = false;
  const listeners = [];
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  function wrap() {
    if (!loop || !distance) return;
    if (rail.scrollLeft < distance || rail.scrollLeft >= distance * 2) {
      rail.scrollLeft = distance + ((rail.scrollLeft - distance) % distance + distance) % distance;
    }
  }
  function measure() {
    const width = original.getBoundingClientRect().width;
    const style = getComputedStyle(rail);
    const next = width > rail.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    distance = width + (parseFloat(style.columnGap) || 0);
    if (next !== loop) { onLoop(next); return; }
    wrap();
  }
  function tick(now) {
    if (disposed) return;
    const elapsed = last === null ? 0 : Math.min(now - last, 64);
    last = now;
    if (loop && visible && !document.hidden) {
      const glide = Math.abs(wheelRemaining) < .01 ? wheelRemaining : wheelRemaining * (1 - Math.exp(-elapsed / 100));
      wheelRemaining -= glide;
      remainder += elapsed * 30 / 1000 + glide;
      const pixels = Math.trunc(remainder + Math.sign(remainder) * 1e-9);
      remainder -= pixels;
      if (pixels) {
        // Normalize before writing so a fast glide never hits the native scroll limit.
        rail.scrollLeft = distance + ((rail.scrollLeft + pixels - distance) % distance + distance) % distance;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  listen(rail, 'wheel', event => {
    if (!loop || !distance || event.ctrlKey) return;
    const delta = Math.abs(event.deltaX || 0) > Math.abs(event.deltaY || 0) ? event.deltaX : event.deltaY || 0;
    if (!delta) return;
    event.preventDefault();
    const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1);
    // Reverse immediately instead of fighting momentum from the previous direction.
    if (wheelRemaining * pixels < 0) wheelRemaining = 0;
    wheelRemaining += pixels;
  }, { passive:false });
  listen(rail, 'pointerdown', () => { wheelRemaining = 0; });
  listen(rail, 'scroll', wrap);
  listen(document, 'visibilitychange', () => { last = null; wheelRemaining = 0; });
  listen(window, 'resize', measure);
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  resize?.observe(rail); resize?.observe(original);
  const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; last = null;
    if (!visible) wheelRemaining = 0;
  });
  intersection?.observe(section);
  measure();
  if (loop) rail.scrollLeft = distance;
  frame = requestAnimationFrame(tick);
  return {
    dispose() { disposed = true; cancelAnimationFrame(frame); listeners.forEach(remove => remove()); resize?.disconnect(); intersection?.disconnect(); }
  };
}
