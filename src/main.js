import { createStateStore } from './state.js';
import { setupUI } from './ui.js';
import { setupMapCanvas } from './map/canvas.js';
import { registerKeyboardShortcuts } from './services/keyboard.js';
import { setupTooltip } from './services/tooltip.js';
import { setupUndoRedo } from './services/undoRedo.js';

const store = createStateStore();

const tooltip = setupTooltip(document.querySelector('.tooltip'));

setupUI({ store, tooltip });
setupMapCanvas({ store, tooltip });
registerKeyboardShortcuts({ store });
setupUndoRedo({ store });

window.__atlasStore = store;
