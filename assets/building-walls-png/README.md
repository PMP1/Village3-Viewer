# PNG wall geometry templates

These PNGs are the active editable wall geometry used by the viewer. Replace the
placeholder pixels later without changing the canvas dimensions or transparent
alignment unless the renderer metadata is updated at the same time.

The fixed scale is **32 art pixels = 1 world metre**.

| Asset | Canvas | Geometry |
| --- | ---: | --- |
| `wall_horizontal.png` | 32×64 | 1 m horizontal wall, 64 px maximum visible wall height |
| `wall_vertical.png` | 32×96 | 64 px wall height + 32 px (1 m) north/south projected run |
| `corner_nw.png` / `corner_ne.png` | 32×96 | L corner with the 1 m arm above the horizontal face |
| `corner_sw.png` / `corner_se.png` | 32×96 | L corner with the 1 m arm below the horizontal face |
| `wall_horizontal_cutaway.png` | 32×24 | Low/cutaway horizontal wall |
| `corner_*_cutaway.png` | 32×56 | 24 px cutaway height + 32 px (1 m) corner arm |

The corner files deliberately use an L-shaped placeholder so the orientation is
obvious while editing. The simple colours and 8 px placeholder thickness are not
an art-direction decision; only the transparent canvas size and arm direction are
part of this contract.

Wall straight sections, ends and corners resolve to these PNGs. Door and doorway
art remains in `../village-building-walls.svg` for now, so the PNG wall artwork can
be refined independently before the door art is replaced.
