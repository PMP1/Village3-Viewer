// Fixed source rectangles and pixel anchors; 32 art pixels remain one world metre.
// LPC's 64x64 character frame is visual space only. Doors remain one 32px metre.
// Doors still use the legacy SVG atlas. Wall geometry uses editable image templates.
const BUILDING_ATLAS_PATH = "./assets/village-building-walls.svg";
const BUILDING_WALL_PNG_DIRECTORY = "./assets/building-walls-png/";
const BUILDING_INTERNAL_WALL_DIRECTORY = "./assets/building-walls-internal/";
const EXTERIOR_BACK_WALL_PATH = BUILDING_WALL_PNG_DIRECTORY + "wall_back_2m.png";
const EXTERIOR_FRONT_STONE_WALL_PATH = BUILDING_WALL_PNG_DIRECTORY + "wall_front_stone_2m.png";
const EXTERIOR_FRONT_STONE_DOOR_PATH = "./assets/building-walls-front-stone.svg";
const BUILDING_SPRITES = Object.freeze({
    "building.exterior.door.closed.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":384,"sourceY":0},
    "building.exterior.door.closed.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":64},
    "building.exterior.door.locked.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":416,"sourceY":0},
    "building.exterior.door.locked.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":32,"sourceY":64},
    "building.exterior.door.open.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":352,"sourceY":0},
    "building.exterior.door.open.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":480,"sourceY":0},
    "building.exterior.doorway.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":320,"sourceY":0},
    "building.exterior.doorway.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":448,"sourceY":0},
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
    "building.interior.wall.end.east": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":320,"sourceY":64},
    "building.interior.wall.end.north": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":256,"sourceY":64},
    "building.interior.wall.end.south": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":288,"sourceY":64},
    "building.interior.wall.end.west": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":352,"sourceY":64},
    "building.interior.wall.horizontal": {"anchorX":0,"anchorY":40,"drawHeight":48,"drawWidth":32,"sourceHeight":48,"sourceWidth":32,"sourceX":64,"sourceY":64},
    "building.interior.wall.vertical": {"anchorX":16,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":96,"sourceY":64}
});

const PNG_HORIZONTAL = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":0});
// The exterior rear source tile is still the existing 64x64 artwork. The broad
// timber posts are sliced away from the panel and painted once on each structural
// boundary, so adjacent two-metre bays no longer produce post + post joins.
const PNG_EXTERIOR_BACK_WALL_2 = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":64,"sourceHeight":64,"sourceWidth":48,"sourceX":8,"sourceY":0});
const PNG_EXTERIOR_BACK_WALL_1 = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":16,"sourceY":0});
const PNG_EXTERIOR_BACK_POST = Object.freeze({"anchorX":4,"anchorY":64,"drawHeight":64,"drawWidth":8,"sourceHeight":64,"sourceWidth":8,"sourceX":0,"sourceY":0});
const PNG_EXTERIOR_FRONT_WALL_2 = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":64,"sourceHeight":64,"sourceWidth":48,"sourceX":8,"sourceY":0});
const PNG_EXTERIOR_FRONT_WALL_1 = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":16,"sourceY":0});
const PNG_EXTERIOR_FRONT_POST = Object.freeze({"anchorX":4,"anchorY":64,"drawHeight":64,"drawWidth":8,"sourceHeight":64,"sourceWidth":8,"sourceX":0,"sourceY":0});
const FRONT_STONE_DOORWAY = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":0});
const FRONT_STONE_DOOR_OPEN = Object.freeze({...FRONT_STONE_DOORWAY,"sourceX":32});
const FRONT_STONE_DOOR_CLOSED = Object.freeze({...FRONT_STONE_DOORWAY,"sourceX":64});
const FRONT_STONE_DOOR_LOCKED = Object.freeze({...FRONT_STONE_DOORWAY,"sourceX":96});
const PNG_BACK_WALL_2 = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":64,"sourceHeight":64,"sourceWidth":64,"sourceX":0,"sourceY":0});
const PNG_BACK_WALL_1 = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":64,"drawWidth":32,"sourceHeight":64,"sourceWidth":32,"sourceX":0,"sourceY":0});
// Side walls remain one-metre logical sections. Their 96 px canvas carries the
// 64 px rise plus the 32 px descending run, independently of horizontal bays.
const PNG_VERTICAL_WEST = Object.freeze({"anchorX":0,"anchorY":64,"drawHeight":96,"drawWidth":32,"sourceHeight":96,"sourceWidth":32,"sourceX":0,"sourceY":0});
const PNG_VERTICAL_EAST = Object.freeze({"anchorX":32,"anchorY":64,"drawHeight":96,"drawWidth":32,"sourceHeight":96,"sourceWidth":32,"sourceX":0,"sourceY":0});

const BUILDING_PNG_SPRITES = Object.freeze({
    "building.exterior.back.wall2.plain": PNG_EXTERIOR_BACK_WALL_2,
    "building.exterior.back.wall1.left": PNG_EXTERIOR_BACK_WALL_1,
    "building.exterior.back.wall1.right": PNG_EXTERIOR_BACK_WALL_1,
    "building.exterior.front.wall2.stone": PNG_EXTERIOR_FRONT_WALL_2,
    "building.exterior.front.wall1.left": PNG_EXTERIOR_FRONT_WALL_1,
    "building.exterior.front.wall1.right": PNG_EXTERIOR_FRONT_WALL_1,
    "building.exterior.front.doorway.horizontal": FRONT_STONE_DOORWAY,
    "building.exterior.front.door.open.horizontal": FRONT_STONE_DOOR_OPEN,
    "building.exterior.front.door.closed.horizontal": FRONT_STONE_DOOR_CLOSED,
    "building.exterior.front.door.locked.horizontal": FRONT_STONE_DOOR_LOCKED,
    "building.exterior.wall.horizontal": PNG_HORIZONTAL,
    "building.exterior.wall.vertical.west": PNG_VERTICAL_WEST,
    "building.exterior.wall.vertical.east": PNG_VERTICAL_EAST,
    "building.exterior.wall.end.east": PNG_HORIZONTAL,
    "building.exterior.wall.end.west": PNG_HORIZONTAL,
    "building.interior.wall.horizontal2.plain": PNG_BACK_WALL_2,
    "building.interior.wall.horizontal1.left": PNG_BACK_WALL_1,
    "building.interior.wall.horizontal1.right": PNG_BACK_WALL_1,
    "building.interior.wall.horizontal": PNG_HORIZONTAL,
    "building.interior.wall.vertical.west": PNG_VERTICAL_WEST,
    "building.interior.wall.vertical.east": PNG_VERTICAL_EAST,
    "building.interior.wall.end.east": PNG_HORIZONTAL,
    "building.interior.wall.end.west": PNG_HORIZONTAL
});

const BUILDING_PNG_PATHS = Object.freeze({
    "building.exterior.back.wall2.plain": EXTERIOR_BACK_WALL_PATH,
    "building.exterior.back.wall1.left": EXTERIOR_BACK_WALL_PATH,
    "building.exterior.back.wall1.right": EXTERIOR_BACK_WALL_PATH,
    "building.exterior.front.wall2.stone": EXTERIOR_FRONT_STONE_WALL_PATH,
    "building.exterior.front.wall1.left": EXTERIOR_FRONT_STONE_WALL_PATH,
    "building.exterior.front.wall1.right": EXTERIOR_FRONT_STONE_WALL_PATH,
    "building.exterior.front.doorway.horizontal": EXTERIOR_FRONT_STONE_DOOR_PATH,
    "building.exterior.front.door.open.horizontal": EXTERIOR_FRONT_STONE_DOOR_PATH,
    "building.exterior.front.door.closed.horizontal": EXTERIOR_FRONT_STONE_DOOR_PATH,
    "building.exterior.front.door.locked.horizontal": EXTERIOR_FRONT_STONE_DOOR_PATH,
    "building.exterior.wall.horizontal": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.exterior.wall.vertical.west": BUILDING_WALL_PNG_DIRECTORY + "wall_vertical_west.png",
    "building.exterior.wall.vertical.east": BUILDING_WALL_PNG_DIRECTORY + "wall_vertical_east.png",
    "building.exterior.wall.end.east": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.exterior.wall.end.west": BUILDING_WALL_PNG_DIRECTORY + "wall_horizontal.png",
    "building.interior.wall.horizontal2.plain": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_horizontal_2m.svg",
    "building.interior.wall.horizontal1.left": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_horizontal_1m_left.svg",
    "building.interior.wall.horizontal1.right": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_horizontal_1m_right.svg",
    "building.interior.wall.horizontal": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_horizontal_1m_right.svg",
    "building.interior.wall.vertical.west": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_vertical_west.svg",
    "building.interior.wall.vertical.east": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_vertical_east.svg",
    "building.interior.wall.end.east": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_horizontal_1m_right.svg",
    "building.interior.wall.end.west": BUILDING_INTERNAL_WALL_DIRECTORY + "wall_horizontal_1m_left.svg"
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

function exteriorHorizontalPanel(segment, face) {
    return segment.layer === "exterior" && segment.orientation === "horizontal" &&
        segment.face === face &&
        (segment.role === "wall-bay-2" || segment.role === "wall-filler-1");
}

function sharedHorizontalPostSegments(segments, face, role) {
    const posts = [];
    const sides = [...new Set(segments.filter(segment => exteriorHorizontalPanel(segment, face))
        .map(segment => segment.side))];
    for (const side of sides) {
        const run = segments
            .filter(segment => segment.layer === "exterior" && segment.orientation === "horizontal" &&
                segment.face === face && segment.side === side)
            .sort((a, b) => a.x - b.x);
        for (let index = 0; index < run.length; index++) {
            const segment = run[index];
            if (!exteriorHorizontalPanel(segment, face)) continue;
            const before = run[index - 1];
            const after = run[index + 1];
            // Doorway sprites own their jambs. Building ends and solid-solid
            // module boundaries receive exactly one shared post or stone pier.
            if (!before || exteriorHorizontalPanel(before, face)) {
                posts.push({ ...segment, x: segment.x, length: 0, role });
            }
            if (!after) {
                posts.push({ ...segment, x: segment.x + (segment.length ?? 1), length: 0, role });
            }
        }
    }
    return posts;
}

function sharedRearPostSegments(segments) {
    return sharedHorizontalPostSegments(segments, "rear", "shared-rear-post");
}

function sharedFrontPostSegments(segments) {
    return sharedHorizontalPostSegments(segments, "front", "shared-front-post");
}

function drawBuildingSegments(segments, project) {
    if (!buildingAtlasReady) return;
    context.imageSmoothingEnabled = false;
    const posts = [...sharedRearPostSegments(segments), ...sharedFrontPostSegments(segments)];
    for (const segment of window.VillageBuildingWalls.painterOrder([...segments, ...posts], project)) {
        const rearPost = segment.role === "shared-rear-post";
        const frontPost = segment.role === "shared-front-post";
        const sharedPost = rearPost || frontPost;
        const id = sharedPost ? undefined : window.VillageBuildingWalls.spriteId(segment, project);
        const sprite = rearPost
            ? PNG_EXTERIOR_BACK_POST
            : frontPost ? PNG_EXTERIOR_FRONT_POST : BUILDING_RESOLVED_SPRITES[id];
        if (!sprite) throw new Error("Missing building sprite for " + JSON.stringify(segment));
        const path = rearPost
            ? EXTERIOR_BACK_WALL_PATH
            : frontPost ? EXTERIOR_FRONT_STONE_WALL_PATH : BUILDING_PNG_PATHS[id];
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
    rearPostSource: EXTERIOR_BACK_WALL_PATH,
    rearPostSprite: PNG_EXTERIOR_BACK_POST,
    frontPostSource: EXTERIOR_FRONT_STONE_WALL_PATH,
    frontPostSprite: PNG_EXTERIOR_FRONT_POST,
    sharedRearPostSegments,
    sharedFrontPostSegments,
    spriteRect: buildingSpriteRect,
    get ready() { return buildingAtlasReady; },
    get failed() { return buildingAtlasFailed; }
});