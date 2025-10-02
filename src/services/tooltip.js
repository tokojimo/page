export function setupTooltip(element) {
  let hideTimeout;

  function show(message, position) {
    if (!element) return;
    element.textContent = message;
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    element.hidden = false;
    element.dataset.visible = 'true';
    clearTimeout(hideTimeout);
  }

  function hide(delay = 0) {
    if (!element) return;
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      element.dataset.visible = 'false';
      element.hidden = true;
    }, delay);
  }

  return { show, hide };
}
