# Timetable and Journey Finder Audit

Generated: 2026-06-15

## 1. Current timetable data coverage

`data/services.json` currently contains 19 services.

| Coverage class | Count | Services |
| --- | ---: | --- |
| Full timetable data | 0 | — |
| Partial timetable data | 0 | — |
| No timetable data | 19 | Re6001, REx821, Re2515, Re4501, Re25440, Re2101, Re4813, Re4811, Re3831, Re3810, Re2740, Re2771, Re6751, IR620, HS-BG-NS-SU, REG-BG-NS-SU, REG-NI-BG, REG-LO-SA, REG-BG-VR |

A service counts as fully timed only when:

- the origin has a valid `departure` time,
- every intermediate stop has valid `arrival` and `departure` times,
- the destination has a valid `arrival` time.

The current fixture data has `arrival: null` and `departure: null` throughout, so journey results cannot yet show real departure time, arrival time, waiting time, or total travel time.

## 2. Timetable source feasibility

### GTFS schedule feed — recommended primary source

Mobility Database lists a `Srbijavoz` GTFS Schedule feed (`mdb-2927`) with agency `Srbijavoz`, timezone `Europe/Vienna`, and an updated quality report. GTFS is the best import target because it directly models agencies, routes, trips, stop times, calendars, and stop sequences.

Feasibility: **high**.

Implementation implications:

1. Download the GTFS zip.
2. Import `agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt`, and `calendar_dates.txt`.
3. Convert each GTFS trip into one internal train service.
4. Use `stop_times.arrival_time` and `stop_times.departure_time` for timetable graph edges.
5. Match GTFS stops to schematic station names/coordinates.

### Official Srbija Voz timetable web pages — useful fallback

The official timetable page exposes direct train and station timetable searches. The page states that timetable information comes from `Infrastruktura Železnice Srbije` and the timetable web application is by `Srbija Voz`.

Feasibility: **medium**.

Direct result pages can be parsed for train number, origin departure, destination arrival, and journey duration. However, direct result pages do not reliably expose every intermediate stop in a machine-friendly way, so they are less complete than GTFS for a full journey planner.

### Timetable PDFs / announcements

Srbija Voz publishes timetable notices and annual timetable announcements. These are useful for human validation but are not ideal as the primary machine-readable source.

Feasibility: **low to medium**, depending on whether structured PDFs are available for each line.

### Public API

No stable public JSON API was confirmed during this audit. The existing `tools/import-srbvoz-timetable.mjs` should remain a fallback parser, not the primary data architecture.

Feasibility: **unknown**.

## 3. Journey ranking audit

The application now has the correct ranking shape for timetable-aware planning:

1. Fewest transfers.
2. Shortest known/estimated travel time.
3. Earliest arrival.

But because all current timetable values are null, ranking currently falls back to an estimated edge duration and cannot yet behave like DB Navigator, ÖBB Scotty, or České dráhy Můj Vlak.

Required next step: import real `arrival` / `departure` values from GTFS `stop_times.txt`.

## 4. Map UI review

### Selected route label

The selected route label is useful but can overlap dense schematic areas. It should become a compact pill anchored outside the route bundle, or move into the journey result panel on narrow viewports.

Recommendation: **move primary train/journey labels into the sidebar and keep only terminal/transfer markers on the map**.

### Beograd label density

The Belgrade area is readable in the base map but becomes dense when terminal and transfer labels are added. Journey overlays should suppress non-essential local labels when a journey is selected.

Recommendation: **hide secondary Belgrade labels during selected journey mode unless zoom detail is 160%**.

### Legend

The static legend is less useful than journey information once a route is selected.

Recommendation: **hide the legend when a journey/service is selected and replace it with network statistics in the sidebar**:

- services loaded,
- stations loaded,
- timed services count,
- untimed services count,
- transfer minimum.

## 5. Route geometry validation

The route audit found two current path/stop mismatches:

| Service | Mismatch |
| --- | --- |
| Re2515 | `path_points` includes `Novi Sad`, but the stop list omits it. This may be a schematic via-point, but it should be explicitly marked as `via_points` rather than a stop. |
| Re4501 | `path_points` includes `Bačka Topola` and `Vrbas`, but the stop list omits them. These should either become stops if the train stops there, or be moved to `via_points`. |

Examples reviewed:

- `Niš → Subotica`: graph can find a connection via the static network, but times are unknown.
- `Novi Sad → Novi Beograd`: graph can find a connection through services that include the Beograd/Novi Sad corridor, but exact timetable quality depends on imported stop times.
- `Užice → Niš`: graph can find a transfer journey through the current network, but total travel time is unknown.
- `Subotica → Zrenjanin`: direct service data exists for Re2515, but the `Novi Sad` schematic via-point mismatch must be resolved.

## 6. Implementation roadmap

### Priority 1 — GTFS importer

Create `tools/import-gtfs-timetable.mjs` that imports a GTFS zip and outputs the internal service format.

Minimum imported fields:

- `train_number` from `trips.trip_short_name` or `trip_headsign`,
- `operator` from `agency.txt`,
- `origin` / `destination` from first and last stop,
- full stop list from `stop_times.txt`,
- `arrival` / `departure` from `stop_times.txt`,
- service calendar from `calendar.txt` and `calendar_dates.txt`,
- route geometry metadata from route/shape matching where available.

### Priority 2 — Station reconciliation

Create a station matching table:

- GTFS stop ID,
- GTFS stop name,
- schematic station name,
- station coordinate key,
- aliases.

### Priority 3 — Timetable graph runtime

Use only timed trips for real journey planning. Keep untimed records visible in the Services tab as draft/import warnings, but exclude them from timed journey ranking unless the user enables a fallback mode.

### Priority 4 — Journey result UI

Show:

- departure time,
- arrival time,
- total travel time,
- transfer station,
- transfer duration,
- train number,
- platform if future data includes it.

### Priority 5 — Map overlay cleanup

Hide the static legend during selected journeys and move journey summary into the sidebar.

### Priority 6 — Data QA

Add automated checks:

- every timed service has origin departure and destination arrival,
- intermediate stops have arrival/departure,
- path points are either stops or declared `via_points`,
- every stop has a station coordinate or an unmatched-station warning.
