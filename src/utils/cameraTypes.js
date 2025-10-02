export const CAMERA_TYPES = [
  {
    id: 'dome',
    label: 'Caméra dôme',
    icon: 'dome',
    meta: '100° (fixe) • 35 m',
    fov: 100,
    range: 35,
    isPanoramic: false,
  },
  {
    id: 'bullet',
    label: 'Caméra bullet',
    icon: 'bullet',
    meta: '90° • 150 m',
    fov: 90,
    range: 150,
    isPanoramic: false,
  },
  {
    id: 'ptz',
    label: 'Caméra PTZ',
    icon: 'ptz',
    meta: 'FOV 90° rotatif • 360° • 350 m',
    fov: 90,
    range: 350,
    isPanoramic: true,
  },
  {
    id: 'panoramic',
    label: 'Caméra panoramique',
    icon: 'panoramic',
    meta: 'Vue globale 360° • 350 m',
    fov: 360,
    range: 350,
    isPanoramic: true,
  },
];

export const DEFAULT_CAMERA_TYPE = CAMERA_TYPES[0];

export function getCameraTypeConfig(type) {
  return CAMERA_TYPES.find((cameraType) => cameraType.id === type) ?? DEFAULT_CAMERA_TYPE;
}
