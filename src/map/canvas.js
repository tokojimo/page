import { throttle } from '../utils/throttle.js';

export function setupMapCanvas({ store, tooltip }) {
  const canvas = document.getElementById('map-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }

  const throttledResize = throttle(resize, 100);
  window.addEventListener('resize', throttledResize, { passive: true });

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldPosition = { lat: 48.8566 + y * 0.00001, lon: 2.3522 + x * 0.00001 };
    const camera = store.addCamera({ ...worldPosition });
    tooltip.show('Caméra ajoutée', { x: event.clientX, y: event.clientY });
    setTimeout(() => tooltip.hide(), 1200);
    store.selectCamera(camera.id);
  });

  store.subscribe(render);
  resize();

  return { destroy() {
    window.removeEventListener('resize', throttledResize);
  } };

  function render() {
    const { cameras } = store.getState();
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    drawGrid(ctx, rect);

    cameras.forEach((camera) => drawCamera(ctx, camera));
  }
}

function drawGrid(ctx, rect) {
  const spacing = 40;
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.05)';
  ctx.lineWidth = 1;
  for (let x = spacing / 2; x < rect.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }
  for (let y = spacing / 2; y < rect.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCamera(ctx, camera) {
  const x = (camera.lon - 2.3522) * 100000;
  const y = (camera.lat - 48.8566) * 100000;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#0a84ff';
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(10, 132, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos((camera.azimuth * Math.PI) / 180) * 24, Math.sin((camera.azimuth * Math.PI) / 180) * 24);
  ctx.stroke();

  ctx.restore();
}
