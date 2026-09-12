# Internal wall dummy assets

These are intentionally simple, separate placeholders for internal wall rendering.
They use the same fixed scale as the rest of the viewer: **32 art pixels = 1
simulation metre**. Replacing these files later must not change navigation or room
geometry.

| Asset | Canvas | Logical use |
| --- | ---: | --- |
| `wall_horizontal_2m.svg` | 64×64 | Preferred 2 m internal horizontal bay |
| `wall_horizontal_1m_left.svg` | 32×64 | 1 m internal filler with a left/start post |
| `wall_horizontal_1m_right.svg` | 32×64 | 1 m internal filler with a right/end post |
| `wall_vertical_west.svg` | 32×96 | One-metre west-facing projected internal side wall |
| `wall_vertical_east.svg` | 32×96 | One-metre east-facing projected internal side wall |

Horizontal internal doors remain exactly one metre / 32 px and continue to use the
existing door atlas. A solid internal horizontal run is grouped into as many 2 m
bays as possible, with a 1 m filler where required. Vertical partitions remain
one-metre logical sections but now have their own placeholder artwork rather than
sharing exterior side-wall graphics.
