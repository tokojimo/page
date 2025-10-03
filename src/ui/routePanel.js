const POINT_LABELS = {
  start: 'Point A',
  end: 'Point B',
};

export function setupRoutePanel({ store }) {
  const panel = document.querySelector('.route-panel');
  if (!panel) return;

  const status = panel.querySelector('[data-role="route-status"]');
  const summary = panel.querySelector('[data-role="route-summary"]');
  const clearButton = panel.querySelector('[data-action="clear-route"]');
  const pointButtons = Array.from(panel.querySelectorAll('[data-route-point]'));

  for (const button of pointButtons) {
    button.addEventListener('click', () => {
      const point = button.dataset.routePoint;
      const { route } = store.getState();
      const nextSelection = route.selection === point ? null : point;
      store.setRouteSelection(nextSelection);
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      store.clearRoute();
    });
  }

  const render = (state) => {
    const { route } = state;
    updateButtons(route);
    updateStatus(route);
    updateSummary(route);
  };

  store.subscribe(render);
  render(store.getState());

  function updateButtons(route) {
    for (const button of pointButtons) {
      const point = button.dataset.routePoint;
      const isActive = route.selection === point;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);

      const meta = panel.querySelector(`[data-role="point-${point}-meta"]`);
      const coords = route[point];
      button.classList.toggle('is-defined', Boolean(coords));
      if (meta) {
        meta.textContent = coords ? formatCoordinates(coords) : 'Cliquez sur la carte';
      }
    }

    if (clearButton) {
      const isDisabled = !route.start && !route.end;
      clearButton.disabled = isDisabled;
      clearButton.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    }
  }

  function updateStatus(route) {
    if (!status) return;

    if (route.selection) {
      status.textContent = `Cliquez sur la carte pour placer ${POINT_LABELS[route.selection]}.`;
      return;
    }
    if (route.isLoading) {
      status.textContent = 'Calcul de l’itinéraire en cours…';
      return;
    }
    if (route.error) {
      status.textContent = route.error;
      return;
    }
    if (route.path && route.path.length > 1) {
      status.textContent = 'Itinéraire calculé selon le trajet le plus court.';
      return;
    }
    if (route.start && !route.end) {
      status.textContent = 'Sélectionnez Point B pour définir l’arrivée.';
      return;
    }
    if (!route.start && route.end) {
      status.textContent = 'Sélectionnez Point A pour définir le départ.';
      return;
    }
    if (route.start && route.end) {
      status.textContent = 'Points définis. Relancez un calcul si nécessaire.';
      return;
    }

    status.textContent = 'Sélectionnez un point de départ et d’arrivée.';
  }

  function updateSummary(route) {
    if (!summary) return;

    if (route.isLoading) {
      summary.textContent = 'Recherche du meilleur chemin…';
      return;
    }

    if (route.error) {
      summary.textContent = '—';
      return;
    }

    if (route.path && route.path.length > 1) {
      const parts = [];
      if (route.distance != null) {
        parts.push(formatDistance(route.distance));
      }
      if (route.duration != null) {
        parts.push(formatDuration(route.duration));
      }
      summary.textContent = parts.length > 0 ? parts.join(' • ') : 'Itinéraire disponible';
      return;
    }

    summary.textContent = '—';
  }
}

function formatCoordinates({ lat, lon }) {
  return `${formatNumber(lat)}°, ${formatNumber(lon)}°`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return Number(value).toFixed(4);
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return 'Distance inconnue';
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return 'Durée inconnue';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return 'Moins d’une minute';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${remainingMinutes} min`;
}
