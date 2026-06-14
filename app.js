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
  'Šabac': { x: 220, y: 700 },
  'Loznica': { x: 220, y: 820 },
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
const fullViewBox = svg.getAttribute('viewBox
