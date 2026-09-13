# LPC character artwork credits

Village3 uses character layers from the Universal LPC Spritesheet Character Generator:

https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator

The four PNGs stored locally in `lpc/` are used under the **OGA-BY 3.0** option listed by their upstream definitions. They have not been redrawn or converted; Village3 composes the layers directly at runtime.

## Locally bundled layers

### `lpc/body-male-walk.png`

Upstream: `spritesheets/body/bodies/male/walk.png`

Authors credited upstream: bluecarrot16; JaidynReiman; Benjamin K. Smith (BenCreating); Evert; Eliza Wyatt (ElizaWy); TheraHedwig; MuffinElZangano; Durrani; Johannes Sjölund (wulax); Stephen Challener (Redshrike).

Sources include:
- https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles
- https://opengameart.org/content/lpc-medieval-fantasy-character-sprites
- https://opengameart.org/content/lpc-character-bases

### `lpc/head-human-male-walk.png`

Upstream: `spritesheets/head/heads/human/male/walk.png`

Authors credited upstream: bluecarrot16; Benjamin K. Smith (BenCreating); Stephen Challener (Redshrike).

Sources:
- https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles
- https://opengameart.org/content/lpc-character-bases

### `lpc/pants-male-walk.png`

Upstream: `spritesheets/legs/pants2/male/walk.png`

Authors credited upstream: JaidynReiman; ElizaWy; Bluecarrot16; Johannes Sjölund (wulax); Stephen Challener (Redshrike).

Sources:
- https://github.com/ElizaWy/LPC/tree/main/Characters/Clothing
- https://opengameart.org/content/lpc-expanded-sit-run-jump-more
- https://opengameart.org/content/lpc-expanded-pants

### `lpc/shirt-male-walk.png`

Upstream: `spritesheets/torso/clothes/shortsleeve/shortsleeve/male/walk.png`

Authors credited upstream: bluecarrot16; ElizaWy; JaidynReiman; Stephen Challener (Redshrike).

Sources include:
- https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles
- http://opengameart.org/content/lpc-revised-character-basics
- http://opengameart.org/content/lpc-clothing-updates
- https://github.com/ElizaWy/LPC/tree/main/Characters/Clothing
- https://opengameart.org/content/lpc-expanded-sit-run-jump-more
- https://opengameart.org/content/lpc-expanded-simple-shirts

## Additional appearance layers

The first appearance-customisation slice loads additional genuine LPC walk layers directly from the pinned upstream revision:

`553ba7562534cbf32e7d9a502660f569d6b26512`

This avoids mutable `master` URLs while the expanded wardrobe is still being selected. The exact upstream paths currently used are:

- `spritesheets/body/bodies/female/walk.png`
- `spritesheets/legs/pants/thin/walk.png`
- `spritesheets/torso/clothes/shortsleeve/shortsleeve/female/walk.png`
- `spritesheets/torso/aprons/apron/male/walk/white.png`
- `spritesheets/torso/aprons/apron/female/walk/white.png`
- `spritesheets/torso/clothes/vest/male/walk/brown.png`
- `spritesheets/head/heads/human/female/walk.png`
- `spritesheets/hair/balding/adult/walk.png`
- `spritesheets/hair/bedhead/adult/walk.png`
- `spritesheets/hair/bob/adult/walk.png`
- `spritesheets/hair/bob_side_part/adult/walk.png`
- `spritesheets/hair/bangslong/adult/walk.png`
- `spritesheets/hair/bangsshort/adult/walk.png`

Universal LPC contains artwork from multiple contributors and licenses. For the exact author, source, and licence metadata of each additional layer, see the corresponding upstream `sheet_definitions` entry and `CREDITS.csv` at the pinned revision. Those upstream attribution and licence notices remain applicable to the layers used by Village3.
