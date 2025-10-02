export function registerKeyboardShortcuts({ store }) {
  window.addEventListener('keydown', (event) => {
    const isMeta = event.metaKey || event.ctrlKey;
    if (isMeta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        store.redo();
      } else {
        store.undo();
      }
    }
    if (event.key === 'Delete') {
      const id = store.getState().selectedCameraId;
      if (id) {
        store.removeCamera(id);
      }
    }
  });
}
