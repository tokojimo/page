import { createCameraListItem } from './ui/cameraListItem.js';
import { populateForm, updateControlDisplay } from './ui/formBinding.js';
import { getCameraTypeConfig } from './utils/cameraTypes.js';

export function setupUI({ store, tooltip }) {
  const cameraList = document.querySelector('.camera-list');
  const addButton = document.querySelector('.panel-header button');
  const form = document.querySelector('.properties-form');
  const deleteButton = document.querySelector('[data-action="delete-camera"]');
  const typeButtons = Array.from(form.querySelectorAll('.camera-type-option'));

  addButton.addEventListener('click', () => {
    store.addCamera();
  });

  if (deleteButton) {
    deleteButton.addEventListener('click', () => {
      const cameraId = store.getState().selectedCameraId;
      if (!cameraId || deleteButton.disabled) return;
      store.removeCamera(cameraId);
    });
  }

  for (const button of typeButtons) {
    button.addEventListener('click', () => {
      const cameraId = store.getState().selectedCameraId;
      if (!cameraId || button.disabled) return;
      const type = button.dataset.cameraType;
      const config = getCameraTypeConfig(type);
      store.updateCamera(cameraId, {
        type,
        fov: config.fov,
        range: config.range,
      });
    });
  }

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
    if (deleteButton) {
      deleteButton.disabled = !state.selectedCameraId;
    }
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
