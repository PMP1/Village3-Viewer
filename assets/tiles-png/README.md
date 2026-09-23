# Terrain, floor and fixture PNGs

These are the editable 32×32 pixel assets used by `viewer/tile-atlas.js`.

- `grass.png` → `terrain.grass`
- `grass_alt.png` → `terrain.grass-alt`
- `dirt.png` → `terrain.dirt`
- `dirt_alt.png` → alternate `terrain.dirt` artwork used to break up repeated path texture
- `wood_floor.png` → `building.floor.wood`
- `hearth.png` → `fixture.hearth`
- `bed.png` → `fixture.bed`
- `dining_table.png` → `fixture.dining-table`
- `service_counter.png` → `fixture.service-counter`

Keep each canvas at exactly 32×32 pixels. Terrain and floor tiles are opaque.
Fixture artwork keeps transparent pixels around the object so the existing
footprint and depth-ordering behaviour remains unchanged.

Road and market geometry is still simulation-owned. The viewer samples the dirt
PNGs below the one-metre grid so path edges can be irregular and allow the grass
background to intrude naturally without changing navigation or feature width.

These files replace the active terrain, floor and fixture entries that previously
lived in `village-tiles.svg`.
