# GTFS Import Plan

The real timetable layer should be generated from an extracted GTFS Schedule directory rather than maintained by hand.

## Expected GTFS input

The importer expects a standard extracted GTFS directory containing:

- `agency.txt`
- `stops.txt`
- `routes.txt`
- `trips.txt`
- `stop_times.txt`
- `calendar_dates.txt`
- optional `shapes.txt`

## Import command

```sh
node tools/import-gtfs-timetable.mjs ./srbijavoz_merged_gtfs data/generated/services.json
```

The importer currently reads an extracted directory. ZIP extraction should happen before import so the parser can remain dependency-free.

## Validation routines

`tools/import-gtfs-timetable.mjs` validates that required files exist and that core columns are present:

- `agency.txt`: `agency_name`
- `stops.txt`: `stop_id`, `stop_name` (`stop_lat`/`stop_lon` are preserved when present)
- `routes.txt`: `route_id`
- `trips.txt`: `route_id`, `service_id`, `trip_id`
- `stop_times.txt`: `trip_id`, `arrival_time`, `departure_time`, `stop_id`, `stop_sequence`
- `calendar_dates.txt`: `service_id`, `date`, `exception_type`

## Data model output

Each GTFS trip becomes one generated service:

```json
{
  "service_id": "gtfs-trip-id",
  "trip_id": "gtfs-trip-id",
  "gtfs_trip_id": "gtfs-trip-id",
  "train_number": "trip_short_name, trip_headsign, route label, or trip_id fallback",
  "train_number_source": "trip_short_name | trip_headsign | route_short_name | route_long_name | trip_id_fallback",
  "operator": "agency_name",
  "origin": "first stop name",
  "destination": "last stop name",
  "service_calendar_id": "GTFS service_id",
  "stops": [
    {
      "station": "stop_name",
      "gtfs_stop_id": "stop_id",
      "latitude": 44.79363,
      "longitude": 20.453129,
      "arrival": "HH:MM",
      "departure": "HH:MM",
      "stop_sequence": 1
    }
  ],
  "route_geometry": {
    "type": "gtfs_shape",
    "shape_id": "shape_id"
  },
  "source": "gtfs",
  "is_realtime": false
}
```

If a trip has no `shape_id`, `route_geometry` is set to `unmatched_import` until station/shape reconciliation maps it to the schematic.

## Integration plan

1. Download and extract the Srbijavoz GTFS ZIP outside the app runtime.
2. Run the importer into `data/generated/services.json`.
3. Add a station reconciliation file mapping GTFS stop names/IDs to schematic station keys.
4. Load generated services for timetable journey planning.
5. Keep `data/services.json` as a visual/demo fallback until generated data is fully validated.
6. Add QA checks for station mapping coverage, missing times, duplicate trips and unmatched geometry.

## Known follow-up work

- Add support for `calendar.txt` if the feed contains both calendar and calendar-date files.
- Add station reconciliation against the schematic map coordinates.
- Preserve GTFS extended-hour times such as `25:10` for after-midnight trips; display can normalize later while routing keeps absolute minutes.
- The provided `trips.txt` sample does not include `trip_short_name` or `trip_headsign`; if the real feed omits train numbers, enrich generated services from official Srbija Voz timetable pages or another train-number source.
- Match GTFS `shapes.txt` to schematic `path_points` where possible.
