#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
const normalizeTime = (value) => {
  const match = String(value || '').match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};
const slug = (value) => normalizeWhitespace(String(value || ''))
  .toLocaleLowerCase('bs')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const decodeHtml = (value) => value
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&ccaron;/g, 'č')
  .replace(/&Ccaron;/g, 'Č');
const stripTags = (html) => normalizeWhitespace(decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')));

const readSource = async (source) => {
  if (source.input) return fs.readFile(source.input, 'utf8');
  if (!source.url) throw new Error(`Bosnia source ${source.operator || 'unknown'} must define input or url`);
  const response = await fetch(source.url, { headers: { 'user-agent': 'JugoRail timetable importer' } });
  if (!response.ok) throw new Error(`Failed ${response.status} ${source.url}`);
  return response.text();
};

const extractHtmlTables = (html) => [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(([table]) => {
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([row]) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cell]) => stripTags(cell)));
  return rows.filter((row) => row.some(Boolean));
});

const stationTimePairsFromText = (text) => {
  const pairs = [];
  const pattern = /([A-ZČĆŠĐŽ][\p{L}ČĆŠĐŽčćšđž .'-]{1,45}?)\s+(?:at|u|od|polazak|dolazak|[-–:]\s*)?(\d{1,2}[:.]\d{2})\s*(?:h|časova)?/gu;
  for (const match of text.matchAll(pattern)) {
    const station = normalizeWhitespace(match[1].replace(/\b(?:departure|arrival|polazak|dolazak|voz|train|from|to|iz|za)$/i, ''));
    const time = normalizeTime(match[2]);
    if (station && time && !/^\d/.test(station)) pairs.push({ station, time });
  }
  return pairs;
};

const parseNarrativeTrains = (html, source) => {
  const text = stripTags(html);
  const chunks = text.split(/(?=\b(?:Train|Trains|Voz|Vozovi)\b[^.]{0,30}\b\d{2,5}\b)/giu);
  return chunks.flatMap((chunk) => {
    const trainNumber = (chunk.match(/\b(?:Train|Trains|Voz|Vozovi)(?:\s+No\.)?\s*(?:broj\s*)?(\d{2,5})\b/iu) || [null, null])[1];
    if (!trainNumber) return [];
    const pairs = stationTimePairsFromText(chunk).filter((pair, index, all) => index === all.findIndex((item) => item.station === pair.station && item.time === pair.time));
    return pairs.length >= 2 ? [{ trainNumber, pairs }] : [];
  });
};

const parseTableTrains = (html) => extractHtmlTables(html).flatMap((table) => {
  const [header = [], ...rows] = table;
  const trainIndex = header.findIndex((cell) => /\b(train|voz|broj)\b/i.test(cell));
  const stationIndex = header.findIndex((cell) => /\b(station|stanica)\b/i.test(cell));
  const timeIndexes = header.map((cell, index) => /\b(time|arrival|departure|dolazak|polazak|vrijeme)\b/i.test(cell) ? index : -1).filter((index) => index >= 0);
  if (trainIndex < 0 || stationIndex < 0 || !timeIndexes.length) return [];
  const byTrain = new Map();
  for (const row of rows) {
    const trainNumber = row[trainIndex];
    const station = row[stationIndex];
    const time = timeIndexes.map((index) => normalizeTime(row[index])).find(Boolean);
    if (!trainNumber || !station || !time) continue;
    if (!byTrain.has(trainNumber)) byTrain.set(trainNumber, []);
    byTrain.get(trainNumber).push({ station, time });
  }
  return [...byTrain.entries()].filter(([, pairs]) => pairs.length >= 2).map(([trainNumber, pairs]) => ({ trainNumber, pairs }));
});

export const trainsToServices = (trains, source) => trains.map(({ trainNumber, pairs }) => {
  const stops = pairs.map((pair, index) => ({
    station: pair.station,
    arrival: index === 0 ? null : pair.time,
    departure: index === pairs.length - 1 ? null : pair.time
  }));
  const origin = stops[0].station;
  const destination = stops.at(-1).station;
  return {
    service_id: `${slug(source.operator || 'bosnia')}_${slug(trainNumber)}_${slug(origin)}_${slug(destination)}`,
    train_number: trainNumber,
    name: `${origin} – ${destination}`,
    operator: source.operator || 'Bosnia passenger rail operator',
    origin,
    destination,
    route_id: `${slug(origin)}-${slug(destination)}`,
    service_calendar_id: source.service_calendar_id || 'bosnia_imported',
    stops,
    source: source.source || 'bosnia_official_timetable_import',
    source_url: source.url || null,
    imported_at: new Date().toISOString(),
    is_realtime: false,
    route_geometry: { type: 'unmatched_import', path_points: [] }
  };
});

export const parseBosniaTimetableHtml = (html, source = {}) => {
  const trains = [...parseTableTrains(html), ...parseNarrativeTrains(html, source)];
  const unique = new Map();
  for (const train of trains) {
    const key = `${train.trainNumber}:${train.pairs.map((pair) => `${pair.station}@${pair.time}`).join('|')}`;
    unique.set(key, train);
  }
  return trainsToServices([...unique.values()], source);
};

export const importBosniaSources = async (sources) => {
  const services = [];
  for (const source of sources) {
    const html = await readSource(source);
    services.push(...parseBosniaTimetableHtml(html, source));
  }
  return services;
};

const main = async () => {
  const [sourcesPath, outputPath = 'data/generated/bosnia-services.json'] = process.argv.slice(2);
  if (!sourcesPath) {
    console.error('Usage: node tools/import-bosnia-timetable.mjs data/import/bosnia-sources.json [data/generated/bosnia-services.json]');
    process.exit(1);
  }
  const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));
  const services = await importBosniaSources(sources);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(services, null, 2)}\n`);
  console.log(JSON.stringify({ imported_services: services.length, outputPath, sources: sources.length }, null, 2));
};

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
