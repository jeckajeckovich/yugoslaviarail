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
let selectedService = null;

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

const zoomToService = (service) => {
  const points = getServicePath(service).map((point) => point.coordinates);
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

const typeLabel = (type) => type.replace(/\b\w/g, (letter) => letter.toUpperCase());

const renderServices = () => {
  const query = serviceSearch.value.trim().toLowerCase();
  const visible = services.filter((service) => service.train_number.toLowerCase().includes(query));
  serviceCount.textContent = `${visible.length} scheduled services`;
  serviceList.innerHTML = visible.map((service) => `
    <li>
      <button class="service-card${selectedService?.service_id === service.service_id ? ' selected' : ''}" type="button" data-service-id="${service.service_id}">
        <span class="service-name">${service.origin} → ${service.destination}</span>
        <span class="service-number">${service.train_number}</span>
        <span class="service-meta"><span class="badge">${typeLabel(service.service_type)}</span>${service.stops.length} stops</span>
      </button>
    </li>
  `).join('');
};

const drawSelectedService = (service) => {
  selectedService = service;
  document.body.classList.add('service-selected');
  routeElements.forEach((route) => route.classList.toggle('selected-route', service.route_ids.includes(route.dataset.routeId)));

  servicePath.setAttribute('d', getPathD(service));
  serviceTrainLabel.textContent = service.train_number;
  const labelPoint = getServiceProgressPoint(service, 0.55);
  if (labelPoint) {
    serviceTrainLabel.setAttribute('x', labelPoint.x + 18);
    serviceTrainLabel.setAttribute('y', labelPoint.y - 18);
  }
  zoomToService(service);

  const stops = getServiceStops(service).filter((stop) => stop.coordinates);
  serviceStopMarkers.innerHTML = stops
    .map((stop, index) => `<g><circle class="service-stop${transferHubs.has(stop.station) ? ' transfer-stop' : ''}" cx="${stop.coordinates.x}" cy="${stop.coordinates.y}" r="${transferHubs.has(stop.station) ? 15 : 10}"><title>${stop.station}</title></circle>${index === 0 || index === stops.length - 1 ? `<text class="terminal-label" x="${stop.coordinates.x + 16}" y="${stop.coordinates.y - 16}">${index === 0 ? 'Start' : 'Destination'}: ${stop.station}</text>` : ''}</g>`)
    .join('');

  const hubs = service.stops.map((stop) => stop.station).filter((station) => transferHubs.has(station));
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
  renderServices();
};

const loadServices = async () => {
  const response = await fetch('data/services.json');
  services = await response.json();
  renderServices();
};

setZoomDetail(zoomControl.value);
zoomControl.addEventListener('input', (event) => setZoomDetail(event.target.value));
serviceSearch.addEventListener('input', renderServices);
serviceList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-service-id]');
  if (!button) return;
  const service = services.find((item) => item.service_id === button.dataset.serviceId);
  if (service) drawSelectedService(service);
});

document.querySelector('.show-all-services').addEventListener('click', () => {
  selectedService = null;
  document.body.classList.remove('service-selected');
  routeElements.forEach((route) => route.classList.remove('selected-route'));
  servicePath.removeAttribute('d');
  serviceStopMarkers.innerHTML = '';
  serviceTrainLabel.textContent = '';
  svg.setAttribute('viewBox', fullViewBox);
  serviceDetail.innerHTML = '<p>Select a train to highlight its scheduled route, stops, and transfer hubs.</p>';
  renderServices();
});

loadServices();
