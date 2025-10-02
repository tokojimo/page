import { createCameraListItem } from './ui/cameraListItem.js';
import { populateForm, updateControlDisplay } from './ui/formBinding.js';

export function setupUI({ store, tooltip }) {
  const cameraList = document.querySelector('.camera-list');
  const addButton = document.querySelector('.panel-header button');
  const form = document.querySelector('.properties-form');
  const undoButton = document.querySelector('.action-bar .left-group button:nth-child(1)');
  const redoButton = document.querySelector('.action-bar .left-group button:nth-child(2)');

  addButton.addEventListener('click', () => {
    store.addCamera();
  });

  undoButton.addEventListener('click', () => store.undo());
  redoButton.addEventListener('click', () => store.redo());

  form.addEventListener('input', (event) => {
    const field = event.target;
    if (!field.name) return;
    updateControlDisplay(form, field);
    const cameraId = store.getState().selectedCameraId;
    if (!cameraId) return;

    if (field.type === 'radio' && !field.checked) {
      return;
    }

    const value = parseField(field);
    store.updateCamera(cameraId, { [field.name]: value });
  });

  const handleState = (state) => {
    renderCameraList(cameraList, state, store);
    populateForm(form, state);
    undoButton.disabled = !store.canUndo();
    redoButton.disabled = !store.canRedo();
  };

  store.subscribe(handleState);
  handleState(store.getState());
}

function parseField(field) {
  if (field.type === 'checkbox') {
    return field.checked;
  }
  if (field.type === 'number' || field.type === 'range') {
    return field.valueAsNumber;
  }
  return field.value;
}

function renderCameraList(container, state, store) {
  container.innerHTML = '';
  for (const camera of state.cameras) {
    const item = createCameraListItem(camera, state.selectedCameraId === camera.id);
    item.addEventListener('click', () => store.selectCamera(camera.id));
    container.appendChild(item);
  }
}
