// Fixed source rectangles and pixel anchors; 32 art pixels remain one world metre.
// Doors still use the legacy SVG atlas. Wall geometry now uses editable PNG templates.
const BUILDING_ATLAS_PATH = "./assets/village-building-walls.svg";
const BUILDING_WALL_PNG_DIRECTORY = "./assets/building-walls-png/";
const BUILDING_SPRITES = Object.freeze({
    "building.exterior.door.closed.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":384,"sourceY":0},
    "building.exterior.door.closed.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":64},
    "building.exterior.door.locked.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":416,"sourceY":0},
    "building.exterior.door.locked.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":32,"sourceY":64},
    "building.exterior.door.open.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":352,"sourceY":0},
    "building.exterior.door.open.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":480,"sourceY":0},
    "building.exterior.doorway.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":320,"sourceY":0},
    "building.exterior.doorway.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":448,"sourceY":0},
    "building.exterior.wall.corner.ne": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":96,"sourceY":0},
    "building.exterior.wall.corner.ne.cutaway": {"anchorX":0,"anchorY":12,"drawHeight":16,"drawWidth":32,"sourceHeight":16,"sourceWidth":32,"sourceX":192,"sourceY":128},
    "building.exterior.wall.corner.nw": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":64,"sourceY":0},
    "building.exterior.wall.corner.nw.cutaway": {"anchorX":0,"anchorY":12,"drawHeight":16,"drawWidth":32,"sourceHeight":16,"sourceWidth":32,"sourceX":160,"sourceY":128},
    "building.exterior.wall.corner.se": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":160,"sourceY":0},
    "building.exterior.wall.corner.sw": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":128,"sourceY":0},
    "building.exterior.wall.end.east": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":256,"sourceY":0},
    "building.exterior.wall.end.east.cutaway": {"anchorX":0,"anchorY":12,"drawHeight":16,"drawWidth":32,"sourceHeight":16,"sourceWidth":32,"sourceX":224,"sourceY":128},
    "building.exterior.wall.end.north": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":192,"sourceY":0},
    "building.exterior.wall.end.south": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":224,"sourceY":0},
    "building.exterior.wall.end.west": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":288,"sourceY":0},
    "building.exterior.wall.end.west.cutaway": {"anchorX":0,"anchorY":12,"drawHeight":16,"drawWidth":32,"sourceHeight":16,"sourceWidth":32,"sourceX":256,"sourceY":128},
    "building.exterior.wall.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":0,"sourceY":0},
    "building.exterior.wall.horizontal.cutaway": {"anchorX":0,"anchorY":12,"drawHeight":16,"drawWidth":32,"sourceHeight":16,"sourceWidth":32,"sourceX":128,"sourceY":128},
    "building.exterior.wall.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":32,"sourceY":0},
    "building.interior.door.closed.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":448,"sourceY":64},
    "building.interior.door.closed.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":64,"sourceY":128},
    "building.interior.door.locked.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":480,"sourceY":64},
    "building.interior.door.locked.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":96,"sourceY":128},
    "building.interior.door.open.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":416,"sourceY":64},
    "building.interior.door.open.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":32,"sourceY":128},
    "building.interior.doorway.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":384,"sourceY":64},
    "building.interior.doorway.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":128},
    "building.interior.wall.corner.ne": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":160,"sourceY":64},
    "building.interior.wall.corner.nw": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":128,"sourceY":64},
    "building.interior.wall.corner.se": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":224,"sourceY":64},
    "building.interior.wall.corner.sw": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":192,"sourceY":64},
    "building.interior.wall.end.east": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":320,"sourceY":64},
    "building.interior.wall.end.north": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":256,"sourceY":64},
    "building.interior.wall.end.south": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":288,"sourceY":64},
    "building.interior.wall.end.west": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":352,"sourceY":64},
    "building.interior.wall.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":64,"sourceY":64},
    "building.interior.wall.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":96,"sourceY":64}
});

const PNG_HORIZONTAL = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":0});
// Side walls need both their 1 m projected top strip and the visible inside face.
// West art sits wholly inside/east of the west boundary; east art mirrors it inside/west.
const PNG_VERTICAL_WEST = Object.freeze({"anchorX":0,"anchorY":32,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":0});
const PNG_VERTICAL_EAST = Object.freeze({"anchorX":32,"anchorY":32,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":0});
// In the north-up viewer, north/back corners extend their one-metre side arm down
// from the horizontal base; south/front corners extend their arm upward.
const PNG_CORNER_NORTH = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":96,"drawWidth":32,"sourceHeight":96,"sourceWidth":32,"sourceX":0,"sourceY":0});
const PNG_CORNER_SOUTH = Object.freeze({"anchorX":0,"anchorY":96,"drawHeight":96,"drawWidth":32,"sourceHeight":96,"sourceWidth":32,"sourceX":0,"sourceY":0});
const PNG_CUTAWAY = Object.freeze({"anchorX":0,"anchorY":24,"drawHeight":24,"drawWidth":32,"sourceHeight":24,"sourceWidth":32,"sourceX":0,"sourceY":0});
const PNG_CUTAWAY_NORTH = Object.freeze({"anchorX":0,"anchorY":24,"drawHeight":56,"drawWidth":32,"sourceHeight":56,"sourceWidth":32,"sourceX":0,"sourceY":0});
const PNG_CUTAWAY_SOUTH = Object.freeze({"anchorX":0,"anchorY":56,"drawHeight":56,"drawWidth":32,"sourceHeight":56,"sourceWidth":32,"sourceX":0,"sourceY":0});

const BUILDING_PNG_SPRITES = Object.freeze({
    "building.exterior.wall.horizontal": PNG_HORIZONTAL,
    "building.exterior.wall.horizontal.cutaway": PNG_CUTAWAY,
    "building.exterior.wall.vertical.west": PNG_VERTICAL_WEST,
    "building.exterior.wall.vertical.east": PNG_VERTICAL_EAST,
    "building.exterior.wall.corner.nw": PNG_CORNER_NORTH,
    "building.exterior.wall.corner.ne": PNG_CORNER_NORTH,
    "building.exterior.wall.corner.sw": PNG_CORNER_SOUTH,
    "building.exterior.wall.corner.se": PNG_CORNER_SOUTH,
    "building.exterior.wall.corner.nw.cutaway": PNG_CUTAWAY_NORTH,
    "building.exterior.wall.corner.ne.cutaway": PNG_CUTAWAY_NORTH,
    "building.exterior.wall.corner.sw.cutaway": PNG_CUTAWAY_SOUTH,
    "building.exterior.wall.corner.se.cutaway": PNG_CUTAWAY_SOUTH,
    "building.exterior.wall.end.east": PNG_HORIZONTAL,
    "building.exterior.wall.end.west": PNG_HORIZONTAL,
    "building.exterior.wall.end.east.cutaway": PNG_CUTAWAY,
    "building.exterior.wall.end.west.cutaway": PNG_CUTAWAY,
    "building.interior.wall.horizontal": PNG_HORIZONTAL,
    "building.interior.wall.vertical.west": PNG_VERTICAL_WEST,
    "building.interior.wall.vertical.east": PNG_VERTICAL_EAST,
    "building.interior.wall.corner.nw": PNG_CORNER_NORTH,
    "building.interior.wall.corner.ne": PNG_CORNER_NORTH,
    "building.interior.wall.corner.sw": PNG_CORNER_SOUTH,
    "building.interior.wall.corner.se": PNG_CORNER_SOUTH,
    "building.interior.wall.end.east": PNG_HORIZONTAL,
    "building.interior.wall.end.west": PNG_HORIZONTAL
});

const BUILDING_PNG_PATHS = Object.freeze({
    "building.exterior.wall.horizontal": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.exterior.wall.horizontal.cutaway": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal_cutaway.png",
    "building.exterior.wall.vertical.west": BUILDING_WALL_PNG_DIRECTORY + "wall_vertical_west.png",
    "building.exterior.wall.vertical.east": BUILDING_WALL_PNG_DIRECTORY + "wall_vertical_east.png",
    "building.exterior.wall.corner.nw": BUILDING_WALL_PNG_DIRECTORY + "corner_nw.png",
    "building.exterior.wall.corner.ne": BUILDING_WALL_PNG_DIRECTORY + "corner_ne.png",
    "building.exterior.wall.corner.sw": BUILDING_WALL_PNG_DIRECTORY + "corner_sw.png",
    "building.exterior.wall.corner.se": BUILDING_WALL_PNG_DIRECTORY + "corner_se.png",
    "building.exterior.wall.corner.nw.cutaway": BUILDING_WALL_PNG_DIRECTORY + "corner_nw_cutaway.png",
    "building.exterior.wall.corner.ne.cutaway": BUILDING_WALL_PNG_DIRECTORY + "corner_ne_cutaway.png",
    "building.exterior.wall.corner.sw.cutaway": BUILDING_WALL_PNG_DIRECTORY + "corner_sw_cutaway.png",
    "building.exterior.wall.corner.se.cutaway": BUILDING_WALL_PNG_DIRECTORY + "corner_se_cutaway.png",
    "building.exterior.wall.end.east": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.exterior.wall.end.west": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.exterior.wall.end.east.cutaway": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal_cutaway.png",
    "building.exterior.wall.end.west.cutaway": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal_cutaway.png",
    "building.interior.wall.horizontal": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.interior.wall.vertical.west": BUILDING_WALL_PNG_DIRECTORY + "wall_vertical_west.png",
    "building.interior.wall.vertical.east": BUILDING_WALL_PNG_DIRECTORY + "wall_vertical_east.png",
    "building.interior.wall.corner.nw": BUILDING_WALL_PNG_DIRECTORY + "corner_nw.png",
    "building.interior.wall.corner.ne": BUILDING_WALL_PNG_DIRECTORY + "corner_ne.png",
    "building.interior.wall.corner.sw": BUILDING_WALL_PNG_DIRECTORY + "corner_sw.png",
    "building.interior.wall.corner.se": BUILDING_WALL_PNG_DIRECTORY + "corner_se.png",
    "building.interior.wall.end.east": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.interior.wall.end.west": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png"
});

const BUILDING_RESOLVED_SPRITES = Object.freeze({ ...BUILDING_SPRITES, ...BUILDING_PNG_SPRITES });
const buildingAtlasImage = new Image();
const buildingPngImages = Object.create(null);
const buildingPngPaths = [...new Set(Object.values(BUILDING_PNG_PATHS))];
let pendingBuildingImages = buildingPngPaths.length + 1;
let buildingAtlasReady = false;
let buildingAtlasFailed = false;

function settleBuildingImage(failed = false) {
    if (failed) buildingAtlasFailed = true;
    pendingBuildingImages -= 1;
    if (pendingBuildingImages === 0 && !buildingAtlasFailed) {
        buildingAtlasReady = true;
        if (recording && cameraInitialised) renderMap();
    }
}

buildingAtlasImage.addEventListener("load", () => settleBuildingImage());
buildingAtlasImage.addEventListener("error", () => settleBuildingImage(true));
buildingAtlasImage.src = window.__VILLAGE_VIEWER_ASSETS__?.[BUILDING_ATLAS_PATH] ?? BUILDING_ATLAS_PATH;

for (const path of buildingPngPaths) {
    const image = new Image();
    buildingPngImages[path] = image;
    image.addEventListener("load", () => settleBuildingImage());
    image.addEventListener("error", () => settleBuildingImage(true));
    image.src = window.__VILLAGE_VIEWER_ASSETS__?.[path] ?? path;
}

function buildingSpriteRect(segment, sprite, project) {
    const base = project({ x: segment.x, y: segment.y });
    const scale = project.scale / SOURCE_TILE_PIXELS;
    const x = Math.round(base.x - sprite.anchorX * scale);
    const y = Math.round(base.y - sprite.anchorY * scale);
    // Snap both endpoints, so neighbouring sections share an edge at fractional zoom.
    return {
        x, y,
        width: Math.max(1, Math.round(base.x + (sprite.drawWidth - sprite.anchorX) * scale) - x),
        height: Math.max(1, Math.round(base.y + (sprite.drawHeight - sprite.anchorY) * scale) - y)
    };
}

function drawBuildingSegments(segments, project) {
    if (!buildingAtlasReady) return;
    context.imageSmoothingEnabled = false;
    for (const segment of window.VillageBuildingWalls.painterOrder(segments, project)) {
        const id = window.VillageBuildingWalls.spriteId(segment, project);
        const sprite = BUILDING_RESOLVED_SPRITES[id];
        if (!sprite) throw new Error("Missing building sprite for " + JSON.stringify(segment));
        const path = BUILDING_PNG_PATHS[id];
        const image = path ? buildingPngImages[path] : buildingAtlasImage;
        const rect = buildingSpriteRect(segment, sprite, project);
        context.drawImage(image,
            sprite.sourceX, sprite.sourceY, sprite.sourceWidth, sprite.sourceHeight,
            rect.x, rect.y, rect.width, rect.height);
    }
}

window.VillageBuildingAtlas = Object.freeze({
    source: BUILDING_ATLAS_PATH,
    imageSources: BUILDING_PNG_PATHS,
    sprites: BUILDING_RESOLVED_SPRITES,
    spriteRect: buildingSpriteRect,
    get ready() { return buildingAtlasReady; },
    get failed() { return buildingAtlasFailed; }
});
