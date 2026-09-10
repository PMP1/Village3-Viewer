const TILE_ATLAS_PATH = "./assets/village-tiles.svg";
const TILE_ATLAS_COLUMNS = new Map([
    [TILE_IDS.grass, 0],
    [TILE_IDS.grassAlt, 1],
    [TILE_IDS.woodFloor, 2],
    [TILE_IDS.wallHorizontal, 3],
    [TILE_IDS.wallVertical, 4],
    [TILE_IDS.doorHorizontalOpen, 5],
    [TILE_IDS.doorHorizontalClosed, 6],
    [TILE_IDS.doorHorizontalLocked, 7],
    [TILE_IDS.doorVerticalOpen, 8],
    [TILE_IDS.doorVerticalClosed, 9],
    [TILE_IDS.doorVerticalLocked, 10],
    ["fixture.hearth", 11],
    ["fixture.bed", 12],
    ["fixture.dining-table", 13],
    ["fixture.service-counter", 14]
]);

const tileAtlasImage = new Image();
let tileAtlasReady = false;
let tileAtlasFailed = false;

tileAtlasImage.addEventListener("load", () => {
    tileAtlasReady = true;
    if (recording && cameraInitialised) renderMap();
});
tileAtlasImage.addEventListener("error", () => {
    tileAtlasFailed = true;
});
tileAtlasImage.src = window.__VILLAGE_VIEWER_ASSETS__?.[TILE_ATLAS_PATH] ?? TILE_ATLAS_PATH;

function drawAtlasTile(tileId, worldX, worldY, project, width = 1, height = 1) {
    const column = TILE_ATLAS_COLUMNS.get(tileId);
    if (!tileAtlasReady || column === undefined) return false;
    const rect = tileScreenRect(worldX, worldY, width, height, project);
    context.imageSmoothingEnabled = false;
    context.drawImage(
        tileAtlasImage,
        column * SOURCE_TILE_PIXELS,
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

function partitionDoorAtOffset(partition, offset) {
    return (partition.doors ?? []).find(door => offset >= door.offset && offset < door.offset + 1);
}

function drawPartitionTiles(footprint, project) {
    for (const partition of footprint.partitions ?? []) {
        const horizontal = partition.side === "north" || partition.side === "south";
        for (let offset = 0; offset < partition.length; offset++) {
            const door = partitionDoorAtOffset(partition, offset);
            const x = partition.origin.x + (horizontal ? offset : 0);
            const y = partition.origin.y + (horizontal ? 0 : offset);
            drawTile(
                door
                    ? doorTileId(partition.side, door.state)
                    : horizontal ? TILE_IDS.wallHorizontal : TILE_IDS.wallVertical,
                x,
                y,
                project
            );
        }
    }
}

const drawPhysicalBuildingBeforeAtlas = drawPhysicalBuilding;
drawPhysicalBuilding = function(entity, project) {
    const rendered = drawPhysicalBuildingBeforeAtlas(entity, project);
    if (!rendered) return false;
    const footprint = rectangularFootprint(entity);
    if (footprint) drawPartitionTiles(footprint, project);
    return true;
};

function fixtureTileId(entity) {
    if (entity.properties?.facilityType === "hearth") return "fixture.hearth";
    if (entity.properties?.resourceType === "bed") return "fixture.bed";
    if (entity.properties?.fixtureType === "dining-table") return "fixture.dining-table";
    if (entity.properties?.fixtureType === "service-counter") return "fixture.service-counter";
    return undefined;
}

function drawFixtureTile(entity, project, tileId) {
    if (!tileAtlasReady) return false;
    const bounds = entityScreenBounds(entity, project);
    if (!bounds) return false;
    const column = TILE_ATLAS_COLUMNS.get(tileId);
    if (column === undefined) return false;

    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(
        tileAtlasImage,
        column * SOURCE_TILE_PIXELS,
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

    if (shouldDrawLabel(entity, project)) {
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
    source: TILE_ATLAS_PATH,
    tileCount: TILE_ATLAS_COLUMNS.size,
    get ready() { return tileAtlasReady; },
    get failed() { return tileAtlasFailed; }
});
