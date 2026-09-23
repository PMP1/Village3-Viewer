# Terrain, floor and fixture PNGs

These are the editable 32×32 pixel assets used by `viewer/tile-atlas.js`.

- `grass.png` → `terrain.grass`
- `grass_alt.png` → `terrain.grass-alt`
- `dirt.png` → `terrain.dirt`
- `dirt_alt.png` → alternate full dirt artwork used for market/interior path tiles
- `path_center.png` / `path_center_alt.png` → transparent dusty centre patches for road tiles
- `path_n.png`, `path_ne.png`, `path_e.png`, `path_se.png`, `path_s.png`, `path_sw.png`, `path_w.png`, `path_nw.png` → transparent directional dirt arms composed over grass
- `wood_floor.png` → `building.floor.wood`
- `hearth.png` → `fixture.hearth`
- `bed.png` → `fixture.bed`
- `dining_table.png` → `fixture.dining-table`
- `service_counter.png` → `fixture.service-counter`

Keep each canvas at exactly 32×32 pixels. Grass, dirt and floor tiles are opaque.
The directional path artwork is transparent outside the dusty track so the grass
underneath forms the path edge without requiring a separate green border colour.
Fixture artwork also keeps transparent pixels around the object so existing
footprint and depth-ordering behaviour remains unchanged.

Road and market geometry remains simulation-owned. For presentation, road
polylines are rasterised into an eight-connected tile line and widened to an odd,
centred tile band. The directional PNG arms then compose straight, diagonal,
corner, T-junction and crossing shapes. The current four-metre roads therefore
render as a three-tile-wide classic RPG path without changing navigation or the
objective road geometry. Market squares continue to use full dirt tiles.

These files replace the active terrain, floor and fixture entries that previously
lived in `village-tiles.svg`.
