#!/usr/bin/env node
import fs from 'node:fs/promises';

const BASE_URL = 'https://w3.srbvoz.rs/redvoznje/direktni';

const normalizeWhitespace = (text) => text.replace(/\s+/g, ' ').trim();
const timeFromDateTime = (value) => (value.match(/\b(\d{2}:\d{2})\b/) || [null, null])[1];

export const buildDirectTimetableUrl = ({ from_name, from_id, to_name, to_id, date, time = '0000', language = 'sr' }) => {
  const parts = [from_name, from_id, to_name, to_id, date, time, language].map((part) => encodeURIComponent(part));
  return `${BASE_URL}/${parts.join('/')}`;
};

export const parseSrbvozDirectHtml = (html, route) => {
  const text = normalizeWhitespace(html.replace(/<[^>]+>/g, ' '));
  const chunks = text.split(/(?=Voz broj:\s*)/g).filter((chunk) => /Voz broj:\s*/.test(chunk));
  return chunks.map((chunk) => {
    const trainNumber = (chunk.match(/Voz broj:\s*([^\s]+)/) || [null, null])[1];
    const departureText = (chunk.match(/Polazak:\s*([^K]+?)\s*(?:Dolazak:|Kasni:|Putuje:)/) || [null, null])[1];
    const arrivalText = (chunk.match(/Dolazak:\s*([^K]+?)\s*(?:Kasni:|Putuje:|Napomena:)/) || [null, null])[1];
    const departure = departureText ? timeFromDateTime(departureText) : null;
    const arrival = arrivalText ? timeFromDateTime(arrivalText) : null;
    if (!trainNumber || !departure || !arrival) return null;
    return {
      service_id: `srbvoz_${trainNumber}_${route.date.replace(/\D/g, '')}`.toLowerCase(),
      train_number: trainNumber,
      name: `${route.from_name} – ${route.to_name}`,
      origin: route.from_name,
      destination: route.to_name,
      operator: 'Srbija Voz',
      source: 'srbvoz_direct_timetable',
      is_realtime: false,
      imported_at: new Date().toISOString(),
      stops: [
        { station: route.from_name, arrival: null, departure },
        { station: route.to_name, arrival, departure: null }
      ],
      route_geometry: { type: 'unmatched_import', path_points: [] }
    };
  }).filter(Boolean);
};

const mergeServices = (existing, imported) => {
  const byKey = new Map(existing.map((service) => [`${service.train_number}:${service.origin}:${service.destination}`, service]));
  for (const service of imported) byKey.set(`${service.train_number}:${service.origin}:${service.destination}`, { ...byKey.get(`${service.train_number}:${service.origin}:${service.destination}`), ...service });
  return [...byKey.values()];
};

const main = async () => {
  const [routesPath, servicesPath = 'data/services.json'] = process.argv.slice(2);
  if (!routesPath) {
    console.error('Usage: node tools/import-srbvoz-timetable.mjs data/import/srbvoz-direct-routes.json [data/services.json]');
    process.exit(1);
  }
  const routes = JSON.parse(await fs.readFile(routesPath, 'utf8'));
  const existing = JSON.parse(await fs.readFile(servicesPath, 'utf8'));
  const imported = [];
  for (const route of routes) {
    const url = buildDirectTimetableUrl(route);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed ${response.status} ${url}`);
    imported.push(...parseSrbvozDirectHtml(await response.text(), route));
  }
  await fs.writeFile(servicesPath, `${JSON.stringify(mergeServices(existing, imported), null, 2)}\n`);
  console.log(`Imported ${imported.length} timetable services into ${servicesPath}`);
};

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
