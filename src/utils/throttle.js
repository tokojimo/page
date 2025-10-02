export function throttle(callback, delay) {
  let last = 0;
  let frame;

  return (...args) => {
    const now = performance.now();
    const remaining = delay - (now - last);

    if (remaining <= 0) {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      last = now;
      callback.apply(null, args);
    } else if (!frame) {
      frame = requestAnimationFrame(() => {
        last = performance.now();
        frame = null;
        callback.apply(null, args);
      });
    }
  };
}
