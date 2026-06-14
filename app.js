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

export const getServicePath = (service) => service.route_ids
  .map((routeId) => routeElements.get(routeId))
  .filter(Boolean);

export const getServiceProgressPoint = (service, progress) => {
  const paths = getServicePath(service);
  if (!paths.length) return null;
  const totalLength = paths.reduce((sum, path) => sum + path.getTotalLength(), 0);
  const target = Math.max(0, Math.min(1, progress)) * totalLength;
  let travelled = 0;
  for (const path of paths) {
    const length = path.getTotalLength();
    if (travelled + length >= target) {
      const point = path.getPointAtLength(target - travelled);
      return { x: point.x, y: point.y };
    }
    travelled += length;
  }
  const last = paths.at(-1);
  const point = last.getPointAtLength(last.getTotalLength());
  return { x: point.x, y: point.y };
};

const typeLabel = (type) => type.replace(/\b\w/g, (letter) => letter.toUpperCase());

const renderServices = () => {
  const query = serviceSearch.value.trim().toLowerCase();
  const visible = services.filter((service) => service.train_number.toLowerCase().includes(query));
  serviceCount.textContent = `${visible.length} scheduled services`;
  serviceList.innerHTML = visible.map((service) => `
    <li>
      <button class="service-card${selectedService?.service_id === service.service_id ? ' selected' : ''}" type="button" data-service-id="${service.service_id}">
        <span class="service-number">${service.train_number}</span>
        <span class="service-name">${service.origin} → ${service.destination}</span>
        <span class="service-meta"><span class="badge">${typeLabel(service.service_type)}</span>${service.stops.length} stops</span>
      </button>
    </li>
  `).join('');
};

const drawSelectedService = (service) => {
  selectedService = service;
  document.body.classList.add('service-selected');
  routeElements.forEach((route) => route.classList.toggle('selected-route', service.route_ids.includes(route.dataset.routeId)));

  const paths = getServicePath(service);
  servicePath.setAttribute('d', paths.map((path) => path.getAttribute('d')).join(' '));
  serviceTrainLabel.textContent = service.train_number;
  const labelPoint = getServiceProgressPoint(service, 0.55);
  if (labelPoint) {
    serviceTrainLabel.setAttribute('x', labelPoint.x + 18);
    serviceTrainLabel.setAttribute('y', labelPoint.y - 18);
  }

  serviceStopMarkers.innerHTML = getServiceStops(service)
    .filter((stop) => stop.coordinates)
    .map((stop) => `<circle class="service-stop${transferHubs.has(stop.station) ? ' transfer-stop' : ''}" cx="${stop.coordinates.x}" cy="${stop.coordinates.y}" r="${transferHubs.has(stop.station) ? 15 : 10}"><title>${stop.station}</title></circle>`)
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

loadServices();
