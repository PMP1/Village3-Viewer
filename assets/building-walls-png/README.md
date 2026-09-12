# PNG wall geometry templates

These PNGs are active editable wall geometry. They deliberately use simple colours
and obvious posts so module composition can be judged before final medieval pixel
art replaces them.

The fixed scale is **32 art pixels = 1 simulation metre**. LPC's native 64×64
character frame is independent visual space and does not alter that scale.

| Asset | Canvas | Logical use |
| --- | ---: | --- |
| `wall_back_2m.png` | 64×64 | Preferred 2 m rear bay: post, panel, post |
| `wall_back_1m_left.png` | 32×64 | 1 m filler: left/start post plus panel |
| `wall_back_1m_right.png` | 32×64 | 1 m filler: panel plus right/end post |
| `wall_vertical_west.png` / `wall_vertical_east.png` | 32×96 | Separate 1 m side projection: 64 px rise plus 32 px descending run |
| `wall_horizontal_cutaway.png` | 32×24 | Low one-metre screen-front wall |
| `wall_horizontal.png` | 32×64 | Existing one-metre horizontal artwork retained for interior compatibility |
| `wall-bay-composition-example.png` | 672×480 | Enlarged visual check of 2 m wall, 1 m door, 2 m wall with independent sides |

The back-wall bay supplies the normal rear corner post. Side sprites are anchored
against the same physical boundary and paint first, so their narrow projection
tucks behind the post. No dedicated normal L-corner PNG is required.

Door and doorway states remain one-metre entries in
`../village-building-walls.svg`. Open, closed and locked state rendering is
unchanged. Sprite canvas size, transparency and anchors may exceed the logical
footprint; none of these artwork dimensions change navigation geometry.
