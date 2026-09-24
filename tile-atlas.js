const TILE_PNG_DIRECTORY = "./assets/tiles-png/";
const PATH_AUTOTILE_TILE_ID = "terrain.path.autotiles";
const PATH_AUTOTILE_COLUMNS = 16;
const PATH_NEIGHBOURS = Object.freeze([
    Object.freeze({ key: "n", dx: 0, dy: -1 }),
    Object.freeze({ key: "ne", dx: 1, dy: -1 }),
    Object.freeze({ key: "e", dx: 1, dy: 0 }),
    Object.freeze({ key: "se", dx: 1, dy: 1 }),
    Object.freeze({ key: "s", dx: 0, dy: 1 }),
    Object.freeze({ key: "sw", dx: -1, dy: 1 }),
    Object.freeze({ key: "w", dx: -1, dy: 0 }),
    Object.freeze({ key: "nw", dx: -1, dy: -1 })
]);
const FIELD_TILE_IDS = Object.freeze({
    bare: "agriculture.field.bare",
    ploughed: "agriculture.field.ploughed",
    sown: "agriculture.field.sown",
    growing: "agriculture.field.growing",
    ripe: "agriculture.field.ripe",
    harvested: "agriculture.field.harvested",
    fallow: "agriculture.field.fallow"
});
const TILE_IMAGE_PATHS = new Map([
    [TILE_IDS.grass, TILE_PNG_DIRECTORY + "grass.png"],
    [TILE_IDS.grassAlt, TILE_PNG_DIRECTORY + "grass_alt.png"],
    [TILE_IDS.grassThird, TILE_PNG_DIRECTORY + "grass_3.png"],
    [TILE_IDS.grassFourth, TILE_PNG_DIRECTORY + "grass_4.png"],
    [TILE_IDS.groundCover, TILE_PNG_DIRECTORY + "wall_grass.png"],
    [TILE_IDS.groundCoverAlt, TILE_PNG_DIRECTORY + "wall_grass_2.png"],
    [TILE_IDS.groundCoverThird, TILE_PNG_DIRECTORY + "wall_grass_3.png"],
    [TILE_IDS.groundCoverFourth, TILE_PNG_DIRECTORY + "wall_grass_4.png"],
    [TILE_IDS.dirt, TILE_PNG_DIRECTORY + "dirt.png"],
    [PATH_AUTOTILE_TILE_ID, TILE_PNG_DIRECTORY + "path_autotiles.png"],
    [TILE_IDS.woodFloor, TILE_PNG_DIRECTORY + "wood_floor.png"],
    [FIELD_TILE_IDS.bare, TILE_PNG_DIRECTORY + "field_bare.png"],
    [FIELD_TILE_IDS.ploughed, TILE_PNG_DIRECTORY + "field_ploughed.png"],
    [FIELD_TILE_IDS.sown, TILE_PNG_DIRECTORY + "field_sown.png"],
    [FIELD_TILE_IDS.growing, TILE_PNG_DIRECTORY + "field_growing.png"],
    [FIELD_TILE_IDS.ripe, TILE_PNG_DIRECTORY + "field_ripe.png"],
    [FIELD_TILE_IDS.harvested, TILE_PNG_DIRECTORY + "field_harvested.png"],
    [FIELD_TILE_IDS.fallow, TILE_PNG_DIRECTORY + "field_fallow.png"],
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
    const usesNativeSize = tileId.startsWith("terrain.grass") || tileId.startsWith("terrain.wall-grass");
    const sourceWidth = usesNativeSize ? (image.naturalWidth || image.width || SOURCE_TILE_PIXELS) : SOURCE_TILE_PIXELS;
    const sourceHeight = usesNativeSize ? (image.naturalHeight || image.height || SOURCE_TILE_PIXELS) : SOURCE_TILE_PIXELS;
    context.drawImage(
        image,
        0,
        0,
        sourceWidth,
        sourceHeight,
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

function pathCellKey(x, y) {
    return `${x},${y}`;
}

function parsePathCellKey(key) {
    const comma = key.indexOf(",");
    return {
        x: Number(key.slice(0, comma)),
        y: Number(key.slice(comma + 1))
    };
}

function rasterizeEightDirectionSegment(start, end) {
    let x = Math.floor(start.x);
    let y = Math.floor(start.y);
    const targetX = Math.floor(end.x);
    const targetY = Math.floor(end.y);
    const dx = Math.abs(targetX - x);
    const sx = x < targetX ? 1 : -1;
    const dy = -Math.abs(targetY - y);
    const sy = y < targetY ? 1 : -1;
    let error = dx + dy;
    const cells = [];

    while (true) {
        cells.push({ x, y });
        if (x === targetX && y === targetY) break;
        const twiceError = 2 * error;
        if (twiceError >= dy) {
            error += dy;
            x += sx;
        }
        if (twiceError <= dx) {
            error += dx;
            y += sy;
        }
    }
    return cells;
}

function pathVisualWidth(entity) {
    const width = Math.max(1, Math.round(entity.geometry?.width ?? 1));
    return width % 2 === 0 ? Math.max(1, width - 1) : width;
}

function pointSegmentDistanceSquared(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) {
        const px = point.x - start.x;
        const py = point.y - start.y;
        return px * px + py * py;
    }
    const t = Math.max(0, Math.min(1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
    ));
    const closestX = start.x + t * dx;
    const closestY = start.y + t * dy;
    const px = point.x - closestX;
    const py = point.y - closestY;
    return px * px + py * py;
}

function addSegmentBandCells(cells, segmentCells, radius) {
    const start = segmentCells[0];
    const end = segmentCells[segmentCells.length - 1];
    const padding = Math.ceil(radius);
    const radiusSquared = radius * radius;

    // Fill every metre cell whose centre falls inside the unchanged road width.
    // This closes the empty checker gaps caused by parallel diagonal tile rows.
    for (const centre of segmentCells) {
        for (let y = centre.y - padding; y <= centre.y + padding; y++) {
            for (let x = centre.x - padding; x <= centre.x + padding; x++) {
                if (pointSegmentDistanceSquared({ x, y }, start, end) <= radiusSquared) {
                    cells.add(pathCellKey(x, y));
                }
            }
        }
    }
}

function roadPathCells(entity) {
    const points = entity.geometry?.type === "polyline" ? entity.geometry.points : [];
    const cells = new Set();
    if (points.length === 0) return cells;

    const radius = pathVisualWidth(entity) / 2;
    if (points.length === 1) {
        const x = Math.floor(points[0].x);
        const y = Math.floor(points[0].y);
        cells.add(pathCellKey(x, y));
        for (let offset = 1; offset <= radius; offset++) {
            cells.add(pathCellKey(x + offset, y));
            cells.add(pathCellKey(x - offset, y));
        }
        return cells;
    }

    for (let index = 1; index < points.length; index++) {
        const segmentCells = rasterizeEightDirectionSegment(points[index - 1], points[index]);
        addSegmentBandCells(cells, segmentCells, radius);
    }
    return cells;
}

function marketPathCells(entity) {
    const cells = new Set();
    const range = mapFeatureTileRange(entity);
    if (!range) return cells;
    for (let y = range.minY; y <= range.maxY; y++) {
        for (let x = range.minX; x <= range.maxX; x++) {
            if (mapFeatureCoversTile(entity, x, y)) cells.add(pathCellKey(x, y));
        }
    }
    return cells;
}

function pathCellsForFeature(entity) {
    if (entity.subtype === "road" && entity.geometry?.type === "polyline") {
        return roadPathCells(entity);
    }
    if (entity.subtype === "market-square" && entity.geometry?.type === "polygon") {
        return marketPathCells(entity);
    }
    return new Set();
}

function pathConnections(cells, x, y) {
    return Object.freeze(Object.fromEntries(PATH_NEIGHBOURS.map(neighbour => [
        neighbour.key,
        cells.has(pathCellKey(x + neighbour.dx, y + neighbour.dy))
    ])));
}

function pathNeighbourMask(cells, x, y) {
    let mask = 0;
    for (let index = 0; index < PATH_NEIGHBOURS.length; index++) {
        const neighbour = PATH_NEIGHBOURS[index];
        if (cells.has(pathCellKey(x + neighbour.dx, y + neighbour.dy))) {
            mask |= 1 << index;
        }
    }
    return mask;
}

function rotatePathMask(mask, quarterTurns) {
    const shift = ((quarterTurns % 4) + 4) % 4 * 2;
    return shift === 0 ? mask : ((mask << shift) | (mask >> (8 - shift))) & 0xff;
}

function pathTextureRotation(x, y) {
    return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0 & 3;
}

function drawPathAutotile(cells, x, y, project) {
    const image = tileImages.get(PATH_AUTOTILE_TILE_ID);
    if (!image || !tileReady.has(PATH_AUTOTILE_TILE_ID)) return false;

    const mask = pathNeighbourMask(cells, x, y);
    const rotation = pathTextureRotation(x, y);
    const sourceMask = rotatePathMask(mask, rotation);
    const sourceX = (sourceMask % PATH_AUTOTILE_COLUMNS) * SOURCE_TILE_PIXELS;
    const sourceY = Math.floor(sourceMask / PATH_AUTOTILE_COLUMNS) * SOURCE_TILE_PIXELS;
    const rect = tileScreenRect(x, y, 1, 1, project);

    context.imageSmoothingEnabled = false;
    if (rotation === 0) {
        context.drawImage(
            image,
            sourceX,
            sourceY,
            SOURCE_TILE_PIXELS,
            SOURCE_TILE_PIXELS,
            rect.x,
            rect.y,
            rect.width,
            rect.height
        );
    } else {
        // The rotated neighbour mask gives the same silhouette after the
        // art is transformed back, while changing the substrate grain phase.
        context.save();
        context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
        context.rotate(-rotation * Math.PI / 2);
        context.drawImage(
            image,
            sourceX,
            sourceY,
            SOURCE_TILE_PIXELS,
            SOURCE_TILE_PIXELS,
            -rect.width / 2,
            -rect.height / 2,
            rect.width,
            rect.height
        );
        context.restore();
    }
    return true;
}

function pathAssetsReady() {
    return tileReady.has(TILE_IDS.dirt) && tileReady.has(PATH_AUTOTILE_TILE_ID);
}

function drawEightDirectionMapFeatureGroundTiles(project) {
    if (!pathAssetsReady()) {
        drawMapFeatureGroundTiles(project);
        return;
    }

    const frame = recording?.frames?.[frameIndex];
    if (!frame) return;
    const visible = visibleTileRange(project);

    for (const entity of frame.entities) {
        if (entity.category !== "map-feature" || (entity.subtype !== "road" && entity.subtype !== "market-square")) continue;
        const cells = pathCellsForFeature(entity);
        for (const key of cells) {
            const { x, y } = parsePathCellKey(key);
            if (x < visible.minX || x > visible.maxX || y < visible.minY || y > visible.maxY) continue;
            if (entity.subtype === "road") {
                drawPathAutotile(cells, x, y, project);
            } else {
                drawTile(TILE_IDS.dirt, x, y, project);
            }
        }
    }
}

function drawEightDirectionWorldTiles(project) {
    context.fillStyle = "#315b35";
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    const range = visibleTileRange(project);
    const step = groundTileStep(range);
    for (let y = range.minY; y <= range.maxY; y += step) {
        for (let x = range.minX; x <= range.maxX; x += step) {
            const alternate = coordinateHash(x, y) % 5 === 0;
            drawTile(alternate ? TILE_IDS.grassAlt : TILE_IDS.grass, x, y, project, step, step);
        }
    }

    drawEightDirectionMapFeatureGroundTiles(project);
}

// Simulation roads keep their objective polyline and width. Only the visible
// presentation is rasterised to eight-connected metre cells. Cell centres within
// the unchanged displayed width are filled so diagonal runs stay continuous;
// neighbour-mask autotiles supply the irregular grass/dirt boundary.
drawGrid = function(project) {
    drawEightDirectionWorldTiles(project);
};

function fixtureTileId(entity) {
    if (entity.subtype === "cart") return "fixture.cart";
    if (entity.subtype === "tree") return "scenery.tree";
    if (entity.properties?.facilityType === "hearth") return "fixture.hearth";
    if (entity.properties?.resourceType === "bed") return "fixture.bed";
    if (entity.properties?.resourceType === "dining-seat") return "fixture.dining-seat";
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

function fieldTileIdForState(state) {
    return typeof state === "string" && FIELD_TILE_IDS[state]
        ? FIELD_TILE_IDS[state]
        : FIELD_TILE_IDS.bare;
}

function fieldTileFallbackState(entity) {
    if (typeof entity.agriculture?.defaultTileState === "string") {
        return entity.agriculture.defaultTileState;
    }
    return typeof entity.properties?.fieldTileState === "string"
        ? entity.properties.fieldTileState
        : "bare";
}

function fieldTileStateLookup(entity) {
    const states = new Map();

    for (const tile of entity.agriculture?.tileStates ?? []) {
        states.set(`${tile.x},${tile.y}`, tile.state);
    }

    const orientation = entity.agriculture?.runOrientation ?? "north-south";
    for (const run of entity.agriculture?.tileRuns ?? []) {
        for (let offset = 0; offset < run.length; offset++) {
            const x = run.x + (orientation === "east-west" ? offset : 0);
            const y = run.y + (orientation === "north-south" ? offset : 0);
            states.set(`${x},${y}`, run.state);
        }
    }
    return states;
}

if (typeof drawFieldTiles === "function" && typeof mapFeaturePointInPolygon === "function") {
    const drawFieldTilesBeforeAtlas = drawFieldTiles;
    drawFieldTiles = function drawFieldTilesFromAtlas(entity, project, selected) {
        const points = entity.geometry?.points ?? [];
        if (points.length === 0) return;

        const stateLookup = fieldTileStateLookup(entity);
        const fallbackState = fieldTileFallbackState(entity);
        const requiredTileIds = new Set([
            fieldTileIdForState(fallbackState),
            ...[...stateLookup.values()].map(fieldTileIdForState)
        ]);
        if ([...requiredTileIds].some(tileId => !tileReady.has(tileId))) {
            drawFieldTilesBeforeAtlas(entity, project, selected);
        }

        const xs = points.map(point => point.x);
        const ys = points.map(point => point.y);
        const minX = Math.floor(Math.min(...xs));
        const maxX = Math.ceil(Math.max(...xs)) - 1;
        const minY = Math.floor(Math.min(...ys));
        const maxY = Math.ceil(Math.max(...ys)) - 1;

        context.imageSmoothingEnabled = false;
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (!mapFeaturePointInPolygon({ x: x + 0.5, y: y + 0.5 }, points)) continue;
                const state = stateLookup.get(`${x},${y}`) ?? fallbackState;
                drawAtlasTile(fieldTileIdForState(state), x, y, project);
            }
        }

        const screenPoints = points.map(project);
        context.beginPath();
        context.moveTo(screenPoints[0].x, screenPoints[0].y);
        for (const point of screenPoints.slice(1)) context.lineTo(point.x, point.y);
        context.closePath();
        context.strokeStyle = selected ? "#f2cc60" : "rgba(174, 131, 76, 0.9)";
        context.lineWidth = selected ? 2.5 : 1.2;
        context.stroke();
    };
}

window.VillageTileAtlas = Object.freeze({
    source: TILE_PNG_DIRECTORY,
    sources: Object.freeze(Object.fromEntries(TILE_IMAGE_PATHS)),
    fieldTileIds: FIELD_TILE_IDS,
    pathAutotileId: PATH_AUTOTILE_TILE_ID,
    tileCount: TILE_IMAGE_PATHS.size,
    rasterizeEightDirectionSegment,
    pathVisualWidth,
    roadPathCells,
    pathCellsForFeature,
    pathConnections,
    pathNeighbourMask,
    rotatePathMask,
    pathTextureRotation,
    get ready() { return tileReady.size === TILE_IMAGE_PATHS.size; },
    get failed() { return tileFailed.size > 0; }
});
