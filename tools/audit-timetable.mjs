#!/usr/bin/env node
import fs from 'node:fs/promises';

const hasTime = (value) => /^\d{2}:\d{2}$/.test(value || '');
const stopHasAnyTime = (stop) => hasTime(stop.arrival) || hasTime(stop.departure);
const stopHasFullBoundaryTime = (stop, index, stops) => index === 0 ? hasTime(stop.departure) : index === stops.length - 1 ? hasTime(stop.arrival) : hasTime(stop.arrival) && hasTime(stop.departure);

const classifyService = (service) => {
  const stops = service.stops || [];
  if (stops.length && stops.every((stop, index) => stopHasFullBoundaryTime(stop, index, stops))) return 'full';
  if (stops.some(stopHasAnyTime)) return 'partial';
  return 'none';
};

const routeGeometryMismatch = (service) => {
  const stops = (service.stops || []).map((stop) => stop.station);
  const pathPoints = service.path_points || service.route_geometry?.path_points || [];
  const missingInPath = stops.filter((station) => !pathPoints.includes(station));
  const missingInStops = pathPoints.filter((station) => !stops.includes(station));
  return { service_id: service.service_id, train_number: service.train_number, missingInPath, missingInStops };
};

const main = async () => {
  const servicesPath = process.argv[2] || 'data/services.json';
  const services = JSON.parse(await fs.readFile(servicesPath, 'utf8'));
  const buckets = { full: [], partial: [], none: [] };
  for (const service of services) buckets[classifyService(service)].push(service.train_number);
  const mismatches = services.map(routeGeometryMismatch).filter((item) => item.missingInPath.length || item.missingInStops.length);
  const summary = {
    generated_at: new Date().toISOString(),
    services_total: services.length,
    full_timetable_services: buckets.full,
    partial_timetable_services: buckets.partial,
    no_timetable_services: buckets.none,
    route_geometry_mismatches: mismatches
  };
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
