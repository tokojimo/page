export function createCameraListItem(camera, selected) {
  const li = document.createElement('li');
  li.setAttribute('role', 'listitem');
  li.dataset.id = camera.id;
  if (selected) li.setAttribute('aria-selected', 'true');

  const name = document.createElement('span');
  name.className = 'camera-name';
  name.textContent = camera.label ?? `Caméra ${camera.id.slice(-4)}`;

  const meta = document.createElement('span');
  meta.className = 'camera-meta';
  meta.textContent = `${camera.type === 'cone' ? 'Cône' : '360°'} • ${Math.round(
    camera.range
  )} m`;

  li.append(name, meta);
  return li;
}
