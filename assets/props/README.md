# Furniture sprites

These transparent PNGs are reusable home-furniture artwork for the raised-prop renderer:

- `home-hearth.png` → `fixture.hearth`
- `home-bed.png` → `fixture.bed`
- `home-dining-table.png` → `fixture.dining-table`
- `home-chair.png` → `fixture.dining-seat`

The source sprites use 64 pixels per metre, matching the current high-resolution environment art. The renderer scales each image to its metre-based visual bounds with smoothing disabled. The separate `tiles-png` furniture images remain 32×32 single-cell atlas sprites.
