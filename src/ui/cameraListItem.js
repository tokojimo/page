import { getCameraTypeConfig } from '../utils/cameraTypes.js';

export function createCameraListItem(camera, selected) {
  const li = document.createElement('li');
  li.setAttribute('role', 'listitem');
  li.dataset.id = camera.id;
  if (selected) li.setAttribute('aria-selected', 'true');

  const config = getCameraTypeConfig(camera.type);

  const name = document.createElement('span');
  name.className = 'camera-name';
  name.textContent = camera.label ?? config.label ?? `Caméra ${camera.id.slice(-4)}`;

  const meta = document.createElement('span');
  meta.className = 'camera-meta';
  const metaParts = [];
  if (config?.meta) {
    metaParts.push(config.meta);
  }
  if (camera.infrared) {
    metaParts.push('IR actif');
  }
  meta.textContent = metaParts.length > 0 ? metaParts.join(' • ') : '—';

  li.append(name, meta);
  return li;
}
