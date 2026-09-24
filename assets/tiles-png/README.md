# Terrain, floor and fixture PNGs

These are the editable terrain and fixture assets used by `viewer/tile-atlas.js`.

- `grass.png` → `terrain.grass`
- `grass_alt.png` → `terrain.grass-alt`
- `wall_grass.png` → sparse low grass tufts on plain exterior wall bays
- `dirt.png` → `terrain.dirt`
- `dirt_alt.png` → retained alternate full dirt artwork
- `path_autotiles.png` → 16×16 atlas of 256 finished 32×32 path sprites, indexed by the eight neighbouring path cells
- `wood_floor.png` → `building.floor.wood`
- `hearth.png` → `fixture.hearth`
- `bed.png` → `fixture.bed`
- `dining_table.png` → `fixture.dining-table`
- `service_counter.png` → `fixture.service-counter`

Ordinary terrain, floor, fixture and groundcover tiles remain 32×32 pixels. The grass tiles use gently varied green tones with scattered blades and rare tiny blooms. The transparent `wall_grass.png` sprite is depth-sorted just ahead of eligible plain front wall bays, kept away from doors, windows and nearby road/market cells, and never changes collision or navigation. `path_autotiles.png`
is a 512×512 atlas containing 256 finished 32×32 path sprites. The artwork uses
warm packed earth, fine dusty surface variation, small embedded pebbles and
subtle dirt-side edge shading. Its irregular transparent verges reveal the grass
beneath, with occasional tiny grass blades and flowers breaking into the track.

The viewer chooses a sprite using the existing eight-neighbour mask. It may
quarter-turn the equivalent mask art by world cell to vary the surface grain;
rotating the matching mask and sprite together preserves the path silhouette.
Road polylines and their widths remain simulation-owned. The viewer samples
rendered metre cells across each unchanged road width, which fills the gaps
between diagonal rows and keeps the visible dirt connected. This changes only
the rendered surface; routing, navigation, collision and the one-metre simulation
grid remain unchanged. The 32×32 sprite still renders at 32 pixels per metre.
Market squares continue to use full dirt tiles.

The older `path_center*.png` and `path_[direction].png` files are legacy artwork
from the composited-arm experiment and are no longer loaded by the viewer.
