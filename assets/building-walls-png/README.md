# PNG wall geometry templates

These PNGs are active editable exterior wall sources. The fixed world scale is
**32 rendered pixels = 1 simulation metre**; LPC's 64×64 animation frame does
not change that scale. Front modules use 64 source pixels per metre and render
into the same world area for more detail at close zoom.

| Asset | Canvas | Logical use |
| --- | ---: | --- |
| `wall_back_2m.png` | 64×64 | Historical rear-wall reference; no longer loaded |
| `wall_front_2m.png` | 128×128 | Front timber/plaster plain bay |
| `wall_front_window_2m.png` | 128×128 | Matching front bay with a deep lattice window |
| `wall_front_join_timber.png` | 16×114 | Narrow timber beam at internal solid-module joins |
| `wall_front_corner_stone.png` | 24×114 | Wider masonry pier at the two outer building corners |
| `wall_back_1m_left.png` / `wall_back_1m_right.png` | 32×64 | Historical rear filler references |
| `wall_vertical_west.png` / `wall_vertical_east.png` | 32×96 | One-metre projected exterior side walls |
| `wall_horizontal.png` | 32×64 | Legacy horizontal fallback |
| `wall_horizontal_cutaway.png` | 32×24 | Retired front cutaway reference; not loaded |
| `wall-bay-composition-example.png` | 672×480 | Historical enlarged composition reference |

For horizontal 2 m walls, the renderer samples the central 96 source pixels and
the 114 rows of visible artwork as a post-free 64-rendered-pixel infill. The final
14 transparent canvas rows are excluded so the visible stone base aligns with
the floor boundary. A dedicated 16×114 timber PNG marks solid-solid joins on
front, rear and downstairs internal runs. Separately loaded 24×114 stone PNGs
cap only true exterior building corners. The rear exterior and horizontal
downstairs partitions now reuse `wall_front_2m.png`; vertical side walls retain
their perspective-specific sources.

Front door and doorway states live in
`../building-walls-front.svg`. Their stone jambs belong to the doorway, so the
renderer does not add a shared post immediately beside them.

The wooden floor remains a separate layer in
`../tiles-png/wood_floor.png`. No floor pixels are part of either wall source.
Perspective-specific vertical internal wall sources remain under
`../building-walls-internal/`.
