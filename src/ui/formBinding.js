export function populateForm(form, state) {
  const camera = state.cameras.find((cam) => cam.id === state.selectedCameraId);
  const controls = form.querySelectorAll('[name]');

  for (const control of controls) {
    if (!camera) {
      control.value = '';
      if (control.type === 'checkbox') control.checked = false;
      control.disabled = true;
      continue;
    }

    control.disabled = false;
    const value = camera[control.name];
    if (control.type === 'checkbox') {
      control.checked = Boolean(value);
    } else {
      control.value = value ?? '';
    }
  }
}
