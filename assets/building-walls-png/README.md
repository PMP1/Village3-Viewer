# PNG wall geometry templates

These PNGs are the active editable wall geometry used by the viewer. Replace the
placeholder pixels later without changing the canvas dimensions or transparent
alignment unless the renderer metadata is updated at the same time.

The fixed scale is **32 art pixels = 1 world metre**.

| Asset | Canvas | Geometry |
| --- | ---: | --- |
| `wall_horizontal.png` | 32×64 | 1 m horizontal wall, 64 px maximum visible wall height |
| `wall_vertical_west.png` / `wall_vertical_east.png` | 32×96 | 1 m north/south side-wall projection: 64 px visible wall face plus 32 px projected run; west/east stay narrow and are mirrored against their physical boundary |
| `corner_nw.png` / `corner_ne.png` | 32×96 | Back/north L corner: 64 px wall face with its 1 m side arm extending downward into the building side run |
| `corner_sw.png` / `corner_se.png` | 32×96 | Front/south L corner: 64 px wall face with its 1 m side arm extending upward into the building side run |
| `wall_horizontal_cutaway.png` | 32×24 | Low/cutaway horizontal wall |
| `corner_*_cutaway.png` | 32×56 | 24 px cutaway height + 32 px (1 m) corner arm, following the same north/south direction as the full corner |

The corner files deliberately use an L-shaped placeholder so the orientation is
obvious while editing. The simple colours and placeholder thickness are not an
art-direction decision; only the transparent canvas size and arm direction are
part of this contract.

The viewer derives which horizontal edge is front from the active projection, so
the cutaway stays on the screen-bottom wall even if the camera projection changes.
The opposite horizontal wall remains full height.

West and east side walls use separate artwork. They keep the same 32 px-wide
one-metre footprint as before, but their 96 px canvas now matches the full corner
height: a 64 px vertical face rises above the physical boundary and the final 32 px
continues the north/south projected wall run. The visible wall remains narrow rather
than projecting a full 32 px block into the room. Side-wall end segments use the
same west/east sprites; the L-corner is painted after them at the join, so its arm
caps the overlap cleanly.

Wall straight sections, ends and corners resolve to these PNGs. Door and doorway
art remains in `../village-building-walls.svg` for now, so the PNG wall artwork can
be refined independently before the door art is replaced.
