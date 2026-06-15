#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const requiredFiles = ['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar_dates.txt'];
const optionalFiles = ['shapes.txt'];

const parseCsv = (text) => {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
};

const readGtfsTable = async (gtfsDir, fileName) => parseCsv(await fs.readFile(path.join(gtfsDir, fileName), 'utf8'));

export const validateGtfsDirectory = async (gtfsDir) => {
  const files = new Set(await fs.readdir(gtfsDir));
  const missing = requiredFiles.filter((file) => !files.has(file));
  const presentOptional = optionalFiles.filter((file) => files.has(file));
  if (missing.length) throw new Error(`Missing required GTFS files: ${missing.join(', ')}`);
  return { required: requiredFiles, optional: presentOptional };
};

const requireColumns = (tableName, rows, columns) => {
  const available = new Set(Object.keys(rows[0] || {}));
  const missing = columns.filter((column) => !available.has(column));
  if (missing.length) throw new Error(`${tableName} missing columns: ${missing.join(', ')}`);
};

export const loadGtfs = async (gtfsDir) => {
  await validateGtfsDirectory(gtfsDir);
  const agency = await readGtfsTable(gtfsDir, 'agency.txt');
  const stops = await readGtfsTable(gtfsDir, 'stops.txt');
  const routes = await readGtfsTable(gtfsDir, 'routes.txt');
  const trips = await readGtfsTable(gtfsDir, 'trips.txt');
  const stopTimes = await readGtfsTable(gtfsDir, 'stop_times.txt');
  const calendarDates = await readGtfsTable(gtfsDir, 'calendar_dates.txt');
  const shapes = await fs.access(path.join(gtfsDir, 'shapes.txt')).then(() => readGtfsTable(gtfsDir, 'shapes.txt')).catch(() => []);

  requireColumns('agency.txt', agency, ['agency_name']);
  requireColumns('stops.txt', stops, ['stop_id', 'stop_name']);
  requireColumns('routes.txt', routes, ['route_id']);
  requireColumns('trips.txt', trips, ['route_id', 'service_id', 'trip_id']);
  requireColumns('stop_times.txt', stopTimes, ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']);
  requireColumns('calendar_dates.txt', calendarDates, ['service_id', 'date', 'exception_type']);

  return { agency, stops, routes, trips, stopTimes, calendarDates, shapes };
};

const normalizeTime = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  if (!hours || !minutes) return null;
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
};

const parseCoordinate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};

export const summarizeGtfs = ({ stops, routes, trips, stopTimes, calendarDates, shapes }) => {
  const dates = calendarDates.map((row) => row.date).filter(Boolean).sort();
  return {
    stops: stops.length,
    routes: routes.length,
    trips: trips.length,
    stop_times: stopTimes.length,
    calendar_dates: calendarDates.length,
    shapes: shapes.length,
    service_date_range: dates.length ? { start: dates[0], end: dates.at(-1) } : null
  };
};

export const convertTripsToServices = ({ agency, stops, routes, trips, stopTimes }) => {
  const agencyName = agency[0]?.agency_name || 'Srbija Voz';
  const stopsById = new Map(stops.map((stop) => [stop.stop_id, stop]));
  const routesById = new Map(routes.map((route) => [route.route_id, route]));
  const stopTimesByTrip = new Map();
  for (const stopTime of stopTimes) {
    if (!stopTimesByTrip.has(stopTime.trip_id)) stopTimesByTrip.set(stopTime.trip_id, []);
    stopTimesByTrip.get(stopTime.trip_id).push(stopTime);
  }

  return trips.map((trip) => {
    const orderedStopTimes = (stopTimesByTrip.get(trip.trip_id) || [])
      .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const serviceStops = orderedStopTimes.map((stopTime) => {
      const stop = stopsById.get(stopTime.stop_id) || {};
      return {
        station: stop.stop_name || stopTime.stop_id,
        gtfs_stop_id: stopTime.stop_id,
        latitude: parseCoordinate(stop.stop_lat),
        longitude: parseCoordinate(stop.stop_lon),
        arrival: normalizeTime(stopTime.arrival_time),
        departure: normalizeTime(stopTime.departure_time),
        stop_sequence: Number(stopTime.stop_sequence)
      };
    });
    const route = routesById.get(trip.route_id) || {};
    const first = serviceStops[0];
    const last = serviceStops.at(-1);
    const trainNumber = trip.trip_short_name || trip.trip_headsign || route.route_short_name || route.route_long_name || null;
    return {
      service_id: trip.trip_id,
      trip_id: trip.trip_id,
      gtfs_trip_id: trip.trip_id,
      train_number: trainNumber || trip.trip_id,
      train_number_source: trip.trip_short_name ? 'trip_short_name' : trip.trip_headsign ? 'trip_headsign' : route.route_short_name ? 'route_short_name' : route.route_long_name ? 'route_long_name' : 'trip_id_fallback',
      name: trip.trip_headsign || route.route_long_name || `${first?.station || 'Unknown'} – ${last?.station || 'Unknown'}`,
      operator: agencyName,
      origin: first?.station || null,
      destination: last?.station || null,
      route_id: trip.route_id,
      route_short_name: route.route_short_name || null,
      route_long_name: route.route_long_name || null,
      service_calendar_id: trip.service_id,
      stops: serviceStops,
      source: 'gtfs',
      is_realtime: false,
      route_geometry: trip.shape_id ? { type: 'gtfs_shape', shape_id: trip.shape_id } : { type: 'unmatched_import', path_points: [] }
    };
  }).filter((service) => service.stops.length >= 2);
};

export const convertStopsToStations = ({ stops }) => stops.map((stop) => ({
  station_id: stop.stop_id,
  gtfs_stop_id: stop.stop_id,
  name: stop.stop_name,
  latitude: parseCoordinate(stop.stop_lat),
  longitude: parseCoordinate(stop.stop_lon)
}));

export const convertRoutesToMetadata = ({ routes }) => routes.map((route) => ({
  route_id: route.route_id,
  agency_id: route.agency_id || null,
  short_name: route.route_short_name || null,
  long_name: route.route_long_name || null,
  route_type: route.route_type || null,
  color: route.route_color || null,
  text_color: route.route_text_color || null
}));

export const convertCalendarDates = ({ calendarDates }) => calendarDates.map((calendarDate) => ({
  service_id: calendarDate.service_id,
  date: calendarDate.date,
  exception_type: calendarDate.exception_type
}));

export const buildMetadata = (gtfs, services) => ({
  generated_at: new Date().toISOString(),
  source: 'gtfs',
  summary: {
    ...summarizeGtfs(gtfs),
    generated_services: services.length
  }
});

export const writeGeneratedGtfsArtifacts = async (gtfs, outputServicesPath) => {
  const services = convertTripsToServices(gtfs);
  const outputDir = path.dirname(outputServicesPath);
  const artifacts = {
    'services.json': services,
    'stations.json': convertStopsToStations(gtfs),
    'routes.json': convertRoutesToMetadata(gtfs),
    'calendar.json': convertCalendarDates(gtfs),
    'metadata.json': buildMetadata(gtfs, services)
  };

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(Object.entries(artifacts).map(([fileName, data]) => {
    const targetPath = fileName === 'services.json' ? outputServicesPath : path.join(outputDir, fileName);
    return fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`);
  }));

  return { services, outputDir, artifacts: Object.keys(artifacts).map((fileName) => (fileName === 'services.json' ? outputServicesPath : path.join(outputDir, fileName))) };
};

const main = async () => {
  const [gtfsDir, outputPath = 'data/generated/services.json'] = process.argv.slice(2);
  if (!gtfsDir) {
    console.error('Usage: node tools/import-gtfs-timetable.mjs <extracted-gtfs-directory> [output-services.json]');
    process.exit(1);
  }
  const gtfs = await loadGtfs(gtfsDir);
  const { services, artifacts } = await writeGeneratedGtfsArtifacts(gtfs, outputPath);
  console.log(JSON.stringify({ ...summarizeGtfs(gtfs), imported_services: services.length, outputPath, artifacts }, null, 2));
};

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
