# Terrain, floor and fixture PNGs

These are the editable terrain and fixture assets used by `viewer/tile-atlas.js`.

- `grass.png`, `grass_alt.png`, `grass_3.png`, `grass_4.png` → four varied meadow patches for `terrain.grass*`
- `wall_grass.png` through `wall_grass_4.png` → transparent 2m foundation foliage for plain exterior wall bays
- `dirt.png` → `terrain.dirt`
- `dirt_alt.png` → retained alternate full dirt artwork
- `path_autotiles.png` → 16×16 atlas of 256 finished 32×32 path sprites, indexed by the eight neighbouring path cells
- `market_cobble_autotiles.png` → 3×3 market overlay atlas with four corners, four edges and a solid infill
- `market_cobble_fill_2.png` and `market_cobble_fill_3.png` → two varied infill overlays
- `wood_floor.png` → `building.floor.wood`
- `hearth.png` → `fixture.hearth`
- `bed.png` → `fixture.bed`
- `dining_table.png` → `fixture.dining-table`
- `service_counter.png` → `fixture.service-counter`

The meadow uses four 128×128 pixel patches, each drawn over a 4×4m area at 32 rendered pixels per metre. Their layered green blades and leaf clusters vary without visible one-metre grid lines; rare tiny blooms add color sparingly. Four transparent 64×32 sprites form an irregular leafy fringe across eligible plain 2m front wall bays. Openings stay clear, and the decoration does not change collision or navigation. `path_autotiles.png`
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

Market squares draw the existing dirt autotile first, then a transparent
high-resolution cobble overlay. The 384×384 atlas contains nine 128×128 sprites
that each render to one 32×32 metre cell: four corners, four edges and one
solid infill. Loose flat stones sit over the same warm dirt, with transparent
packed-earth joints and a soft fade along exposed edges. Two additional 128×128
infill variants are chosen deterministically by world cell to reduce repetition.
The market footprint and ordinary road rendering remain unchanged.

The older `path_center*.png` and `path_[direction].png` files are legacy artwork
from the composited-arm experiment and are no longer loaded by the viewer.
