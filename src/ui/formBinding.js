export function populateForm(form, state) {
  const camera = state.cameras.find((cam) => cam.id === state.selectedCameraId);
  const controls = form.querySelectorAll('[name]');

  for (const control of controls) {
    if (!camera) {
      control.disabled = true;
      if (control.type === 'checkbox' || control.type === 'radio') {
        control.checked = false;
      } else if (control.type === 'range') {
        control.value = control.defaultValue ?? control.min ?? 0;
      } else {
        control.value = '';
      }
      continue;
    }

    control.disabled = false;
    const value = camera[control.name];

    if (control.type === 'checkbox') {
      control.checked = Boolean(value);
    } else if (control.type === 'radio') {
      control.checked = camera[control.name] === control.value;
    } else if (value !== undefined && value !== null) {
      control.value = value;
    } else {
      control.value = '';
    }
  }

  updateOutputs(form, camera);
}

export function updateControlDisplay(form, field) {
  if (!field?.name) return;
  if (field.type === 'radio' && !field.checked) return;
  const output = form.querySelector(`output[data-display-for='${field.name}']`);
  if (!output) return;

  let value;
  if (field.type === 'checkbox') {
    value = field.checked;
  } else if (field.type === 'number' || field.type === 'range') {
    value = field.valueAsNumber;
  } else {
    value = field.value;
  }

  output.textContent = formatDisplay(field.name, value);
}

function updateOutputs(form, camera) {
  const outputs = form.querySelectorAll('output[data-display-for]');
  for (const output of outputs) {
    const fieldName = output.dataset.displayFor;
    const value = camera ? camera[fieldName] : null;
    output.textContent = formatDisplay(fieldName, value);
  }
}

function formatDisplay(name, value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  if (name === 'range') {
    return `${Math.round(value)} m`;
  }

  if (name === 'azimuth' || name === 'fov') {
    return `${Math.round(value)}°`;
  }

  return `${value}`;
}
