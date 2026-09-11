# PNG wall geometry templates

These PNGs are the active editable wall geometry used by the viewer. Replace the
placeholder pixels later without changing the canvas dimensions or transparent
alignment unless the renderer metadata is updated at the same time.

The fixed scale is **32 art pixels = 1 world metre**.

| Asset | Canvas | Geometry |
| --- | ---: | --- |
| `wall_horizontal.png` | 32×64 | 1 m horizontal wall, 64 px maximum visible wall height |
| `wall_vertical.png` | 32×32 | 1 m north/south projected wall strip; wall height is not baked into each side segment |
| `corner_nw.png` / `corner_ne.png` | 32×96 | Back/north L corner: 64 px wall face with its 1 m side arm extending downward into the building side run |
| `corner_sw.png` / `corner_se.png` | 32×96 | Front/south L corner: 64 px wall face with its 1 m side arm extending upward into the building side run |
| `wall_horizontal_cutaway.png` | 32×24 | Low/cutaway horizontal wall |
| `corner_*_cutaway.png` | 32×56 | 24 px cutaway height + 32 px (1 m) corner arm, following the same north/south direction as the full corner |

The corner files deliberately use an L-shaped placeholder so the orientation is
obvious while editing. The simple colours and placeholder thickness are not an
art-direction decision; only the transparent canvas size and arm direction are
part of this contract.

The viewer is north-up: simulation north (decreasing world Y) is at the top of
the screen, while south is at the bottom/front. The fixed cutaway is therefore
applied to the exterior south/front wall. The north/back wall remains full height.

Exterior L corners own the first and last metre of their adjoining north/south
side wall. Those side-end segments therefore render transparently rather than
drawing a second copy over the corner arm. Interior partition ends continue to
use the normal 32×32 side-wall strip because they do not have exterior L corners.

Wall straight sections, ends and corners resolve to these PNGs. Door and doorway
art remains in `../village-building-walls.svg` for now, so the PNG wall artwork can
be refined independently before the door art is replaced.
