import { nanoid } from './utils/nanoid.js';

const DEFAULT_CAMERA = {
  lat: 48.8566,
  lon: 2.3522,
  z: 6,
  azimuth: 45,
  tilt: -10,
  fov: 90,
  range: 60,
  type: 'cone',
  stickToBuilding: false,
  showZone: true,
  deadZones: false,
};

export function createStateStore() {
  let state = {
    cameras: [],
    selectedCameraId: null,
    obstacles: [],
    heatmap: null,
    history: {
      past: [],
      future: [],
      limit: 100,
    },
  };

  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function pushHistory(nextState) {
    state.history.past.push(structuredClone({ ...state, history: undefined }));
    if (state.history.past.length > state.history.limit) {
      state.history.past.shift();
    }
    state.history.future = [];
    state = { ...state, ...nextState };
    notify();
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addCamera(partial = {}) {
      const camera = { id: nanoid(), ...DEFAULT_CAMERA, ...partial };
      pushHistory({
        cameras: [...state.cameras, camera],
        selectedCameraId: camera.id,
      });
      return camera;
    },
    updateCamera(id, patch) {
      const cameras = state.cameras.map((camera) =>
        camera.id === id ? { ...camera, ...patch } : camera
      );
      pushHistory({ cameras });
    },
    removeCamera(id) {
      const cameras = state.cameras.filter((camera) => camera.id !== id);
      const selectedCameraId =
        state.selectedCameraId === id ? cameras.at(-1)?.id ?? null : state.selectedCameraId;
      pushHistory({ cameras, selectedCameraId });
    },
    selectCamera(id) {
      state = { ...state, selectedCameraId: id };
      notify();
    },
    setObstacles(obstacles) {
      state = { ...state, obstacles };
      notify();
    },
    setHeatmap(heatmap) {
      state = { ...state, heatmap };
      notify();
    },
    canUndo() {
      return state.history.past.length > 0;
    },
    canRedo() {
      return state.history.future.length > 0;
    },
    undo() {
      if (!this.canUndo()) return;
      const previous = state.history.past.pop();
      state.history.future.unshift(structuredClone({ ...state, history: undefined }));
      state = { ...state, ...previous };
      notify();
    },
    redo() {
      if (!this.canRedo()) return;
      const next = state.history.future.shift();
      state.history.past.push(structuredClone({ ...state, history: undefined }));
      state = { ...state, ...next };
      notify();
    },
    serialize() {
      const { history, ...rest } = state;
      return JSON.stringify(rest);
    },
    hydrate(serialized) {
      try {
        const parsed = JSON.parse(serialized);
        state = {
          ...state,
          ...parsed,
          history: { past: [], future: [], limit: state.history.limit },
        };
        notify();
      } catch (error) {
        console.error('Hydratation impossible', error);
      }
    },
  };
}
