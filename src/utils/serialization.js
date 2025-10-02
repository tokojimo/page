export function serializeState(raw) {
  return btoa(encodeURIComponent(raw));
}

export function deserializeState(encoded) {
  try {
    return decodeURIComponent(atob(encoded));
  } catch (error) {
    console.error('Impossible de décoder l\'état', error);
    return '{}';
  }
}
