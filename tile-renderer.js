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

function drawStoneBand(tileContext, size, vertical) {
    tileContext.clearRect(0, 0, size, size);
    tileContext.fillStyle = "#88806f";
    if (vertical) tileContext.fillRect(8, 0, 16, size);
    else tileContext.fillRect(0, 8, size, 16);

    tileContext.fillStyle = "#a29a87";
    if (vertical) {
        for (let y = 1; y < size; y += 8) {
            const offset = Math.floor(y / 8) % 2 === 0 ? 0 : 5;
            tileContext.fillRect(10, y, 12, 5);
            tileContext.fillStyle = "#70695c";
            tileContext.fillRect(10, y + 5, 12, 1);
            tileContext.fillRect(15 + offset % 4, y, 1, 5);
            tileContext.fillStyle = "#a29a87";
        }
    } else {
        for (let x = 1; x < size; x += 8) {
            const offset = Math.floor(x / 8) % 2 === 0 ? 0 : 3;
            tileContext.fillRect(x, 10, 5, 12);
            tileContext.fillStyle = "#70695c";
            tileContext.fillRect(x + 5, 10, 1, 12);
            tileContext.fillRect(x, 15 + offset % 4, 5, 1);
            tileContext.fillStyle = "#a29a87";
        }
    }
}

function drawDoorTile(tileContext, size, vertical, state) {
    drawStoneBand(tileContext, size, vertical);
    const locked = state === "locked";
    const open = state === "open";
    const wood = locked ? "#9c4a3f" : "#8d5d35";
    const darkWood = locked ? "#642e29" : "#5d3c25";

    if (vertical) {
        tileContext.clearRect(8, 5, 16, size - 10);
        tileContext.fillStyle = darkWood;
        tileContext.fillRect(8, 4, 4, size - 8);
        tileContext.fillRect(20, 4, 4, size - 8);
        if (!open) {
            tileContext.fillStyle = wood;
            tileContext.fillRect(12, 6, 8, size - 12);
            tileContext.fillStyle = darkWood;
            tileContext.fillRect(14, 8, 1, size - 16);
        }
    } else {
        tileContext.clearRect(5, 8, size - 10, 16);
        tileContext.fillStyle = darkWood;
        tileContext.fillRect(4, 8, size - 8, 4);
        tileContext.fillRect(4, 20, size - 8, 4);
        if (!open) {
            tileContext.fillStyle = wood;
            tileContext.fillRect(6, 12, size - 12, 8);
            tileContext.fillStyle = darkWood;
            tileContext.fillRect(8, 14, size - 16, 1);
        }
    }
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
        case TILE_IDS.wallHorizontal:
            tile = createTileCanvas((tileContext, size) => drawStoneBand(tileContext, size, false));
            break;
        case TILE_IDS.wallVertical:
            tile = createTileCanvas((tileContext, size) => drawStoneBand(tileContext, size, true));
            break;
        case TILE_IDS.doorHorizontalOpen:
            tile = createTileCanvas((tileContext, size) => drawDoorTile(tileContext, size, false, "open"));
            break;
        case TILE_IDS.doorHorizontalClosed:
            tile = createTileCanvas((tileContext, size) => drawDoorTile(tileContext, size, false, "closed"));
            break;
        case TILE_IDS.doorHorizontalLocked:
            tile = createTileCanvas((tileContext, size) => drawDoorTile(tileContext, size, false, "locked"));
            break;
        case TILE_IDS.doorVerticalOpen:
            tile = createTileCanvas((tileContext, size) => drawDoorTile(tileContext, size, true, "open"));
            break;
        case TILE_IDS.doorVerticalClosed:
            tile = createTileCanvas((tileContext, size) => drawDoorTile(tileContext, size, true, "closed"));
            break;
        case TILE_IDS.doorVerticalLocked:
            tile = createTileCanvas((tileContext, size) => drawDoorTile(tileContext, size, true, "locked"));
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

function doorAtOffset(footprint, side, offset) {
    return (footprint.doors ?? []).find(door => door.side === side && offset >= door.offset && offset < door.offset + 1);
}

function doorTileId(side, state) {
    const vertical = side === "east" || side === "west";
    if (vertical) {
        if (state === "open") return TILE_IDS.doorVerticalOpen;
        if (state === "locked") return TILE_IDS.doorVerticalLocked;
        return TILE_IDS.doorVerticalClosed;
    }
    if (state === "open") return TILE_IDS.doorHorizontalOpen;
    if (state === "locked") return TILE_IDS.doorHorizontalLocked;
    return TILE_IDS.doorHorizontalClosed;
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

function drawBuildingHorizontalEdge(footprint, side, project) {
    const cellY = side === "north"
        ? footprint.origin.y
        : footprint.origin.y + footprint.height - 1;
    const cellCount = Math.ceil(footprint.width);
    for (let offset = 0; offset < cellCount; offset++) {
        const door = doorAtOffset(footprint, side, offset);
        drawTile(
            door ? doorTileId(side, door.state) : TILE_IDS.wallHorizontal,
            footprint.origin.x + offset,
            cellY,
            project
        );
    }
}

function drawBuildingVerticalEdge(footprint, side, project) {
    const cellX = side === "west"
        ? footprint.origin.x
        : footprint.origin.x + footprint.width - 1;
    const cellCount = Math.ceil(footprint.height);
    for (let offset = 0; offset < cellCount; offset++) {
        const door = doorAtOffset(footprint, side, offset);
        drawTile(
            door ? doorTileId(side, door.state) : TILE_IDS.wallVertical,
            cellX,
            footprint.origin.y + offset,
            project
        );
    }
}

function drawBuildingTiles(entity, project) {
    const footprint = rectangularFootprint(entity);
    if (!footprint) return false;

    drawBuildingFloor(footprint, project);
    drawBuildingHorizontalEdge(footprint, "north", project);
    drawBuildingHorizontalEdge(footprint, "south", project);
    drawBuildingVerticalEdge(footprint, "west", project);
    drawBuildingVerticalEdge(footprint, "east", project);

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

// Keep the simulation/view contract untouched: this layer consumes the existing
// metre-based view geometry and turns it into reusable one-metre visual tiles.
// The procedural tile canvases are intentionally behind semantic tile ids so a
// real tilesheet can replace them later without changing building/world logic.
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

window.VillageTileRenderer = Object.freeze({
    sourceTilePixels: SOURCE_TILE_PIXELS,
    tileIds: TILE_IDS
});
