# Terrain, floor and fixture PNGs

These are the editable 32×32 pixel assets used by `viewer/tile-atlas.js`.

- `grass.png` → `terrain.grass`
- `grass_alt.png` → `terrain.grass-alt`
- `wood_floor.png` → `building.floor.wood`
- `hearth.png` → `fixture.hearth`
- `bed.png` → `fixture.bed`
- `dining_table.png` → `fixture.dining-table`
- `service_counter.png` → `fixture.service-counter`

Keep each canvas at exactly 32×32 pixels. Terrain and floor tiles are opaque.
Fixture artwork keeps transparent pixels around the object so the existing
footprint and depth-ordering behaviour remains unchanged.

These files replace the active terrain, floor and fixture entries that previously
lived in `village-tiles.svg`.
