#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { convertTripsToServices, loadGtfs, summarizeGtfs } from './import-gtfs-timetable.mjs';

const normalizeStation = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'dj')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const unique = (values) => [...new Set(values.filter(Boolean))];

const serviceEndpoints = (service) => ({
  train_number: service.train_number,
  origin: service.origin,
  destination: service.destination,
  departure: service.stops[0]?.departure || service.stops[0]?.arrival || null,
  arrival: service.stops.at(-1)?.arrival || service.stops.at(-1)?.departure || null,
  stop_count: service.stops.length
});

const formatServiceRow = (service) => {
  const sample = serviceEndpoints(service);
  return `| ${sample.train_number} | ${sample.origin} | ${sample.destination} | ${sample.departure || 'n/a'} | ${sample.arrival || 'n/a'} | ${sample.stop_count} |`;
};

const findUnmatchedStations = (demoServices, gtfsStops) => {
  const gtfsByNormalizedName = new Map(gtfsStops.map((stop) => [normalizeStation(stop.stop_name), stop.stop_name]));
  const demoStations = unique(demoServices.flatMap((service) => service.stops.map((stop) => stop.station))).sort();
  return demoStations
    .filter((station) => !gtfsByNormalizedName.has(normalizeStation(station)))
    .map((station) => {
      const normalized = normalizeStation(station);
      const candidates = gtfsStops
        .map((stop) => stop.stop_name)
        .filter((stopName) => {
          const gtfsNormalized = normalizeStation(stopName);
          return gtfsNormalized.includes(normalized) || normalized.includes(gtfsNormalized);
        })
        .slice(0, 5);
      return { station, candidates };
    });
};

const renderReport = ({ gtfsDir, summary, services, demoServices, unmatchedStations }) => {
  const sampleServices = services.slice(0, 20);
  const demoStopCount = demoServices.reduce((sum, service) => sum + service.stops.length, 0);
  const generatedStopCount = services.reduce((sum, service) => sum + service.stops.length, 0);

  return `# GTFS Validation Report

Generated from GTFS directory: \`${gtfsDir}\`.

## Parse confirmation

- \`stops.txt\`: parsed successfully
- \`routes.txt\`: parsed successfully
- \`trips.txt\`: parsed successfully
- \`stop_times.txt\`: parsed successfully

## Feed summary

| Metric | Count |
| --- | ---: |
| Stops | ${summary.stops} |
| Routes | ${summary.routes} |
| Trips | ${summary.trips} |
| Stop times | ${summary.stop_times} |
| Calendar date rows | ${summary.calendar_dates} |
| Shape points | ${summary.shapes} |

Service date range: ${summary.service_date_range ? `${summary.service_date_range.start}–${summary.service_date_range.end}` : 'not available'}.

Generated services: ${services.length}.

## 20 sample generated services

| Train / route label | Origin | Destination | Departure | Arrival | Stops |
| --- | --- | --- | --- | --- | ---: |
${sampleServices.map(formatServiceRow).join('\n')}

## Comparison with current demo dataset

| Dataset | Services | Stop records |
| --- | ---: | ---: |
| Demo \`data/services.json\` | ${demoServices.length} | ${demoStopCount} |
| Generated GTFS services | ${services.length} | ${generatedStopCount} |

The demo dataset remains useful only for schematic rendering and UI smoke testing. The generated GTFS services should become the authoritative timetable source for journey planning once station reconciliation is complete.

## Station name normalization issues

${unmatchedStations.length ? unmatchedStations.map((item) => `- Demo station \`${item.station}\` was not matched in GTFS${item.candidates.length ? `; possible candidates: ${item.candidates.map((candidate) => `\`${candidate}\``).join(', ')}` : '.'}`).join('\n') : 'No demo station-name mismatches were detected after normalization.'}

## Migration recommendation

1. Keep \`data/services.json\` as a schematic demonstration fixture only.
2. Generate \`data/generated/services.json\` from root GTFS files during data refresh.
3. Add a station reconciliation table from GTFS \`stop_id\`/\`stop_name\` to schematic station keys before switching the UI.
4. Update the journey planner to read generated GTFS services for timetable calculations.
5. Use demo services only as a fallback when generated GTFS output is unavailable.
`;
};

const main = async () => {
  const [gtfsDir = '.', outputReport = 'docs/gtfs-validation-report.md', outputServices = 'data/generated/services.json'] = process.argv.slice(2);
  const gtfs = await loadGtfs(gtfsDir);
  const services = convertTripsToServices(gtfs);
  const demoServices = JSON.parse(await fs.readFile('data/services.json', 'utf8'));
  const summary = summarizeGtfs(gtfs);
  const unmatchedStations = findUnmatchedStations(demoServices, gtfs.stops);
  const report = renderReport({ gtfsDir, summary, services, demoServices, unmatchedStations });

  await fs.mkdir(path.dirname(outputReport), { recursive: true });
  await fs.writeFile(outputReport, report);
  await fs.mkdir(path.dirname(outputServices), { recursive: true });
  await fs.writeFile(outputServices, `${JSON.stringify(services, null, 2)}\n`);

  console.log(JSON.stringify({ ...summary, generated_services: services.length, report: outputReport, output_services: outputServices }, null, 2));
};

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
