import { deserializeState, serializeState } from '../utils/serialization.js';

export function setupUndoRedo({ store }) {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const encodedState = params.get('s');
  if (encodedState) {
    store.hydrate(deserializeState(encodedState));
  }

  store.subscribe(() => {
    const serialized = serializeState(store.serialize());
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    params.set('s', serialized);
    const nextHash = `#${params.toString()}`;
    history.replaceState(null, '', `${window.location.pathname}${nextHash}`);
  });
}
