const transferHubs = new Set(['Beograd Centar', 'Beograd', 'Novi Sad', 'Stara Pazova', 'Lapovo', 'Kraljevo', 'Požega']);

const stationCoordinates = {
  'Subotica': { x: 520, y: 80 },
  'Bačka Topola': { x: 520, y: 190 },
  'Vrbas': { x: 520, y: 250 },
  'Novi Sad': { x: 520, y: 330 },
  'Inđija': { x: 520, y: 430 },
  'Stara Pazova': { x: 520, y: 520 },
  'Beograd': { x: 520, y: 650 },
  'Zemun': { x: 470, y: 650 },
  'Novi Beograd': { x: 490, y: 650 },
  'Beograd Centar': { x: 520, y: 650 },
  'Karađorđev Park': { x: 548, y: 650 },
  'Pančevački Most': { x: 575, y: 650 },
  'Rakovica': { x: 470, y: 690 },
  'Mladenovac': { x: 520, y: 780 },
  'Lapovo': { x: 520, y: 900 },
  'Jagodina': { x: 520, y: 1020 },
  'Stalać': { x: 520, y: 1150 },
  'Aleksinac': { x: 520, y: 1310 },
  'Niš': { x: 520, y: 1450 },
  'Šid': { x: 210, y: 330 },
  'Ruma': { x: 335, y: 330 },
  'Sremska Mitrovica': { x: 260, y: 330 },
  'Kikinda': { x: 690, y: 205 },
  'Zrenjanin': { x: 690, y: 270 },
  'Vršac': { x: 765, y: 350 },
  'Plandište': { x: 765, y: 430 },
  'Pančevo': { x: 780, y: 505 },
  'Obrenovac': { x: 330, y: 650 },
  'Šabac': { x: 220, y: 760 },
  'Loznica': { x: 220, y: 760 },
  'Požega': { x: 360, y: 1060 },
  'Užice': { x: 260, y: 1160 },
  'Prijepolje': { x: 260, y: 1340 },
  'Prijepolje Teretna': { x: 260, y: 1340 },
  'Kraljevo': { x: 250, y: 1145 },
  'Kosovska Mitrovica': { x: 250, y: 1288 },
  'Rudnica': { x: 250, y: 1288 },
  'Zaječar': { x: 850, y: 1070 },
  'Bor': { x: 705, y: 1070 },
  'Pirot': { x: 820, y: 1235 },
  'Smederevo': { x: 765, y: 430 },
  'Požarevac': { x: 765, y: 350 },
  'Prahovo Pristanište': { x: 850, y: 1070 },
  'Karavukovo': { x: 210, y: 330 },
  'Novi Sad Ranžirna': { x: 520, y: 330 }
};

const frame = document.querySelector('.map-frame');
const readout = document.querySelector('.zoom-readout');
const zoomControl = document.querySelector('#map-zoom');
const serviceSearch = document.querySelector('#service-search');
const serviceList = document.querySelector('.service-list');
const serviceCount = document.querySelector('.service-count');
const serviceDetail = document.querySelector('.service-detail');
const servicePath = document.querySelector('.service-path');
const serviceStopMarkers = document.querySelector('.service-stop-markers');
const serviceTrainLabel = document.querySelector('.service-train-label');
const routeElements = new Map([...document.querySelectorAll('[data-route-id]')].map((route) => [route.dataset.routeId, route]));
const svg = document.querySelector('.rail-map');
const fullViewBox = svg.getAttribute('viewBox');
let services = [];
let selectedServiceIds = new Set();

const setZoomDetail = (value) => {
  const zoom = Number(value);
  frame.dataset.zoom = zoom >= 160 ? '160' : zoom >= 120 ? '120' : '100';
  readout.value = zoom >= 160 ? '160% · all stations' : zoom >= 120 ? '120% · secondary stations' : '100% · core labels';
};

export const getServiceStops = (service) => service.stops.map((stop) => ({
  ...stop,
  coordinates: stationCoordinates[stop.station] || null
}));

// Use service path points instead of SVG route lengths so partial services do not
// accidentally highlight an entire shared corridor.
export const getServicePath = (service) => (service.path_points || service.stops.map((stop) => stop.station))
  .map((station) => ({ station, coordinates: stationCoordinates[station] || null }))
  .filter((point) => point.coordinates);

const getPathD = (service) => getServicePath(service)
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.coordinates.x} ${point.coordinates.y}`)
  .join(' ');

const getSegmentPathD = (service, from, to) => {
  const path = getServicePath(service);
  const start = path.findIndex((point) => point.station === from);
  const end = path.findIndex((point) => point.station === to);
  if (start === -1 || end === -1) return getPathD(service);
  const segment = start <= end ? path.slice(start, end + 1) : path.slice(end, start + 1).reverse();
  return segment
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.coordinates.x} ${point.coordinates.y}`)
    .join(' ');
};

export const getServiceProgressPoint = (service, progress) => {
  const points = getServicePath(service).map((point) => point.coordinates);
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const segments = points.slice(1).map((point, index) => {
    const previous = points[index];
    return { previous, point, length: Math.hypot(point.x - previous.x, point.y - previous.y) };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let target = Math.max(0, Math.min(1, progress)) * totalLength;
  for (const segment of segments) {
    if (target <= segment.length) {
      const ratio = segment.length ? target / segment.length : 0;
      return {
        x: segment.previous.x + ((segment.point.x - segment.previous.x) * ratio),
        y: segment.previous.y + ((segment.point.y - segment.previous.y) * ratio)
      };
    }
    target -= segment.length;
  }
  return points.at(-1);
};

const zoomToPoints = (points) => {
  if (!points.length) return;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const padding = 150;
  const minX = Math.max(0, Math.min(...xs) - padding);
  const minY = Math.max(0, Math.min(...ys) - padding);
  const maxX = Math.min(1200, Math.max(...xs) + padding);
  const maxY = Math.min(1680, Math.max(...ys) + padding);
  svg.setAttribute('viewBox', `${minX} ${minY} ${Math.max(360, maxX - minX)} ${Math.max(320, maxY - minY)}`);
};

const zoomToService = (service) => zoomToPoints(getServicePath(service).map((point) => point.coordinates));


const aliasPhrases = [
  ['novi belgrade', 'novi beograd'],
  ['new belgrade', 'novi beograd'],
  ['belgrade', 'beograd'],
  ['belgrad', 'beograd'],
  ['nish', 'nis'],
  ['pozega', 'pozega'],
  ['uzice', 'uzice'],
  ['zajecar', 'zajecar'],
  ['subotica', 'subotica']
];

export const normalizeSearch = (text) => {
  let normalized = String(text ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const [alias, canonical] of aliasPhrases) {
    normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
  }
  return normalized.replace(/\bbg\b/g, 'beograd').replace(/\s+/g, ' ');
};

const typeLabel = (type) => type.replace(/\b\w/g, (letter) => letter.toUpperCase());
const stopNames = (service) => service.stops.map((stop) => stop.station);
const uniqueStations = () => [...new Set(services.flatMap((service) => stopNames(service)))].sort((a, b) => a.localeCompare(b));

const serviceMatches = (service, query) => {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeSearch([service.train_number, service.origin, service.destination, service.name, ...stopNames(service)].join(' '));
  return haystack.includes(normalizedQuery);
};

const renderDetail = (service) => {
  const hubs = stopNames(service).filter((station) => transferHubs.has(station));
  serviceDetail.innerHTML = `
    <h3>${service.train_number}</h3>
    <p class="detail-route">${service.origin} → ${service.destination}</p>
    <p><span class="badge">${typeLabel(service.service_type)}</span> ${service.operator}</p>
    <p><strong>Transfers on route:</strong> ${hubs.length ? hubs.join(', ') : 'None shown on schematic'}</p>
    <ol class="stop-list">
      ${service.stops.map((stop) => `<li>${stop.station}<span>${stop.time ?? 'time unknown'}</span></li>`).join('')}
    </ol>
    <p class="service-note">Static scheduled service layer. Real-time animation is not enabled.</p>
  `;
};

const renderServices = () => {
  const query = serviceSearch.value.trim();
  const visible = services.filter((service) => serviceMatches(service, query));
  serviceCount.textContent = visible.length === 1 ? '1 matching service' : `${visible.length} matching services`;
  serviceList.innerHTML = visible.map((service) => `
    <li>
      <button class="service-card${selectedServiceIds.has(service.service_id) ? ' selected' : ''}" type="button" data-service-id="${service.service_id}">
        <span class="service-name">${service.origin} → ${service.destination}</span>
        <span class="service-number">${service.train_number}</span>
        <span class="service-meta"><span class="badge">${typeLabel(service.service_type)}</span>${service.stops.length} stops</span>
      </button>
    </li>
  `).join('');
  if (visible.length === 1 && !selectedServiceIds.size) renderDetail(visible[0]);
  if (!visible.length) {
    serviceList.innerHTML = '<li class="no-results">No services found. Try Beograd, Novi Sad, Niš, Subotica, Re2101.</li>';
    serviceDetail.innerHTML = '<p>No services found. Try Beograd, Novi Sad, Niš, Subotica, Re2101.</p>';
  }
};

const drawServices = (legs, { zoom = true, stationPath = null } = {}) => {
  selectedServiceIds = new Set(legs.map((leg) => leg.service.service_id));
  document.body.classList.toggle('service-selected', selectedServiceIds.size > 0);
  routeElements.forEach((route) => route.classList.toggle('selected-route', legs.some((leg) => leg.service.route_ids.includes(route.dataset.routeId))));
  servicePath.setAttribute('d', legs.map((leg) => getSegmentPathD(leg.service, leg.from, leg.to)).join(' '));
  serviceTrainLabel.textContent = legs.map((leg) => leg.service.train_number).join(' + ');
  const labelPoint = getServiceProgressPoint(legs[0].service, 0.55);
  if (labelPoint) {
    serviceTrainLabel.setAttribute('x', labelPoint.x + 18);
    serviceTrainLabel.setAttribute('y', labelPoint.y - 18);
  }
  const terminalNames = [legs[0].from, legs.at(-1).to];
  const transferNames = legs.slice(0, -1).map((leg) => leg.to);
  const markerNames = [...new Set([...(stationPath || []), ...terminalNames, ...transferNames, ...legs.flatMap((leg) => [leg.from, leg.to])])];
  serviceStopMarkers.innerHTML = markerNames
    .filter((station) => stationCoordinates[station])
    .map((station) => {
      const point = stationCoordinates[station];
      const isTerminal = terminalNames.includes(station);
      const isTransfer = transferNames.includes(station) || transferHubs.has(station);
      const label = station === terminalNames[0] ? `Start: ${station}` : station === terminalNames[1] ? `Destination: ${station}` : transferNames.includes(station) ? `Transfer: ${station}` : '';
      return `<g><circle class="service-stop${isTransfer ? ' transfer-stop' : ''}" cx="${point.x}" cy="${point.y}" r="${isTransfer ? 16 : 10}"><title>${station}</title></circle>${label ? `<text class="terminal-label" x="${point.x + 16}" y="${point.y - 16}">${label}</text>` : ''}</g>`;
    })
    .join('');
  if (zoom) zoomToPoints(markerNames.map((station) => stationCoordinates[station]).filter(Boolean));
  renderServices();
};

const drawSelectedService = (service) => {
  drawServices([{ service, from: service.stops[0].station, to: service.stops.at(-1).station }]);
  renderDetail(service);
};

const resetSelection = () => {
  serviceSearch.value = '';
  selectedServiceIds = new Set();
  document.body.classList.remove('service-selected');
  routeElements.forEach((route) => route.classList.remove('selected-route'));
  servicePath.removeAttribute('d');
  serviceStopMarkers.innerHTML = '';
  serviceTrainLabel.textContent = '';
  svg.setAttribute('viewBox', fullViewBox);
  serviceDetail.innerHTML = '<p>Select a train to highlight its scheduled route, stops, and transfer hubs.</p>';
  renderServices();
};

const buildServiceGraph = () => {
  const graph = new Map();
  const addEdge = (from, to, service) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ to, service });
  };
  for (const service of services) {
    const names = stopNames(service);
    for (let index = 0; index < names.length - 1; index += 1) {
      addEdge(names[index], names[index + 1], service);
      addEdge(names[index + 1], names[index], service);
    }
  }
  return graph;
};

const groupEdgesIntoSegments = (edges) => {
  if (!edges.length) return [];
  const segments = [];
  for (const edge of edges) {
    const previous = segments.at(-1);
    if (previous && previous.service.service_id === edge.service.service_id && previous.to === edge.from) {
      previous.to = edge.to;
      previous.stations.push(edge.to);
    } else {
      segments.push({ service: edge.service, from: edge.from, to: edge.to, stations: [edge.from, edge.to] });
    }
  }
  return segments;
};

const stationPathFromEdges = (edges) => edges.reduce((stations, edge, index) => {
  if (index === 0) stations.push(edge.from);
  stations.push(edge.to);
  return stations;
}, []);

const findJourneyOptions = (from, to, limit = 3) => {
  const graph = buildServiceGraph();
  const queue = [{ station: from, serviceId: null, transfers: 0, stopCount: 0, edges: [], visited: new Set([from]) }];
  const results = [];
  while (queue.length && results.length < limit) {
    queue.sort((a, b) => (a.transfers - b.transfers) || (a.stopCount - b.stopCount));
    const state = queue.shift();
    if (state.station === to && state.edges.length) {
      const segments = groupEdgesIntoSegments(state.edges);
      results.push({ ...state, segments, stations: stationPathFromEdges(state.edges) });
      continue;
    }
    for (const edge of graph.get(state.station) || []) {
      if (state.visited.has(edge.to)) continue;
      const nextTransfers = state.serviceId && state.serviceId !== edge.service.service_id ? state.transfers + 1 : state.transfers;
      const nextVisited = new Set(state.visited);
      nextVisited.add(edge.to);
      queue.push({
        station: edge.to,
        serviceId: edge.service.service_id,
        transfers: nextTransfers,
        stopCount: state.stopCount + 1,
        edges: [...state.edges, { from: state.station, to: edge.to, service: edge.service }],
        visited: nextVisited
      });
    }
  }
  return results.sort((a, b) => (a.transfers - b.transfers) || (a.stopCount - b.stopCount)).slice(0, limit);
};

let currentJourneyOptions = [];

const renderJourneyOption = (option, index) => `
  <button class="journey-card${index === 0 ? ' selected' : ''}" type="button" data-option-index="${index}">
    <h3>Option ${String.fromCharCode(65 + index)}</h3>
    <p><strong>Transfers:</strong> ${option.transfers}</p>
    <p><strong>Estimated segments:</strong> ${option.segments.length}</p>
    <ol class="stop-list">
      ${option.segments.map((segment, segmentIndex) => `<li>Segment ${segmentIndex + 1}<span>Train: ${segment.service.train_number}</span><span>${segment.from} → ${segment.to}</span></li>`).join('')}
    </ol>
  </button>
`;

const renderJourneyResult = (from, to) => {
  if (from === to) {
    document.querySelector('.journey-result').innerHTML = '<p>Choose two different stations.</p>';
    return;
  }
  currentJourneyOptions = findJourneyOptions(from, to, 3);
  if (!currentJourneyOptions.length) {
    document.querySelector('.journey-result').innerHTML = '<p>No scheduled connection found in the static service layer.</p>';
    resetSelection();
    return;
  }
  drawServices(currentJourneyOptions[0].segments, { stationPath: currentJourneyOptions[0].stations });
  document.querySelector('.journey-result').innerHTML = `
    <h3>${from} → ${to}</h3>
    <p><strong>Journey found</strong></p>
    ${currentJourneyOptions.map(renderJourneyOption).join('')}
  `;
  serviceDetail.innerHTML = '<p>Journey highlighted. Select an option for alternate routes, or select an individual service card for its full stop list.</p>';
};

const populateJourneySelectors = () => {
  const stations = uniqueStations();
  const options = stations.map((station) => `<option value="${station}">${station}</option>`).join('');
  document.querySelector('#from-station').innerHTML = options;
  document.querySelector('#to-station').innerHTML = options;
  document.querySelector('#from-station').value = stations.includes('Niš') ? 'Niš' : stations[0];
  document.querySelector('#to-station').value = stations.includes('Subotica') ? 'Subotica' : stations.at(-1);
};

const loadServices = async () => {
  const response = await fetch('data/services.json');
  services = await response.json();
  populateJourneySelectors();
  renderServices();
};

setZoomDetail(zoomControl.value);
zoomControl.addEventListener('input', (event) => setZoomDetail(event.target.value));
serviceSearch.addEventListener('input', renderServices);
document.querySelector('.clear-search').addEventListener('click', () => {
  serviceSearch.value = '';
  renderServices();
  serviceSearch.focus();
});
document.querySelector('.show-all-services').addEventListener('click', resetSelection);
serviceList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-service-id]');
  if (!button) return;
  const service = services.find((item) => item.service_id === button.dataset.serviceId);
  if (service) drawSelectedService(service);
});
document.querySelectorAll('[data-mode]').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === tab));
  document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== tab.dataset.mode));
}));
document.querySelector('.find-route').addEventListener('click', () => {
  renderJourneyResult(document.querySelector('#from-station').value, document.querySelector('#to-station').value);
});
document.querySelector('.journey-result').addEventListener('click', (event) => {
  const button = event.target.closest('[data-option-index]');
  if (!button) return;
  const option = currentJourneyOptions[Number(button.dataset.optionIndex)];
  if (!option) return;
  document.querySelectorAll('[data-option-index]').forEach((item) => item.classList.toggle('selected', item === button));
  drawServices(option.segments, { stationPath: option.stations });
});

loadServices();
