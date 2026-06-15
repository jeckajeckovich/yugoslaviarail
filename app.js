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
let calendarDates = [];
let calendarDateIndex = new Map();
let selectedServiceIds = new Set();
let lastJourneySearchStats = null;

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
  fastest: { maxTransfers: 3, maxStates: 7500, maxQueueSize: 7500, timeoutMs: 1500, allowOvernight: false, allowStationRevisits: false, rankBy: 'time' },
  all: { maxTransfers: 10, maxStates: 150000, maxQueueSize: 75000, timeoutMs: 5000, allowOvernight: true, allowStationRevisits: true, rankBy: 'transfers' }
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
  <div class="search-stats">
    <p><strong>States explored:</strong> ${lastJourneySearchStats.statesExplored}</p>
    <p><strong>Queue size:</strong> ${lastJourneySearchStats.queueSize}</p>
    <p><strong>Timeout reached:</strong> ${lastJourneySearchStats.timedOut ? 'yes' : 'no'}</p>
    <p><strong>Truncation reason:</strong> ${lastJourneySearchStats.truncationReason || 'none'}</p>
  </div>
` : '';

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
    <p><span class="badge">${typeLabel(serviceType(service))}</span> ${service.operator}</p>
    <p><strong>Transfers on route:</strong> ${hubs.length ? hubs.join(', ') : 'None shown on schematic'}</p>
    <ol class="stop-list">
      ${service.stops.map((stop) => `<li>${stop.station}<span>arr ${formatTime(stopArrival(stop))} · dep ${formatTime(stopDeparture(stop))}</span></li>`).join('')}
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
  serviceDetail.innerHTML = '<p>Select a train to highlight its scheduled route, stops, and transfer hubs.</p>';
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

const findJourneyOptions = (from, to, limit = 10, { serviceCalendarIds = null, mode = 'fastest', calendarStats = {}, dateValue = todayIsoDate() } = {}) => {
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
      if (statesExplored % 2500 === 0) {
        console.debug('journey-search progress', {
          statesExplored,
          routesFound: results.length,
          truncationReason
        });
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
        if (elapsedMinutes < 0) continue;
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

const renderJourneyOption = (option, index) => `
  <button class="journey-card${index === 0 ? ' selected' : ''}" type="button" data-option-index="${index}">
    <h3>Option ${String.fromCharCode(65 + index)}</h3>
    <p><strong>Transfers:</strong> ${option.transfers}</p>
    <p><strong>Total travel time:</strong> ${durationLabel(option.totalMinutes)}</p>
    <p><strong>Departure:</strong> ${formatTime(option.firstDeparture)} · <strong>Arrival:</strong> ${formatTime(option.lastArrival)}</p>
    <p><strong>Trains:</strong> ${option.trainNumbers.join(' → ')}</p>
    <p><strong>Transfer stations:</strong> ${option.transferStations.length ? option.transferStations.join(', ') : 'None'}</p>
    <p><strong>Estimated segments:</strong> ${option.segments.length}</p>
    <ol class="stop-list">
      ${option.segments.map((segment, segmentIndex) => {
        const nextSegment = option.segments[segmentIndex + 1];
        const transferMinutes = nextSegment ? minutesBetween(segment.arrival, nextSegment.departure, { allowOvernight: true }) : null;
        return `<li>Segment ${segmentIndex + 1}<span>Train: ${segment.service.train_number}</span><span>${segment.from} ${formatTime(segment.departure)} → ${segment.to} ${formatTime(segment.arrival)}</span>${nextSegment ? `<span>Transfer at ${segment.to}: ${durationLabel(transferMinutes)}</span>` : ''}</li>`;
      }).join('')}
    </ol>
  </button>
`;

const renderJourneyResult = (from, to, mode = 'fastest', dateValue = todayIsoDate()) => {
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
  currentJourneyOptions = findJourneyOptions(from, to, 3, {
    mode,
    serviceCalendarIds: calendarInfo.activeServiceIds,
    calendarStats: calendarInfo,
    dateValue
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
    <p><strong>Search mode:</strong> ${mode === 'all' ? 'All valid routes' : 'Fastest'}</p>
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
  setSearchLoading(true);
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  try {
    renderJourneyResult(
      document.querySelector('#from-station').value,
      document.querySelector('#to-station').value,
      document.querySelector('#journey-search-mode').value,
      document.querySelector('#journey-date').value || todayIsoDate()
    );
  } finally {
    setSearchLoading(false);
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
  document.querySelectorAll('[data-date-shortcut]').forEach((button) => {
  button.addEventListener('click', () => {
    const dateInput = document.querySelector('#journey-date');
    const shortcut = button.dataset.dateShortcut;

    let newDate = dateInput.value || todayIsoDate();

    if (shortcut === 'today') {
      newDate = todayIsoDate();
    } else if (shortcut === 'tomorrow') {
      newDate = addDays(newDate, 1);
    } else if (shortcut === 'next') {
      newDate =
        nearestAvailableDates(newDate, 1)[0] ||
        newDate;
    }

    dateInput.value = newDate;
    runJourneySearch();
  });
});
    
  document.querySelector('#find-route-button').addEventListener('click', runJourneySearch);
  document.querySelector('.journey-result').addEventListener('click', (event) => {
    const button = event.target.closest('[data-option-index]');
    if (!button) return;
    const option = currentJourneyOptions[Number(button.dataset.optionIndex)];
    if (!option) return;
    document.querySelectorAll('[data-option-index]').forEach((item) => item.classList.toggle('selected', item === button));
    drawServices(option.segments, { stationPath: option.stations });
  });
});

  loadServices();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachUiHandlers, { once: true });
} else {
  attachUiHandlers();
}
