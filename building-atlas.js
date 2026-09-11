// Fixed source rectangles and pixel anchors; 32 art pixels remain one world metre.
const BUILDING_ATLAS_PATH = "./assets/village-building-walls.svg";
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
const buildingAtlasImage = new Image();
let buildingAtlasReady = false;
let buildingAtlasFailed = false;
buildingAtlasImage.addEventListener("load", () => {
    buildingAtlasReady = true;
    if (recording && cameraInitialised) renderMap();
});
buildingAtlasImage.addEventListener("error", () => { buildingAtlasFailed = true; });
buildingAtlasImage.src = window.__VILLAGE_VIEWER_ASSETS__?.[BUILDING_ATLAS_PATH] ?? BUILDING_ATLAS_PATH;

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
    for (const segment of window.VillageBuildingWalls.painterOrder(segments)) {
        const sprite = BUILDING_SPRITES[window.VillageBuildingWalls.spriteId(segment)];
        if (!sprite) throw new Error("Missing building sprite for " + JSON.stringify(segment));
        const rect = buildingSpriteRect(segment, sprite, project);
        context.drawImage(buildingAtlasImage,
            sprite.sourceX, sprite.sourceY, sprite.sourceWidth, sprite.sourceHeight,
            rect.x, rect.y, rect.width, rect.height);
    }
}

window.VillageBuildingAtlas = Object.freeze({
    source: BUILDING_ATLAS_PATH, sprites: BUILDING_SPRITES, spriteRect: buildingSpriteRect,
    get ready() { return buildingAtlasReady; },
    get failed() { return buildingAtlasFailed; }
});
