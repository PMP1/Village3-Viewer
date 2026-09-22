# PNG wall geometry templates

These PNGs are active editable exterior wall sources. The fixed scale is
**32 art pixels = 1 simulation metre**; LPC's 64×64 animation frame does not
change that scale.

| Asset | Canvas | Logical use |
| --- | ---: | --- |
| `wall_back_2m.png` | 64×64 | Rear plaster/timber infill and shared timber posts |
| `wall_front_stone_2m.png` | 64×64 | Front stone infill and shared stone piers |
| `wall_back_1m_left.png` / `wall_back_1m_right.png` | 32×64 | Historical rear filler references |
| `wall_vertical_west.png` / `wall_vertical_east.png` | 32×96 | One-metre projected exterior side walls |
| `wall_horizontal.png` | 32×64 | Legacy horizontal fallback |
| `wall_horizontal_cutaway.png` | 32×24 | Retired front cutaway reference; not loaded |
| `wall-bay-composition-example.png` | 672×480 | Historical enlarged composition reference |

For both active 2 m sources, the renderer samples the central 48 px as post-free
64 px infill and samples an 8 px edge separately at each shared structural
boundary. One post or pier is painted at each building end and solid-solid join;
adjacent bays never draw doubled edges.

Front door and doorway states live in
`../building-walls-front-stone.svg`. Their stone jambs belong to the doorway,
so the renderer does not add a shared pier immediately beside them.

The wooden floor remains a separate layer in
`../tiles-png/wood_floor.png`. No floor pixels are part of either wall source.
Internal wall placeholders remain separate under
`../building-walls-internal/`.
