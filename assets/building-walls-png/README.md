# PNG wall geometry templates

These PNGs are active editable exterior wall geometry. They use the existing
medieval plaster, stone and timber artwork while keeping module composition
independent from simulation geometry.

The fixed scale is **32 art pixels = 1 simulation metre**. LPC's native 64×64
character frame is independent visual space and does not alter that scale.

| Asset | Canvas | Logical use |
| --- | ---: | --- |
| `wall_back_2m.png` | 64×64 | Visual source for sampled rear infill and shared timber posts |
| `wall_back_1m_left.png` | 32×64 | Original/reference 1 m left-post filler |
| `wall_back_1m_right.png` | 32×64 | Original/reference 1 m right-post filler |
| `wall_vertical_west.png` / `wall_vertical_east.png` | 32×96 | Separate 1 m exterior side projection: 64 px rise plus 32 px descending run |
| `wall_horizontal_cutaway.png` | 32×24 | Low one-metre screen-front exterior wall |
| `wall_horizontal.png` | 32×64 | Legacy one-metre full-height horizontal fallback |
| `wall-bay-composition-example.png` | 672×480 | Historical enlarged composition reference |

Exterior rear wall modules no longer each own both timber edges. The renderer
samples the interior of `wall_back_2m.png` as post-free 64 px or 32 px infill,
then samples one of that same PNG's timber edges as an 8×64 px shared post. One
post is centred at each building end and solid-solid module boundary, preventing
the former `post + post` join between adjacent 64 px bays.

Horizontal door sprites already contain their own timber jambs, so the renderer
does not place a shared wall post directly beside a doorway. Side sprites paint
first at rear corners and tuck behind the shared end post. No dedicated normal
L-corner PNG is required.

The wooden floor is a separate render layer using `../tiles-png/wood_floor.png`.
No floor pixels are part of or sampled into the wall artwork.

Internal walls remain separate placeholders under `../building-walls-internal/`,
while doors and doorway states remain one-metre entries in
`../village-building-walls.svg`. Open, closed and locked state rendering is
unchanged. Sprite canvas size, transparency and anchors may exceed the logical
footprint; none of these artwork dimensions change navigation geometry.
