const transferHubs = new Set(['Beograd Centar', 'Beograd', 'Novi Sad', 'Stara Pazova', 'Lapovo', 'Kraljevo', 'Požega', 'Sarajevo', 'Doboj', 'Tuzla']);

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
  'Tuzla': { x: 250, y: 980 },
  'Banja Luka': { x: 110, y: 990 },
  'Doboj': { x: 185, y: 1065 },
  'Maglaj': { x: 185, y: 1115 },
  'Zenica': { x: 170, y: 1160 },
  'Sarajevo': { x: 150, y: 1260 },
  'Mostar': { x: 105, y: 1360 },
  'Čapljina': { x: 95, y: 1450 },
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
const stationList = document.querySelector('.station-list');
const serviceCount = document.querySelector('.service-count');
const serviceDetail = document.querySelector('.service-detail');
const atlasDashboard = document.querySelector('.atlas-dashboard');
const exploreResult = document.querySelector('.explore-result');
const servicePath = document.querySelector('.service-path');
const serviceStopMarkers = document.querySelector('.service-stop-markers');
const serviceTrainLabel = document.querySelector('.service-train-label');
const routeElements = new Map([...document.querySelectorAll('[data-route-id]')].map((route) => [route.dataset.routeId, route]));
const svg = document.querySelector('.rail-map');
const fullViewBox = svg.getAttribute('viewBox');
let services = [];
let calendarDates = [];
let calendarDateIndex = new Map();
let selectedServiceIds = new Set();
let lastJourneySearchStats = null;
let isJourneySearchRunning = false;
let stationConnectivity = new Map();

const loadVisitedSet = (key) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch (error) {
    console.warn('Unable to load visited atlas data', { key, error });
    return new Set();
  }
};

const saveVisitedSet = (key, set) => {
  try {
    localStorage.setItem(key, JSON.stringify([...set].sort()));
  } catch (error) {
    console.warn('Unable to save visited atlas data', { key, error });
  }
};

let visitedStations = loadVisitedSet('jugorail.visitedStations');
let visitedRoutes = loadVisitedSet('jugorail.visitedRoutes');

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

const typeLabel = (type = 'scheduled') => String(type || 'scheduled').replace(/\b\w/g, (letter) => letter.toUpperCase());
const serviceType = (service) => service.service_type || service.route_short_name || service.route_long_name || service.source || 'scheduled';
const stopNames = (service) => service.stops.map((stop) => stop.station);
const uniqueStations = () => [...new Set(services.flatMap((service) => stopNames(service)))].sort((a, b) => a.localeCompare(b));
const minimumTransferMinutes = 5;
const journeySearchModes = {
  fastest: { maxTransfers: 3, maxStates: 7500, maxQueueSize: 7500, timeoutMs: 1500, maxJourneyMinutes: Infinity, yieldEvery: 2500, allowOvernight: false, allowStationRevisits: false, rankBy: 'time' },
  all: { maxTransfers: 10, maxStates: 150000, maxQueueSize: 75000, timeoutMs: 5000, maxJourneyMinutes: Infinity, yieldEvery: 2500, allowOvernight: true, allowStationRevisits: true, rankBy: 'transfers' },
  exhaustive: { maxTransfers: Infinity, maxStates: Infinity, maxQueueSize: Infinity, timeoutMs: Infinity, maxJourneyMinutes: Infinity, yieldEvery: 1000, allowOvernight: true, allowStationRevisits: true, rankBy: 'transfers' }
};
const stopDeparture = (stop) => stop.departure ?? stop.time ?? null;
const stopArrival = (stop) => stop.arrival ?? stop.time ?? null;
const formatTime = (time) => time || 'time unknown';
const minutesFromMidnight = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? (hours * 60) + minutes : null;
};
const minutesBetween = (departure, arrival, { allowOvernight = false } = {}) => {
  const departureMinutes = minutesFromMidnight(departure);
  const arrivalMinutes = minutesFromMidnight(arrival);
  if (departureMinutes === null || arrivalMinutes === null) return null;
  const duration = arrivalMinutes >= departureMinutes || !allowOvernight
    ? arrivalMinutes - departureMinutes
    : (arrivalMinutes + 1440) - departureMinutes;
  return duration >= 0 ? duration : null;
};
const durationLabel = (minutes) => Number.isFinite(minutes) ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : 'time unknown';
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const yieldToBrowser = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
});
const searchModeLabel = (mode) => ({ fastest: 'Fastest', all: 'All valid routes', exhaustive: 'Exhaustive search' })[mode] || 'Fastest';
const todayIsoDate = () => new Date().toISOString().slice(0, 10);
const gtfsDateKey = (dateValue) => dateValue.replaceAll('-', '');
const addDays = (dateValue, days) => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const displayJourneyDate = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date);
  return `${weekday}, ${dateValue}`;
};

const calendarIndexKey = (serviceId, dateKey) => `${serviceId}|${dateKey}`;
const indexCalendarDates = () => {
  calendarDateIndex = new Map();
  for (const entry of calendarDates) {
    const key = calendarIndexKey(entry.service_id, entry.date);
    if (!calendarDateIndex.has(key)) calendarDateIndex.set(key, []);
    calendarDateIndex.get(key).push(entry);
  }
};

const serviceOperatesOnDate = (service, dateValue) => {
  if (!calendarDates.length) return true;
  const entries = calendarDateIndex.get(calendarIndexKey(service.service_calendar_id, gtfsDateKey(dateValue))) || [];
  const isCancelled = entries.some((entry) => String(entry.exception_type) === '2');
  const isAdded = entries.some((entry) => String(entry.exception_type) === '1');
  return isAdded && !isCancelled;
};

const calendarInfoForDate = (dateValue) => {
  if (!calendarDates.length) {
    return {
      activeServiceIds: null,
      activeServicesOnDate: services.length,
      filteredServices: 0,
      calendarMatches: 0
    };
  }
  const dateKey = gtfsDateKey(dateValue);
  const matches = calendarDates.filter((entry) => entry.date === dateKey);
  const added = new Set(matches.filter((entry) => String(entry.exception_type) === '1').map((entry) => entry.service_id));
  const cancelled = new Set(matches.filter((entry) => String(entry.exception_type) === '2').map((entry) => entry.service_id));
  const activeServiceIds = new Set([...added].filter((serviceId) => !cancelled.has(serviceId)));
  const activeServicesOnDate = services.filter((service) => activeServiceIds.has(service.service_calendar_id)).length;
  return {
    activeServiceIds,
    activeServicesOnDate,
    filteredServices: Math.max(0, services.length - activeServicesOnDate),
    calendarMatches: matches.length
  };
};


const nearestAvailableDates = (dateValue, limit = 2) => {
  if (!calendarDates.length) return [];
  const requested = gtfsDateKey(dateValue);
  return [...new Set(calendarDates
    .filter((entry) => String(entry.exception_type) === '1' && entry.date >= requested)
    .map((entry) => `${entry.date.slice(0, 4)}-${entry.date.slice(4, 6)}-${entry.date.slice(6, 8)}`))]
    .sort()
    .slice(0, limit);
};

const routeDateSummary = (calendarInfo, dateValue) => `
  <div class="date-summary">
    <p><strong>Selected date:</strong> ${displayJourneyDate(dateValue)}</p>
    <p><strong>Active services:</strong> ${calendarInfo.activeServicesOnDate}</p>
    <p><strong>Filtered services:</strong> ${calendarInfo.filteredServices}</p>
    <p><strong>Calendar filtering:</strong> ${calendarDates.length ? 'active' : 'not available'}</p>
  </div>
`;

const searchStatsSummary = () => lastJourneySearchStats ? `
  <details class="advanced-details">
    <summary>Advanced details</summary>
    <div class="search-stats">
      <p><strong>States explored:</strong> ${lastJourneySearchStats.statesExplored}</p>
      <p><strong>Queue size:</strong> ${lastJourneySearchStats.queueSize}</p>
      <p><strong>Graph nodes:</strong> ${lastJourneySearchStats.graphNodes}</p>
      <p><strong>Truncation reason:</strong> ${lastJourneySearchStats.truncationReason || 'none'}</p>
      <p><strong>Timeout reached:</strong> ${lastJourneySearchStats.timedOut ? 'yes' : 'no'}</p>
    </div>
  </details>
` : '';

const serviceMatches = (service, query) => {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeSearch([service.train_number, service.origin, service.destination, service.name, ...stopNames(service)].join(' '));
  return haystack.includes(normalizedQuery);
};


const listItems = (items, emptyLabel = 'None shown') => items.length
  ? `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
  : `<p>${emptyLabel}</p>`;

const stationCountries = new Map([
  ['Sarajevo', 'Bosnia and Herzegovina'],
  ['Mostar', 'Bosnia and Herzegovina'],
  ['Čapljina', 'Bosnia and Herzegovina'],
  ['Zenica', 'Bosnia and Herzegovina'],
  ['Doboj', 'Bosnia and Herzegovina'],
  ['Banja Luka', 'Bosnia and Herzegovina'],
  ['Tuzla', 'Bosnia and Herzegovina'],
  ['Maglaj', 'Bosnia and Herzegovina']
]);

const stationCountry = (station) => stationCountries.get(station) || 'Serbia';

const stationRole = (station, stationServices) => {
  if (transferHubs.has(station)) return 'Major railway hub';
  if (stationServices.length >= 12) return 'Key interchange station';
  if (stationServices.length >= 4) return 'Regional rail station';
  return 'Passenger railway station';
};

const stationServices = (station) => services.filter((service) => stopNames(service).includes(station));

const buildStationConnectivity = () => {
  stationConnectivity = new Map();
  for (const service of services) {
    const stops = stopNames(service);
    for (const station of stops) {
      if (!stationConnectivity.has(station)) stationConnectivity.set(station, new Set());
      for (const destination of stops) {
        if (destination !== station) stationConnectivity.get(station).add(destination);
      }
    }
  }
};

const stationDirectDestinations = (station) => [...(stationConnectivity.get(station) || new Set())]
  .sort((a, b) => a.localeCompare(b));

const routeIdentifiers = (service) => (service.route_ids || [service.route_id]).filter(Boolean);

const renderAtlasDashboard = () => {
  if (!atlasDashboard) return;
  const stations = uniqueStations();
  const countries = new Map();
  for (const station of stations) {
    const country = stationCountry(station);
    countries.set(country, (countries.get(country) || 0) + 1);
  }
  const routeCount = new Set(services.flatMap(routeIdentifiers)).size;
  const hubCount = stations.filter((station) => transferHubs.has(station)).length;
  const countryCards = [...countries.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([country, count]) => `<div><strong>${count}</strong><span>${country}</span></div>`)
    .join('');
  atlasDashboard.innerHTML = `
    <section class="atlas-dashboard-card">
      <div class="atlas-dashboard-header">
        <span>Explorer mode</span>
        <strong>${stations.length} stations · ${routeCount} corridors</strong>
      </div>
      <div class="atlas-mission-grid">
        <div><strong>Station explorer</strong><span>Profiles, direct destinations and hubs</span></div>
        <div><strong>Route explorer</strong><span>Corridors, services and map highlights</span></div>
        <div><strong>Connectivity explorer</strong><span>Direct, 1-transfer and 2-transfer reach</span></div>
        <div><strong>Travel time atlas</strong><span>2h, 4h, 8h and 12h maps</span></div>
      </div>
      <div class="country-stat-grid">${countryCards}</div>
      <div class="visited-stat-grid">
        <div><strong>${visitedStations.size}</strong><span>visited stations</span></div>
        <div><strong>${visitedRoutes.size}</strong><span>visited routes</span></div>
        <div><strong>${hubCount}</strong><span>transfer hubs</span></div>
      </div>
      <button class="clear-visited" type="button">Reset visited tracking</button>
    </section>
  `;
};

const recordStationVisit = (station) => {
  if (!station) return;
  visitedStations.add(station);
  saveVisitedSet('jugorail.visitedStations', visitedStations);
  renderAtlasDashboard();
};

const recordRouteVisit = (service) => {
  routeIdentifiers(service).forEach((routeId) => visitedRoutes.add(routeId));
  saveVisitedSet('jugorail.visitedRoutes', visitedRoutes);
  renderAtlasDashboard();
};

const renderStationProfile = (station) => {
  recordStationVisit(station);
  const stationServiceList = stationServices(station);
  const directDestinations = stationDirectDestinations(station);
  const transferRoutes = stationServiceList
    .filter((service) => transferHubs.has(station) || stopNames(service).some((stop) => transferHubs.has(stop) && stop !== station))
    .map((service) => `${service.train_number} · ${service.origin} → ${service.destination}`)
    .slice(0, 12);
  const corridors = [...new Set(stationServiceList.flatMap((service) => service.route_ids || [service.route_id]).filter(Boolean))].sort();
  serviceDetail.innerHTML = `
    <article class="station-profile-card">
      <div class="station-photo-placeholder" aria-label="Station photo placeholder"><span>Station photo</span></div>
      <h3>${station}</h3>
      <dl class="station-profile-meta">
        <div><dt>Country</dt><dd>${stationCountry(station)}</dd></div>
        <div><dt>Role</dt><dd>${stationRole(station, stationServiceList)}</dd></div>
      </dl>
      <section><h4>Services</h4>${listItems(stationServiceList.map((service) => `${service.train_number} · ${service.origin} → ${service.destination}`).slice(0, 16), 'No services in the loaded dataset.')}</section>
      <section><h4>Direct destinations</h4><p class="connectivity-count">${directDestinations.length} reachable without transfer</p>${listItems(directDestinations, 'No direct destinations in the loaded dataset.')}</section>
      <section><h4>Transfer routes</h4>${listItems(transferRoutes, 'No transfer routes identified in the loaded dataset.')}</section>
      <section><h4>Connected corridors</h4>${listItems(corridors, 'No corridors mapped for this station.')}</section>
    </article>
  `;
};

const renderDetail = (service) => {
  const hubs = stopNames(service).filter((station) => transferHubs.has(station));
  serviceDetail.innerHTML = `
    <h3>${service.train_number}</h3>
    <p class="detail-route">${service.origin} → ${service.destination}</p>
    <p><span class="badge">${typeLabel(serviceType(service))}</span> ${service.operator}</p>
    <p><strong>Transfers on route:</strong> ${hubs.length ? hubs.join(', ') : 'None shown on schematic'}</p>
    <ol class="stop-list">
      ${service.stops.map((stop) => `<li>${stop.station}<span>arr ${formatTime(stopArrival(stop))} · dep ${formatTime(stopDeparture(stop))}</span></li>`).join('')}
    </ol>
    <p class="service-note">Static scheduled service layer. Real-time animation is not enabled.</p>
  `;
};


const renderStationCards = (visibleServices, query) => {
  const normalizedQuery = normalizeSearch(query);
  const stationCounts = new Map();
  for (const service of (normalizedQuery ? visibleServices : services)) {
    for (const station of stopNames(service)) {
      stationCounts.set(station, (stationCounts.get(station) || 0) + 1);
    }
  }
  const stations = [...stationCounts.entries()]
    .filter(([station]) => !normalizedQuery || normalizeSearch(station).includes(normalizedQuery))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
  stationList.innerHTML = stations.length ? stations.map(([station, count]) => `
    <button class="station-card" type="button" data-station-name="${station}">
      <strong>${station}</strong>
      <span>${stationDirectDestinations(station).length} direct destinations · ${count} services</span>
    </button>
  `).join('') : '<p class="no-results">No station cards match this search.</p>';
};

const renderServices = () => {
  renderAtlasDashboard();
  const query = serviceSearch.value.trim();
  const visible = services.filter((service) => serviceMatches(service, query));
  serviceCount.textContent = visible.length === 1 ? '1 matching service' : `${visible.length} matching services`;
  renderStationCards(visible, query);
  serviceList.innerHTML = visible.map((service) => `
    <li>
      <button class="service-card${selectedServiceIds.has(service.service_id) ? ' selected' : ''}" type="button" data-service-id="${service.service_id}">
        <span class="service-name">${service.origin} → ${service.destination}</span>
        <span class="service-number">${service.train_number}</span>
        <span class="service-meta"><span class="badge">${typeLabel(serviceType(service))}</span>${service.stops.length} stops</span>
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
  legs.forEach((leg) => recordRouteVisit(leg.service));
  selectedServiceIds = new Set(legs.map((leg) => leg.service.service_id));
  document.body.classList.toggle('service-selected', selectedServiceIds.size > 0);
  routeElements.forEach((route) => route.classList.toggle('selected-route', legs.some((leg) => (leg.service.route_ids || [leg.service.route_id]).filter(Boolean).includes(route.dataset.routeId))));
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
  serviceDetail.innerHTML = '<p>Select a route or station to build your railway atlas profile.</p>';
  renderServices();
};

const buildTimetableGraph = ({ serviceCalendarIds = null, allowOvernight = false } = {}) => {
  const graph = new Map();
  const addEdge = (from, edge) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(edge);
  };
  for (const service of services) {
    if (serviceCalendarIds?.size && !serviceCalendarIds.has(service.service_calendar_id)) continue;
    for (let index = 0; index < service.stops.length - 1; index += 1) {
      const fromStop = service.stops[index];
      const toStop = service.stops[index + 1];
      const departure = stopDeparture(fromStop);
      const arrival = stopArrival(toStop);
      const travelMinutes = minutesBetween(departure, arrival, { allowOvernight });
      if (travelMinutes === null) continue;
      const edge = {
        from: fromStop.station,
        to: toStop.station,
        service,
        departure,
        arrival,
        departureMinutes: minutesFromMidnight(departure),
        arrivalMinutes: minutesFromMidnight(arrival),
        travelMinutes
      };
      addEdge(fromStop.station, edge);
    }
  }
  return graph;
};

const alignedDepartureMinutes = (departureMinutes, minimumAbsoluteMinutes, allowOvernight) => {
  if (departureMinutes === null || minimumAbsoluteMinutes === null) return null;
  let aligned = departureMinutes;
  while (allowOvernight && aligned < minimumAbsoluteMinutes) aligned += 1440;
  return aligned >= minimumAbsoluteMinutes ? aligned : null;
};

const visitKey = (station, serviceId, absoluteMinutes, allowStationRevisits) => allowStationRevisits
  ? `${station}|${serviceId || 'start'}|${Math.floor((absoluteMinutes || 0) / 1440)}`
  : station;

const transferIsAllowed = (previousEdge, nextEdge, { allowOvernight = false } = {}) => {
  if (!previousEdge) return true;
  const previousArrival = previousEdge.absoluteArrivalMinutes ?? minutesFromMidnight(previousEdge.arrival);
  if (previousArrival === null) return false;
  const requiredDeparture = previousEdge.service.service_id === nextEdge.service.service_id
    ? previousArrival
    : previousArrival + minimumTransferMinutes;
  return alignedDepartureMinutes(nextEdge.departureMinutes, requiredDeparture, allowOvernight) !== null;
};

const groupEdgesIntoSegments = (edges) => {
  if (!edges.length) return [];
  const segments = [];
  for (const edge of edges) {
    const previous = segments.at(-1);
    if (previous && previous.service.service_id === edge.service.service_id && previous.to === edge.from) {
      previous.to = edge.to;
      previous.arrival = edge.arrival;
      previous.absoluteArrivalMinutes = edge.absoluteArrivalMinutes;
      previous.stations.push(edge.to);
    } else {
      segments.push({
        service: edge.service,
        from: edge.from,
        to: edge.to,
        departure: edge.departure,
        arrival: edge.arrival,
        absoluteDepartureMinutes: edge.absoluteDepartureMinutes,
        absoluteArrivalMinutes: edge.absoluteArrivalMinutes,
        stations: [edge.from, edge.to]
      });
    }
  }
  return segments;
};

const stationPathFromEdges = (edges) => edges.reduce((stations, edge, index) => {
  if (index === 0) stations.push(edge.from);
  stations.push(edge.to);
  return stations;
}, []);

const journeyTiming = (edges, { allowOvernight = false } = {}) => {
  const firstDeparture = edges[0]?.departure || null;
  const lastArrival = edges.at(-1)?.arrival || null;
  return {
    firstDeparture,
    lastArrival,
    totalMinutes: minutesBetween(firstDeparture, lastArrival, { allowOvernight })
  };
};

const journeySummary = (edges, segments, { totalMinutes = null, allowOvernight = false } = {}) => {
  const timing = journeyTiming(edges, { allowOvernight });
  return {
    ...timing,
    totalMinutes: totalMinutes ?? timing.totalMinutes,
    transferStations: segments.slice(0, -1).map((segment) => segment.to),
    trainNumbers: segments.map((segment) => segment.service.train_number),
    transfers: Math.max(0, segments.length - 1)
  };
};

const rankJourneyStates = (modeConfig) => (a, b) => modeConfig.rankBy === 'time'
  ? (a.elapsedMinutes - b.elapsedMinutes) || (a.transfers - b.transfers) || ((a.arrivalMinutes ?? Infinity) - (b.arrivalMinutes ?? Infinity)) || (a.stopCount - b.stopCount)
  : (a.transfers - b.transfers) || (a.elapsedMinutes - b.elapsedMinutes) || ((a.arrivalMinutes ?? Infinity) - (b.arrivalMinutes ?? Infinity)) || (a.stopCount - b.stopCount);


const daysBetweenDates = (fromDateValue, toDateValue) => Math.round((new Date(`${toDateValue}T00:00:00Z`) - new Date(`${fromDateValue}T00:00:00Z`)) / 86400000);
const isoDateFromGtfsKey = (dateKey) => `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;

const nextOperatingDepartureMinutes = (edge, minimumAbsoluteMinutes, dateValue) => {
  if (edge.departureMinutes === null || minimumAbsoluteMinutes === null) return null;
  if (!calendarDates.length) return alignedDepartureMinutes(edge.departureMinutes, minimumAbsoluteMinutes, true);
  const candidates = calendarDates
    .filter((entry) => entry.service_id === edge.service.service_calendar_id && String(entry.exception_type) === '1')
    .map((entry) => {
      const serviceDate = isoDateFromGtfsKey(entry.date);
      return (daysBetweenDates(dateValue, serviceDate) * 1440) + edge.departureMinutes;
    })
    .filter((departureMinutes) => departureMinutes >= minimumAbsoluteMinutes)
    .sort((a, b) => a - b);
  return candidates[0] ?? null;
};

const findExhaustiveJourneyOptions = async (from, to, limit = 1, { calendarStats = {}, dateValue = todayIsoDate(), onProgress = null } = {}) => {
  console.time('journey-search');
  const searchStartMs = nowMs();
  const graph = buildTimetableGraph({ allowOvernight: true });
  const queue = [{ station: from, previousEdge: null, serviceId: null, transfers: 0, stopCount: 0, elapsedMinutes: 0, arrivalMinutes: null, firstDepartureMinutes: null, edges: [], visited: new Set([from]) }];
  const results = [];
  const bestArrival = new Map([[from, 0]]);
  let statesExplored = 0;
  let maxQueueSize = queue.length;
  let transfersUsed = 0;
  let discardedCalendarFiltering = 0;
  try {
    while (queue.length && results.length < limit) {
      queue.sort((a, b) => (a.arrivalMinutes ?? 0) - (b.arrivalMinutes ?? 0));
      maxQueueSize = Math.max(maxQueueSize, queue.length);
      const state = queue.shift();
      statesExplored += 1;
      if (statesExplored % journeySearchModes.exhaustive.yieldEvery === 0) {
        const progress = { statesExplored, routesFound: results.length, queueSize: queue.length, truncationReason: null };
        console.debug('journey-search progress', progress);
        onProgress?.(progress);
        await yieldToBrowser();
      }
      if (state.station === to && state.edges.length) {
        const segments = groupEdgesIntoSegments(state.edges);
        const summary = journeySummary(state.edges, segments, { totalMinutes: state.elapsedMinutes, allowOvernight: true });
        transfersUsed = Math.max(transfersUsed, summary.transfers);
        results.push({ ...state, ...summary, segments, stations: stationPathFromEdges(state.edges) });
        continue;
      }
      for (const edge of graph.get(state.station) || []) {
        const nextTransfers = state.serviceId && state.serviceId !== edge.service.service_id ? state.transfers + 1 : state.transfers;
        const requiredDeparture = state.previousEdge
          ? state.arrivalMinutes + (state.serviceId && state.serviceId !== edge.service.service_id ? minimumTransferMinutes : 0)
          : edge.departureMinutes;
        const edgeDepartureMinutes = nextOperatingDepartureMinutes(edge, requiredDeparture, dateValue);
        if (edgeDepartureMinutes === null) {
          discardedCalendarFiltering += 1;
          continue;
        }
        const edgeArrivalMinutes = edgeDepartureMinutes + edge.travelMinutes;
        if (edgeArrivalMinutes >= (bestArrival.get(edge.to) ?? Infinity)) continue;
        bestArrival.set(edge.to, edgeArrivalMinutes);
        const firstDepartureMinutes = state.firstDepartureMinutes ?? edgeDepartureMinutes;
        const absoluteEdge = { ...edge, absoluteDepartureMinutes: edgeDepartureMinutes, absoluteArrivalMinutes: edgeArrivalMinutes };
        queue.push({
          station: edge.to,
          previousEdge: absoluteEdge,
          serviceId: edge.service.service_id,
          transfers: nextTransfers,
          stopCount: state.stopCount + 1,
          elapsedMinutes: edgeArrivalMinutes - firstDepartureMinutes,
          arrivalMinutes: edgeArrivalMinutes,
          firstDepartureMinutes,
          edges: [...state.edges, absoluteEdge],
          visited: new Set([...state.visited, edge.to])
        });
      }
    }
    return results;
  } finally {
    const searchTimeMs = Math.round((nowMs() - searchStartMs) * 10) / 10;
    lastJourneySearchStats = {
      graphNodes: graph.size,
      queueSize: queue.length,
      maxQueueSize,
      statesExplored,
      transfersUsed,
      resultCount: results.length,
      discardedTransferLimit: 0,
      discardedSearchLimit: 0,
      discardedOvernightAlignment: 0,
      discardedCalendarFiltering,
      activeServicesOnDate: calendarStats.activeServicesOnDate,
      filteredServices: calendarStats.filteredServices,
      calendarMatches: calendarStats.calendarMatches,
      searchTimeMs,
      truncated: false,
      timedOut: false,
      truncationReason: null
    };
    console.info('journey-search stats', lastJourneySearchStats);
    console.timeEnd('journey-search');
  }
};

const findJourneyOptions = async (from, to, limit = 3, { serviceCalendarIds = null, mode = 'fastest', calendarStats = {}, dateValue = todayIsoDate(), onProgress = null } = {}) => {
  if (mode === 'exhaustive') return findExhaustiveJourneyOptions(from, to, 1, { calendarStats, dateValue, onProgress });
  console.time('journey-search');
  const searchStartMs = nowMs();
  const modeConfig = journeySearchModes[mode] || journeySearchModes.fastest;
  const graph = buildTimetableGraph({ allowOvernight: modeConfig.allowOvernight });
  const queue = [{ station: from, previousEdge: null, serviceId: null, transfers: 0, stopCount: 0, elapsedMinutes: 0, arrivalMinutes: null, firstDepartureMinutes: null, edges: [], visited: new Set([visitKey(from, null, 0, modeConfig.allowStationRevisits)]) }];
  const results = [];
  let statesExplored = 0;
  let maxQueueSize = queue.length;
  let transfersUsed = 0;
  let discardedTransferLimit = 0;
  let discardedSearchLimit = 0;
  let discardedOvernightAlignment = 0;
  let discardedCalendarFiltering = 0;
  let truncated = false;
  let timedOut = false;
  let truncationReason = null;
  try {
    while (queue.length && results.length < limit && statesExplored < modeConfig.maxStates) {
      if (nowMs() - searchStartMs >= modeConfig.timeoutMs) {
        discardedSearchLimit += queue.length;
        truncated = true;
        timedOut = true;
        truncationReason = 'timeout';
        break;
      }
      queue.sort(rankJourneyStates(modeConfig));
      if (queue.length > modeConfig.maxQueueSize) {
        discardedSearchLimit += queue.length - modeConfig.maxQueueSize;
        queue.length = modeConfig.maxQueueSize;
        truncated = true;
        truncationReason ||= 'queue-size';
      }
      maxQueueSize = Math.max(maxQueueSize, queue.length);
      const state = queue.shift();
      statesExplored += 1;
      if (statesExplored % modeConfig.yieldEvery === 0) {
        const progress = {
          statesExplored,
          routesFound: results.length,
          queueSize: queue.length,
          truncationReason
        };
        console.debug('journey-search progress', progress);
        onProgress?.(progress);
        await yieldToBrowser();
      }
      if (state.station === to && state.edges.length) {
        const segments = groupEdgesIntoSegments(state.edges);
        const summary = journeySummary(state.edges, segments, { totalMinutes: state.elapsedMinutes, allowOvernight: modeConfig.allowOvernight });
        transfersUsed = Math.max(transfersUsed, summary.transfers);
        results.push({ ...state, ...summary, segments, stations: stationPathFromEdges(state.edges) });
        continue;
      }
      for (const edge of graph.get(state.station) || []) {
        if (nowMs() - searchStartMs >= modeConfig.timeoutMs) {
          discardedSearchLimit += queue.length;
          truncated = true;
          timedOut = true;
          truncationReason = 'timeout';
          break;
        }
        if (!transferIsAllowed(state.previousEdge, edge, { allowOvernight: modeConfig.allowOvernight })) {
          discardedOvernightAlignment += 1;
          continue;
        }
        const nextTransfers = state.serviceId && state.serviceId !== edge.service.service_id ? state.transfers + 1 : state.transfers;
        if (nextTransfers > modeConfig.maxTransfers) {
          discardedTransferLimit += 1;
          continue;
        }
        if (state.previousEdge && state.arrivalMinutes === null) continue;
        const requiredDeparture = state.previousEdge
          ? state.arrivalMinutes + (state.serviceId && state.serviceId !== edge.service.service_id ? minimumTransferMinutes : 0)
          : edge.departureMinutes;
        const edgeDepartureMinutes = alignedDepartureMinutes(edge.departureMinutes, requiredDeparture, modeConfig.allowOvernight);
        if (edgeDepartureMinutes === null) {
          discardedOvernightAlignment += 1;
          continue;
        }
        const edgeArrivalMinutes = edgeDepartureMinutes + edge.travelMinutes;
        const serviceDate = addDays(dateValue, Math.floor(edgeDepartureMinutes / 1440));
        if (!serviceOperatesOnDate(edge.service, serviceDate)) {
          discardedCalendarFiltering += 1;
          continue;
        }
        const firstDepartureMinutes = state.firstDepartureMinutes ?? edgeDepartureMinutes;
        if (firstDepartureMinutes === null) continue;
        const elapsedMinutes = edgeArrivalMinutes - firstDepartureMinutes;
        if (elapsedMinutes < 0 || elapsedMinutes > modeConfig.maxJourneyMinutes) continue;
        const nextVisited = new Set(state.visited);
        const nextVisitKey = visitKey(edge.to, edge.service.service_id, edgeArrivalMinutes, modeConfig.allowStationRevisits);
        if (nextVisited.has(nextVisitKey)) continue;
        nextVisited.add(nextVisitKey);
        const absoluteEdge = { ...edge, absoluteDepartureMinutes: edgeDepartureMinutes, absoluteArrivalMinutes: edgeArrivalMinutes };
        queue.push({
          station: edge.to,
          previousEdge: absoluteEdge,
          serviceId: edge.service.service_id,
          transfers: nextTransfers,
          stopCount: state.stopCount + 1,
          elapsedMinutes,
          arrivalMinutes: edgeArrivalMinutes,
          firstDepartureMinutes,
          edges: [...state.edges, absoluteEdge],
          visited: nextVisited
        });
      }
    }
    if (queue.length && statesExplored >= modeConfig.maxStates) {
      discardedSearchLimit += queue.length;
      truncated = true;
      truncationReason ||= 'state-limit';
    }
    return results
      .sort(rankJourneyStates(modeConfig))
      .slice(0, limit);
  } finally {
    const searchTimeMs = Math.round((nowMs() - searchStartMs) * 10) / 10;
    lastJourneySearchStats = {
      graphNodes: graph.size,
      queueSize: queue.length,
      maxQueueSize,
      statesExplored,
      transfersUsed,
      resultCount: results.length,
      discardedTransferLimit,
      discardedSearchLimit,
      discardedOvernightAlignment,
      discardedCalendarFiltering,
      activeServicesOnDate: calendarStats.activeServicesOnDate,
      filteredServices: calendarStats.filteredServices,
      calendarMatches: calendarStats.calendarMatches,
      searchTimeMs,
      truncated,
      timedOut,
      truncationReason
    };
    console.info('journey-search stats', lastJourneySearchStats);
    console.timeEnd('journey-search');
  }
};

let currentJourneyOptions = [];

const journeyOptionTitle = (index) => index === 0 ? 'Fastest route' : `Alternative route ${index + 1}`;

const transferDuration = (segment, nextSegment) => {
  if (!nextSegment) return null;
  if (Number.isFinite(segment.absoluteArrivalMinutes) && Number.isFinite(nextSegment.absoluteDepartureMinutes)) {
    return Math.max(0, nextSegment.absoluteDepartureMinutes - segment.absoluteArrivalMinutes);
  }
  return minutesBetween(segment.arrival, nextSegment.departure, { allowOvernight: true });
};

const renderJourneyTimeline = (option) => option.segments.map((segment, segmentIndex) => {
  const nextSegment = option.segments[segmentIndex + 1];
  const transferMinutes = transferDuration(segment, nextSegment);
  return `
    <div class="timeline-leg">
      <div class="timeline-stop timeline-origin"><time>${formatTime(segment.departure)}</time><strong>${segment.from}</strong></div>
      <div class="timeline-train"><span aria-hidden="true">↓</span><strong>${segment.service.train_number}</strong></div>
      <div class="timeline-stop timeline-destination"><time>${formatTime(segment.arrival)}</time><strong>${segment.to}</strong></div>
      ${nextSegment ? `<div class="timeline-transfer">${durationLabel(transferMinutes)} transfer</div>` : ''}
    </div>
  `;
}).join('');

const renderJourneyOption = (option, index) => `
  <button class="journey-card itinerary-card${index === 0 ? ' selected' : ''}" type="button" data-option-index="${index}">
    <div class="itinerary-card-header">
      <h3>${journeyOptionTitle(index)}</h3>
      <span>${option.transfers === 0 ? 'Direct' : `${option.transfers} transfer${option.transfers === 1 ? '' : 's'}`}</span>
    </div>
    <div class="journey-timeline">
      ${renderJourneyTimeline(option)}
    </div>
    <dl class="itinerary-summary">
      <div><dt>Travel time</dt><dd>${durationLabel(option.totalMinutes)}</dd></div>
      <div><dt>Transfers</dt><dd>${option.transfers}</dd></div>
      <div><dt>Train numbers</dt><dd>${option.trainNumbers.join(' + ')}</dd></div>
    </dl>
  </button>
`;


const stationReachability = (origin, maxDepth) => {
  const layers = [new Set(), new Set(), new Set()];
  const visited = new Set([origin]);
  let frontier = new Set([origin]);
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const nextFrontier = new Set();
    for (const station of frontier) {
      for (const destination of stationDirectDestinations(station)) {
        if (visited.has(destination)) continue;
        layers[depth].add(destination);
        nextFrontier.add(destination);
        visited.add(destination);
      }
    }
    frontier = nextFrontier;
  }
  return layers;
};

const reachabilityClass = (depth) => ['reach-direct', 'reach-one-transfer', 'reach-two-transfer'][depth];
const reachabilityLabel = (depth) => ['Direct', '1 transfer', '2 transfers'][depth];

const renderExploreReachability = (origin, maxDepth) => {
  const layers = stationReachability(origin, maxDepth);
  const allStations = layers.slice(0, maxDepth + 1).flatMap((layer) => [...layer]);
  selectedServiceIds = new Set();
  document.body.classList.remove('service-selected');
  routeElements.forEach((route) => route.classList.remove('selected-route'));
  servicePath.removeAttribute('d');
  serviceTrainLabel.textContent = '';
  const originPoint = stationCoordinates[origin];
  const markers = [
    ...(originPoint ? [`<g><circle class="service-stop explore-origin" cx="${originPoint.x}" cy="${originPoint.y}" r="17"><title>${origin}</title></circle><text class="terminal-label" x="${originPoint.x + 16}" y="${originPoint.y - 16}">Start: ${origin}</text></g>`] : []),
    ...layers.slice(0, maxDepth + 1).flatMap((layer, depth) => [...layer]
      .filter((station) => stationCoordinates[station])
      .map((station) => {
        const point = stationCoordinates[station];
        return `<circle class="service-stop reachability-stop ${reachabilityClass(depth)}" cx="${point.x}" cy="${point.y}" r="11"><title>${reachabilityLabel(depth)}: ${station}</title></circle>`;
      }))
  ];
  serviceStopMarkers.innerHTML = markers.join('');
  zoomToPoints([stationCoordinates[origin], ...allStations.map((station) => stationCoordinates[station])].filter(Boolean));
  exploreResult.innerHTML = `
    <h3>${origin}</h3>
    <div class="reachability-legend"><span class="reach-direct">Direct</span><span class="reach-one-transfer">1 transfer</span><span class="reach-two-transfer">2 transfers</span></div>
    ${layers.slice(0, maxDepth + 1).map((layer, depth) => `<section><h4>${reachabilityLabel(depth)}</h4><p>${layer.size} reachable stations</p>${listItems([...layer].sort((a, b) => a.localeCompare(b)), 'No stations found at this level.')}</section>`).join('')}
  `;
  serviceDetail.innerHTML = '<p>Explore mode highlighted reachable stations. Open a station card for a full station profile.</p>';
};


const travelTimeBucket = (minutes) => {
  if (minutes <= 120) return 'time-2h';
  if (minutes <= 240) return 'time-4h';
  if (minutes <= 480) return 'time-8h';
  return 'time-12h';
};

const stationTravelTimes = (origin, maxMinutes) => {
  const graph = buildTimetableGraph({ allowOvernight: true });
  const best = new Map([[origin, 0]]);
  const queue = [{ station: origin, minutes: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.minutes - b.minutes);
    const current = queue.shift();
    if (current.minutes > (best.get(current.station) ?? Infinity)) continue;
    for (const edge of graph.get(current.station) || []) {
      const nextMinutes = current.minutes + edge.travelMinutes;
      if (nextMinutes > maxMinutes || nextMinutes >= (best.get(edge.to) ?? Infinity)) continue;
      best.set(edge.to, nextMinutes);
      queue.push({ station: edge.to, minutes: nextMinutes });
    }
  }
  best.delete(origin);
  return [...best.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
};

const renderExploreTravelTime = (origin, maxMinutes) => {
  const reachable = stationTravelTimes(origin, maxMinutes);
  selectedServiceIds = new Set();
  document.body.classList.remove('service-selected');
  routeElements.forEach((route) => route.classList.remove('selected-route'));
  servicePath.removeAttribute('d');
  serviceTrainLabel.textContent = '';
  const originPoint = stationCoordinates[origin];
  const markers = [
    ...(originPoint ? [`<g><circle class="service-stop explore-origin" cx="${originPoint.x}" cy="${originPoint.y}" r="17"><title>${origin}</title></circle><text class="terminal-label" x="${originPoint.x + 16}" y="${originPoint.y - 16}">Start: ${origin}</text></g>`] : []),
    ...reachable
      .filter(([station]) => stationCoordinates[station])
      .map(([station, minutes]) => {
        const point = stationCoordinates[station];
        return `<circle class="service-stop reachability-stop ${travelTimeBucket(minutes)}" cx="${point.x}" cy="${point.y}" r="11"><title>${station}: ${durationLabel(minutes)}</title></circle>`;
      })
  ];
  serviceStopMarkers.innerHTML = markers.join('');
  zoomToPoints([stationCoordinates[origin], ...reachable.map(([station]) => stationCoordinates[station])].filter(Boolean));
  exploreResult.innerHTML = `
    <h3>${origin}</h3>
    <div class="reachability-legend"><span class="time-2h">≤2h</span><span class="time-4h">≤4h</span><span class="time-8h">≤8h</span><span class="time-12h">≤12h</span></div>
    <section><h4>Reachable within ${durationLabel(maxMinutes)}</h4><p>${reachable.length} reachable stations</p>${listItems(reachable.map(([station, minutes]) => `${station} · ${durationLabel(minutes)}`), 'No stations found within this travel time.')}</section>
  `;
  serviceDetail.innerHTML = '<p>Explore mode highlighted stations reachable within the selected travel-time range.</p>';
};

const renderJourneyResult = async (from, to, mode = 'fastest', dateValue = todayIsoDate()) => {
  const resultPanel = document.querySelector('.journey-result');
  if (from === to) {
    resultPanel.innerHTML = '<p>Choose two different stations.</p>';
    return;
  }
  const calendarInfo = calendarInfoForDate(dateValue);
  if (calendarInfo.activeServicesOnDate === 0) {
    const nearestDates = nearestAvailableDates(dateValue);
    resultPanel.innerHTML = `
      <p>No services operate on this date.</p>
      ${routeDateSummary(calendarInfo, dateValue)}
      <p><strong>Nearest available service dates:</strong> ${nearestDates.length ? nearestDates.join(', ') : 'none found in the loaded calendar'}</p>
    `;
    resetSelection();
    return;
  }
  const resultLimit = mode === 'exhaustive' ? 10 : 3;
  currentJourneyOptions = await findJourneyOptions(from, to, resultLimit, {
    mode,
    serviceCalendarIds: calendarInfo.activeServiceIds,
    calendarStats: calendarInfo,
    dateValue,
    onProgress: ({ statesExplored, routesFound, queueSize }) => {
      resultPanel.innerHTML = `
        <div class="journey-loading" role="status">
          <p>Searching routes...</p>
          <p>Checking timetable...</p>
          <p>Please wait...</p>
          <p>States explored: ${statesExplored}</p>
          <p>Routes found: ${routesFound}</p>
          <p>Queue size: ${queueSize}</p>
        </div>
      `;
    }
  });
  if (!currentJourneyOptions.length) {
    const limitMessage = lastJourneySearchStats?.truncated
      ? '<p>No route found within search limits.</p>'
      : '<p>No valid journey found for this date.</p><p>Try All valid routes, another date, or nearby stations.</p>';
    resultPanel.innerHTML = `
      ${limitMessage}
      ${routeDateSummary(calendarInfo, dateValue)}
      ${searchStatsSummary()}
    `;
    resetSelection();
    return;
  }
  drawServices(currentJourneyOptions[0].segments, { stationPath: currentJourneyOptions[0].stations });
  resultPanel.innerHTML = `
    <h3>${from} → ${to}</h3>
    <p><strong>Journey found</strong></p>
    <p><strong>Search mode:</strong> ${searchModeLabel(mode)}</p>
    ${lastJourneySearchStats?.truncated ? '<p>Search limits were reached; showing partial results found so far.</p>' : ''}
    ${routeDateSummary(calendarInfo, dateValue)}
    ${searchStatsSummary()}
    ${currentJourneyOptions.map(renderJourneyOption).join('')}
  `;
  serviceDetail.innerHTML = '<p>Journey highlighted. Select an option for alternate itineraries, or select an individual service card for its full stop list.</p>';
};

const populateJourneySelectors = () => {
  const stations = uniqueStations();
  const options = stations.map((station) => `<option value="${station}">${station}</option>`).join('');
  document.querySelector('#from-station').innerHTML = options;
  document.querySelector('#to-station').innerHTML = options;
  document.querySelector('#from-station').value = stations.includes('Niš') ? 'Niš' : stations[0];
  document.querySelector('#to-station').value = stations.includes('Subotica') ? 'Subotica' : stations.at(-1);
  document.querySelector('#journey-date').value ||= todayIsoDate();
  document.querySelector('#explore-station').innerHTML = options;
  document.querySelector('#explore-station').value = stations.includes('Novi Sad') ? 'Novi Sad' : stations[0];
};

const loadCalendar = async () => {
  try {
    const response = await fetch('data/generated/calendar.json');
    if (!response.ok) return;
    calendarDates = await response.json();
    indexCalendarDates();
    console.info('Loaded GTFS calendar dates', { count: calendarDates.length });
  } catch (error) {
    console.warn('Unable to load GTFS calendar dates', { error });
  }
};

const loadServices = async () => {
  const sources = [
    { url: 'data/generated/services.json', label: 'GTFS generated services' },
    { url: 'data/services.json', label: 'Demo services fallback' }
  ];
  for (const source of sources) {
    try {
      const response = await fetch(source.url);
      if (!response.ok) continue;
      services = await response.json();
      console.info(`Loaded ${source.label}`, { source: source.url, count: services.length });
      break;
    } catch (error) {
      console.warn(`Unable to load ${source.label}`, { source: source.url, error });
    }
  }
  await loadCalendar();
  buildStationConnectivity();
  populateJourneySelectors();
  renderServices();
};

const setSearchLoading = (isLoading) => {
  const findButton = document.querySelector('#find-route-button');
  const resultPanel = document.querySelector('.journey-result');
  findButton.disabled = isLoading;
  findButton.textContent = isLoading ? 'Searching…' : 'Find route';
  findButton.setAttribute('aria-busy', String(isLoading));
  if (isLoading) {
    resultPanel.innerHTML = `
      <div class="journey-loading" role="status">
        <p>Searching routes...</p>
        <p>Checking timetable...</p>
        <p>Please wait...</p>
      </div>
    `;
  }
};

const runJourneySearch = async () => {
  if (isJourneySearchRunning) return;
  isJourneySearchRunning = true;
  setSearchLoading(true);
  await yieldToBrowser();
  try {
    await renderJourneyResult(
      document.querySelector('#from-station').value,
      document.querySelector('#to-station').value,
      document.querySelector('#journey-search-mode').value,
      document.querySelector('#journey-date').value || todayIsoDate()
    );
  } finally {
    setSearchLoading(false);
    isJourneySearchRunning = false;
  }
};

const attachUiHandlers = () => {
  setZoomDetail(zoomControl.value);
  zoomControl.addEventListener('input', (event) => setZoomDetail(event.target.value));
  serviceSearch.addEventListener('input', renderServices);
  document.querySelector('.clear-search').addEventListener('click', () => {
    serviceSearch.value = '';
    renderServices();
    serviceSearch.focus();
  });
  document.querySelector('.show-all-services').addEventListener('click', resetSelection);
  atlasDashboard?.addEventListener('click', (event) => {
    if (!event.target.closest('.clear-visited')) return;
    visitedStations = new Set();
    visitedRoutes = new Set();
    saveVisitedSet('jugorail.visitedStations', visitedStations);
    saveVisitedSet('jugorail.visitedRoutes', visitedRoutes);
    renderAtlasDashboard();
  });
  serviceList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-service-id]');
    if (!button) return;
    const service = services.find((item) => item.service_id === button.dataset.serviceId);
    if (service) drawSelectedService(service);
  });
  stationList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-station-name]');
    if (!button) return;
    serviceSearch.value = button.dataset.stationName;
    renderServices();
    renderStationProfile(button.dataset.stationName);
    serviceSearch.focus();
  });
  document.querySelectorAll('[data-mode]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === tab));
    document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== tab.dataset.mode));
  }));
  document.querySelectorAll('[data-explore-depth]').forEach((button) => button.addEventListener('click', () => {
    renderExploreReachability(document.querySelector('#explore-station').value, Number(button.dataset.exploreDepth));
  }));
  document.querySelectorAll('[data-explore-minutes]').forEach((button) => button.addEventListener('click', () => {
    renderExploreTravelTime(document.querySelector('#explore-station').value, Number(button.dataset.exploreMinutes));
  }));
  document.querySelector('#explore-station').addEventListener('change', () => {
    exploreResult.innerHTML = '<p>Choose a reachability action to highlight destinations on the map.</p>';
  });
  document.querySelectorAll('[data-date-shortcut]').forEach((button) => button.addEventListener('click', () => {
    const dateInput = document.querySelector('#journey-date');
    const shortcut = button.dataset.dateShortcut;
    console.log('date shortcut clicked', { shortcut, previousDate: dateInput.value });
    if (shortcut === 'today') dateInput.value = todayIsoDate();
    if (shortcut === 'tomorrow') dateInput.value = addDays(todayIsoDate(), 1);
    if (shortcut === 'next') dateInput.value = nearestAvailableDates(dateInput.value || todayIsoDate(), 1)[0] || dateInput.value || todayIsoDate();
    console.log('date shortcut updated date', { shortcut, date: dateInput.value });
    runJourneySearch();
  }));
  document.querySelector('#find-route-button').addEventListener('click', runJourneySearch);
  document.querySelector('.stations').addEventListener('click', (event) => {
    const stationGroup = event.target.closest('g');
    const stationLabel = stationGroup?.querySelector('text')?.textContent?.trim();
    if (!stationLabel) return;
    const station = uniqueStations().find((item) => normalizeSearch(item) === normalizeSearch(stationLabel)) || stationLabel;
    if (!stationServices(station).length) return;
    serviceSearch.value = station;
    renderServices();
    renderStationProfile(station);
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
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachUiHandlers, { once: true });
} else {
  attachUiHandlers();
}
