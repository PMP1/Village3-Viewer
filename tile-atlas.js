const TILE_PNG_DIRECTORY = "./assets/tiles-png/";
const TILE_IMAGE_PATHS = new Map([
    [TILE_IDS.grass, TILE_PNG_DIRECTORY + "grass.png"],
    [TILE_IDS.grassAlt, TILE_PNG_DIRECTORY + "grass_alt.png"],
    [TILE_IDS.woodFloor, TILE_PNG_DIRECTORY + "wood_floor.png"],
    ["fixture.hearth", TILE_PNG_DIRECTORY + "hearth.png"],
    ["fixture.bed", TILE_PNG_DIRECTORY + "bed.png"],
    ["fixture.dining-table", TILE_PNG_DIRECTORY + "dining_table.png"],
    ["fixture.service-counter", TILE_PNG_DIRECTORY + "service_counter.png"]
]);

const tileImages = new Map();
const tileReady = new Set();
const tileFailed = new Set();

for (const [tileId, path] of TILE_IMAGE_PATHS) {
    const image = new Image();
    tileImages.set(tileId, image);
    image.addEventListener("load", () => {
        tileReady.add(tileId);
        if (recording && cameraInitialised) renderMap();
    });
    image.addEventListener("error", () => {
        tileFailed.add(tileId);
    });
    image.src = window.__VILLAGE_VIEWER_ASSETS__?.[path] ?? path;
}

function drawAtlasTile(tileId, worldX, worldY, project, width = 1, height = 1) {
    const image = tileImages.get(tileId);
    if (!image || !tileReady.has(tileId)) return false;
    const rect = tileScreenRect(worldX, worldY, width, height, project);
    context.imageSmoothingEnabled = false;
    context.drawImage(
        image,
        0,
        0,
        SOURCE_TILE_PIXELS,
        SOURCE_TILE_PIXELS,
        rect.x,
        rect.y,
        rect.width,
        rect.height
    );
    return true;
}

const drawTileBeforeAtlas = drawTile;
drawTile = function(tileId, worldX, worldY, project, width = 1, height = 1) {
    if (drawAtlasTile(tileId, worldX, worldY, project, width, height)) return;
    drawTileBeforeAtlas(tileId, worldX, worldY, project, width, height);
};

function fixtureTileId(entity) {
    if (entity.properties?.facilityType === "hearth") return "fixture.hearth";
    if (entity.properties?.resourceType === "bed") return "fixture.bed";
    if (entity.properties?.fixtureType === "dining-table") return "fixture.dining-table";
    if (entity.properties?.fixtureType === "service-counter") return "fixture.service-counter";
    return undefined;
}

function drawFixtureTile(entity, project, tileId) {
    const image = tileImages.get(tileId);
    if (!image || !tileReady.has(tileId)) return false;
    const bounds = entityScreenBounds(entity, project);
    if (!bounds) return false;

    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(
        image,
        0,
        0,
        SOURCE_TILE_PIXELS,
        SOURCE_TILE_PIXELS,
        Math.floor(bounds.left),
        Math.floor(bounds.top),
        Math.max(1, Math.ceil(bounds.right - bounds.left)),
        Math.max(1, Math.ceil(bounds.bottom - bounds.top))
    );

    if (entity.id === selectedEntityId) {
        context.strokeStyle = "#f2cc60";
        context.lineWidth = 2;
        context.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    }

    if (!deferRaisedEntityLabels && shouldDrawLabel(entity, project)) {
        const point = project(entity.position);
        context.font = "11px system-ui";
        context.fillStyle = entity.id === selectedEntityId ? "#f2cc60" : "#f0e6d2";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.shadowColor = "rgba(0, 0, 0, 0.85)";
        context.shadowBlur = 3;
        context.fillText(entity.label ?? entity.id, point.x, bounds.top - 4);
    }
    context.restore();
    return true;
}

const drawEntityBeforeAtlas = drawEntity;
drawEntity = function(entity, point, project) {
    const tileId = fixtureTileId(entity);
    if (tileId && drawFixtureTile(entity, project, tileId)) return;
    drawEntityBeforeAtlas(entity, point, project);
};

window.VillageTileAtlas = Object.freeze({
    source: TILE_PNG_DIRECTORY,
    sources: Object.freeze(Object.fromEntries(TILE_IMAGE_PATHS)),
    tileCount: TILE_IMAGE_PATHS.size,
    get ready() { return tileReady.size === TILE_IMAGE_PATHS.size; },
    get failed() { return tileFailed.size > 0; }
});