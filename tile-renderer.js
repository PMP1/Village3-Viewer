const SOURCE_TILE_PIXELS = 32;
const MAX_VISIBLE_GROUND_TILES = 6000;
const ROOM_LABEL_MIN_SCALE = 10;

const TILE_IDS = Object.freeze({
    grass: "terrain.grass",
    grassAlt: "terrain.grass-alt",
    woodFloor: "building.floor.wood",
    wallHorizontal: "building.wall.stone-horizontal",
    wallVertical: "building.wall.stone-vertical",
    doorHorizontalOpen: "building.door.horizontal-open",
    doorHorizontalClosed: "building.door.horizontal-closed",
    doorHorizontalLocked: "building.door.horizontal-locked",
    doorVerticalOpen: "building.door.vertical-open",
    doorVerticalClosed: "building.door.vertical-closed",
    doorVerticalLocked: "building.door.vertical-locked"
});

const tileCanvases = new Map();
let deferRaisedEntityLabels = false;

function createTileCanvas(draw) {
    const tile = document.createElement("canvas");
    tile.width = SOURCE_TILE_PIXELS;
    tile.height = SOURCE_TILE_PIXELS;
    const tileContext = tile.getContext("2d");
    tileContext.imageSmoothingEnabled = false;
    draw(tileContext, SOURCE_TILE_PIXELS);
    return tile;
}

function drawGrassTile(tileContext, size, alternate = false) {
    tileContext.fillStyle = alternate ? "#315a35" : "#2b5231";
    tileContext.fillRect(0, 0, size, size);
    tileContext.fillStyle = alternate ? "#3f6840" : "#39623a";
    tileContext.fillRect(4, 7, 2, 3);
    tileContext.fillRect(22, 18, 2, 2);
    tileContext.fillRect(13, 27, 1, 2);
    tileContext.fillStyle = "rgba(17, 42, 24, 0.22)";
    tileContext.fillRect(0, size - 1, size, 1);
    tileContext.fillRect(size - 1, 0, 1, size);
}

function drawWoodFloorTile(tileContext, size) {
    tileContext.fillStyle = "#8a633f";
    tileContext.fillRect(0, 0, size, size);
    tileContext.strokeStyle = "#6e4b31";
    tileContext.lineWidth = 1;
    for (let y = 7; y < size; y += 8) {
        tileContext.beginPath();
        tileContext.moveTo(0, y + 0.5);
        tileContext.lineTo(size, y + 0.5);
        tileContext.stroke();
    }
    tileContext.fillStyle = "rgba(232, 194, 135, 0.12)";
    tileContext.fillRect(3, 2, 14, 2);
    tileContext.fillRect(17, 17, 11, 2);
}

function tileCanvas(tileId) {
    const cached = tileCanvases.get(tileId);
    if (cached) return cached;

    let tile;
    switch (tileId) {
        case TILE_IDS.grass:
            tile = createTileCanvas((tileContext, size) => drawGrassTile(tileContext, size, false));
            break;
        case TILE_IDS.grassAlt:
            tile = createTileCanvas((tileContext, size) => drawGrassTile(tileContext, size, true));
            break;
        case TILE_IDS.woodFloor:
            tile = createTileCanvas(drawWoodFloorTile);
            break;
        default:
            tile = createTileCanvas((tileContext, size) => {
                tileContext.fillStyle = "#ff00ff";
                tileContext.fillRect(0, 0, size, size);
            });
            break;
    }

    tileCanvases.set(tileId, tile);
    return tile;
}

function tileScreenRect(worldX, worldY, width, height, project) {
    const first = project({ x: worldX, y: worldY });
    const second = project({ x: worldX + width, y: worldY + height });
    const left = Math.min(first.x, second.x);
    const right = Math.max(first.x, second.x);
    const top = Math.min(first.y, second.y);
    const bottom = Math.max(first.y, second.y);
    return {
        x: Math.floor(left),
        y: Math.floor(top),
        width: Math.max(1, Math.ceil(right) - Math.floor(left) + 1),
        height: Math.max(1, Math.ceil(bottom) - Math.floor(top) + 1)
    };
}

function drawTile(tileId, worldX, worldY, project, width = 1, height = 1) {
    const rect = tileScreenRect(worldX, worldY, width, height, project);
    context.imageSmoothingEnabled = false;
    context.drawImage(tileCanvas(tileId), rect.x, rect.y, rect.width, rect.height);
}

function coordinateHash(x, y) {
    const hash = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
    return Math.abs(hash);
}

function visibleTileRange(project) {
    const bounds = visibleWorldBounds(project);
    return {
        minX: Math.floor(bounds.minX) - 1,
        maxX: Math.ceil(bounds.maxX) + 1,
        minY: Math.floor(bounds.minY) - 1,
        maxY: Math.ceil(bounds.maxY) + 1
    };
}

function groundTileStep(range) {
    const width = Math.max(1, range.maxX - range.minX + 1);
    const height = Math.max(1, range.maxY - range.minY + 1);
    const count = width * height;
    return Math.max(1, Math.ceil(Math.sqrt(count / MAX_VISIBLE_GROUND_TILES)));
}

function drawWorldTiles(project) {
    context.fillStyle = "#25492d";
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    const range = visibleTileRange(project);
    const step = groundTileStep(range);
    for (let y = range.minY; y <= range.maxY; y += step) {
        for (let x = range.minX; x <= range.maxX; x += step) {
            const alternate = coordinateHash(x, y) % 5 === 0;
            drawTile(alternate ? TILE_IDS.grassAlt : TILE_IDS.grass, x, y, project, step, step);
        }
    }

    if (project.scale < 11) return;
    context.save();
    context.strokeStyle = "rgba(14, 35, 20, 0.16)";
    context.lineWidth = 1;
    const fineRange = visibleTileRange(project);
    for (let x = fineRange.minX; x <= fineRange.maxX; x++) {
        const point = project({ x, y: 0 });
        context.beginPath();
        context.moveTo(Math.round(point.x) + 0.5, 0);
        context.lineTo(Math.round(point.x) + 0.5, canvasHeight);
        context.stroke();
    }
    for (let y = fineRange.minY; y <= fineRange.maxY; y++) {
        const point = project({ x: 0, y });
        context.beginPath();
        context.moveTo(0, Math.round(point.y) + 0.5);
        context.lineTo(canvasWidth, Math.round(point.y) + 0.5);
        context.stroke();
    }
    context.restore();
}

function drawBuildingFloor(footprint, project) {
    const minX = Math.floor(footprint.origin.x);
    const minY = Math.floor(footprint.origin.y);
    const maxX = Math.ceil(footprint.origin.x + footprint.width);
    const maxY = Math.ceil(footprint.origin.y + footprint.height);
    for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) drawTile(TILE_IDS.woodFloor, x, y, project);
    }
}

function buildingWallSegments(entity) {
    const footprint = rectangularFootprint(entity);
    if (!footprint || !window.VillageBuildingWalls) return [];
    return [
        ...window.VillageBuildingWalls.extractExterior(footprint),
        ...window.VillageBuildingWalls.extractInterior(footprint)
    ];
}

function drawBuildingGround(entity, project) {
    const footprint = rectangularFootprint(entity);
    if (!footprint) return false;
    drawBuildingFloor(footprint, project);
    return true;
}

function drawBuildingOverlay(entity, project) {
    const footprint = rectangularFootprint(entity);
    if (!footprint) return false;
    const selected = entity.id === selectedEntityId;
    if (selected) {
        const bounds = entityScreenBounds(entity, project);
        context.save();
        context.strokeStyle = "#f2cc60";
        context.lineWidth = 2.5;
        context.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
        context.restore();
    }

    const labelPoint = project({
        x: footprint.origin.x + footprint.width / 2,
        y: footprint.origin.y + footprint.height
    });
    context.save();
    context.font = "600 11px system-ui";
    context.fillStyle = selected ? "#f2cc60" : "#f0e6d2";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.shadowColor = "rgba(0, 0, 0, 0.8)";
    context.shadowBlur = 3;
    context.fillText(entity.label ?? entity.id, labelPoint.x, labelPoint.y - 5);
    context.restore();
    return true;
}

function drawBuildingTiles(entity, project) {
    if (!drawBuildingGround(entity, project)) return false;
    if (typeof drawBuildingSegments === "function") drawBuildingSegments(buildingWallSegments(entity), project);
    drawBuildingOverlay(entity, project);
    return true;
}

function drawRoomTileOverlay(entity, project) {
    const geometry = entity.geometry;
    if (geometry?.type !== "centered-rectangle") return false;
    const point = project(entity.position);
    const width = Math.max(3, geometry.width * project.scale);
    const height = Math.max(3, geometry.height * project.scale);
    const selected = entity.id === selectedEntityId;

    context.save();
    context.strokeStyle = selected ? "#f2cc60" : "rgba(240, 230, 210, 0.32)";
    context.lineWidth = selected ? 2 : 1;
    context.setLineDash([4, 4]);
    context.strokeRect(point.x - width / 2, point.y - height / 2, width, height);
    context.setLineDash([]);
    if (selected || project.scale >= ROOM_LABEL_MIN_SCALE) {
        context.font = "10px system-ui";
        context.fillStyle = selected ? "#f2cc60" : "rgba(240, 230, 210, 0.72)";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(entity.label ?? entity.id, point.x, point.y);
    }
    context.restore();
    return true;
}

function isRaisedDepthEntity(entity) {
    if (entity.category === "character") return true;
    return typeof fixtureTileId === "function" && Boolean(fixtureTileId(entity));
}

function raisedEntityDepth(item) {
    if (item.entity.category === "character") return item.point.y;
    return item.bounds?.bottom ?? item.point.y;
}

function wallSegmentDepth(segment, project) {
    const length = segment.length ?? 1;
    const first = project({ x: segment.x, y: segment.y });
    const second = segment.orientation === "vertical"
        ? project({ x: segment.x, y: segment.y + length })
        : project({ x: segment.x + length, y: segment.y });
    return Math.max(first.y, second.y);
}

function raisedItemPriority(item) {
    if (item.kind !== "wall") return 10;
    // On an exact ground-depth tie, walls/doors should cover physical objects.
    // Keep the existing wall tie behaviour too: vertical runs before horizontal joins.
    return item.segment.orientation === "horizontal" ? 30 : 20;
}

function raisedItemStableKey(item) {
    if (item.kind === "wall") {
        const segment = item.segment;
        return ["wall", segment.layer, segment.side, segment.x, segment.y, segment.role, segment.variant, segment.doorId].join(":");
    }
    return "entity:" + item.entity.id;
}

function compareRaisedRenderItems(a, b) {
    return a.depth - b.depth ||
        raisedItemPriority(a) - raisedItemPriority(b) ||
        raisedItemStableKey(a).localeCompare(raisedItemStableKey(b));
}

function raisedRenderItems(visibleItems, project) {
    const raised = [];
    for (const item of visibleItems) {
        if (item.entity.subtype === "building" && rectangularFootprint(item.entity)) {
            for (const segment of buildingWallSegments(item.entity)) {
                raised.push({ kind: "wall", segment, depth: wallSegmentDepth(segment, project) });
            }
        } else if (isRaisedDepthEntity(item.entity)) {
            raised.push({ kind: "entity", entity: item.entity, point: item.point, bounds: item.bounds, depth: raisedEntityDepth(item) });
        }
    }
    return raised.sort(compareRaisedRenderItems);
}

function drawRaisedEntityLabel(entity, project) {
    if (!shouldDrawLabel(entity, project)) return;
    const point = project(entity.position);
    const bounds = entityScreenBounds(entity, project);
    const selected = entity.id === selectedEntityId;
    context.save();
    context.font = entity.category === "character" ? "600 12px system-ui" : "11px system-ui";
    context.fillStyle = selected ? "#f2cc60" : entity.category === "character" ? "#f0f6fc" : "#f0e6d2";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.shadowColor = entity.category === "character" ? "rgba(0, 0, 0, 0.9)" : "rgba(0, 0, 0, 0.85)";
    context.shadowBlur = 3;
    context.fillText(entity.label ?? entity.id, point.x, (bounds?.top ?? point.y) - (entity.category === "character" ? 3 : 4));
    context.restore();
}

// Keep the simulation/view contract untouched: this layer consumes the existing
// metre-based view geometry and turns it into reusable one-metre visual tiles.
// Terrain/floor fallback canvases remain compatible with the original tile atlas.
// Wall and door artwork comes exclusively from the fixed building atlas.
drawGrid = function(project) {
    drawWorldTiles(project);
};

drawPhysicalBuilding = function(entity, project) {
    return drawBuildingTiles(entity, project);
};

const drawEntityBeforeTileRenderer = drawEntity;
drawEntity = function(entity, point, project) {
    if (entity.category === "room" && drawRoomTileOverlay(entity, project)) return;
    drawEntityBeforeTileRenderer(entity, point, project);
};

// The original viewer grouped all objects before all characters. Once sprites have
// height that makes otherwise-correct assets overlap incorrectly. Compose floors
// first, then sort raised walls/fixtures/characters by their screen-space ground
// contact, and finally draw labels/selection overlays above the physical artwork.
const renderMapBeforeTileRenderer = typeof renderMap === "function" ? renderMap : undefined;
if (renderMapBeforeTileRenderer) {
    renderMap = function() {
        if (!recording || !context || !cameraInitialised) return;
        if (typeof drawBuildingSegments !== "function" || !window.VillageBuildingWalls) {
            renderMapBeforeTileRenderer();
            return;
        }

        const frame = recording.frames[frameIndex];
        updateFollowCamera(frame);
        const project = projection();

        context.clearRect(0, 0, canvasWidth, canvasHeight);
        context.fillStyle = "#090d12";
        context.fillRect(0, 0, canvasWidth, canvasHeight);
        drawGrid(project);
        drawSelectedTrail(project);

        projectedEntities = frame.entities.map(entity => ({
            entity,
            point: project(entity.position),
            bounds: entityScreenBounds(entity, project)
        }));
        const visibleItems = projectedEntities.filter(onScreen);
        const buildingItems = visibleItems.filter(item => item.entity.subtype === "building" && rectangularFootprint(item.entity));

        // Floors are ground artwork and must not participate in occlusion sorting.
        for (const item of buildingItems) drawBuildingGround(item.entity, project);
        for (const item of visibleItems) drawMovementTarget(item.entity, item.point, project);

        // Area/debug overlays and other non-raised entities stay beneath physical sprites.
        for (const item of visibleItems) {
            if (buildingItems.includes(item) || isRaisedDepthEntity(item.entity)) continue;
            drawEntity(item.entity, item.point, project);
        }

        const raisedItems = raisedRenderItems(visibleItems, project);
        const raisedEntities = [];
        deferRaisedEntityLabels = true;
        try {
            for (const item of raisedItems) {
                if (item.kind === "wall") {
                    drawBuildingSegments([item.segment], project);
                } else {
                    drawEntity(item.entity, item.point, project);
                    raisedEntities.push(item.entity);
                }
            }
        } finally {
            deferRaisedEntityLabels = false;
        }

        // UI overlays do not take part in physical depth ordering.
        for (const item of buildingItems) drawBuildingOverlay(item.entity, project);
        for (const entity of raisedEntities) drawRaisedEntityLabel(entity, project);
    };
}

window.VillageTileRenderer = Object.freeze({
    sourceTilePixels: SOURCE_TILE_PIXELS,
    tileIds: TILE_IDS,
    isRaisedDepthEntity,
    raisedEntityDepth,
    wallSegmentDepth,
    compareRaisedRenderItems
});