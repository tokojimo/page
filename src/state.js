import { nanoid } from './utils/nanoid.js';
import { DEFAULT_CAMERA_TYPE, getCameraTypeConfig } from './utils/cameraTypes.js';

const DEFAULT_CAMERA = {
  lat: 45.1885,
  lon: 5.7245,
  azimuth: 45,
  type: DEFAULT_CAMERA_TYPE.id,
  fov: DEFAULT_CAMERA_TYPE.fov,
  range: DEFAULT_CAMERA_TYPE.range,
  infrared: false,
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
      const cameras = state.cameras.map((camera) => {
        if (camera.id !== id) {
          return camera;
        }

        if (patch.type) {
          const config = getCameraTypeConfig(patch.type);
          patch = {
            ...patch,
            fov: config.fov,
            range: config.range,
          };
        }

        return { ...camera, ...patch };
      });
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
