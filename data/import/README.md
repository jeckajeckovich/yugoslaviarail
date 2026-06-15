# Srbija Voz timetable import

This directory contains route-query inputs for `tools/import-srbvoz-timetable.mjs`.

The official Srbija Voz timetable web app exposes direct timetable result pages under:

`https://w3.srbvoz.rs/redvoznje/direktni/{FROM_NAME}/{FROM_ID}/{TO_NAME}/{TO_ID}/{DATE}/{TIME}/{LANG}`

Search results include train number, departure time, arrival time, and journey duration for direct trains. The importer parses those result pages into the app's timetable-oriented service shape:

- `train_number`
- `operator`
- `origin`
- `destination`
- stop-level `arrival` / `departure`
- `route_geometry`

Use the example file as a template, then run:

```sh
node tools/import-srbvoz-timetable.mjs data/import/srbvoz-direct-routes.example.json data/services.json
```

The importer does not invent times. If a source page lacks a time, the service is skipped for that import result.
