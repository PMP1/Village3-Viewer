const TILE_PNG_DIRECTORY = "./assets/tiles-png/";
const PATH_DIRT_ALT_TILE_ID = "terrain.dirt-alt";
const PATH_OVERLAY_TILE_IDS = Object.freeze({
    center: "terrain.path.center",
    centerAlt: "terrain.path.center-alt",
    n: "terrain.path.n",
    ne: "terrain.path.ne",
    e: "terrain.path.e",
    se: "terrain.path.se",
    s: "terrain.path.s",
    sw: "terrain.path.sw",
    w: "terrain.path.w",
    nw: "terrain.path.nw"
});
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
    [TILE_IDS.dirt, TILE_PNG_DIRECTORY + "dirt.png"],
    [PATH_DIRT_ALT_TILE_ID, TILE_PNG_DIRECTORY + "dirt_alt.png"],
    [PATH_OVERLAY_TILE_IDS.center, TILE_PNG_DIRECTORY + "path_center.png"],
    [PATH_OVERLAY_TILE_IDS.centerAlt, TILE_PNG_DIRECTORY + "path_center_alt.png"],
    [PATH_OVERLAY_TILE_IDS.n, TILE_PNG_DIRECTORY + "path_n.png"],
    [PATH_OVERLAY_TILE_IDS.ne, TILE_PNG_DIRECTORY + "path_ne.png"],
    [PATH_OVERLAY_TILE_IDS.e, TILE_PNG_DIRECTORY + "path_e.png"],
    [PATH_OVERLAY_TILE_IDS.se, TILE_PNG_DIRECTORY + "path_se.png"],
    [PATH_OVERLAY_TILE_IDS.s, TILE_PNG_DIRECTORY + "path_s.png"],
    [PATH_OVERLAY_TILE_IDS.sw, TILE_PNG_DIRECTORY + "path_sw.png"],
    [PATH_OVERLAY_TILE_IDS.w, TILE_PNG_DIRECTORY + "path_w.png"],
    [PATH_OVERLAY_TILE_IDS.nw, TILE_PNG_DIRECTORY + "path_nw.png"],
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

function pathTileId(x, y) {
    return coordinateHash(x, y) % 4 === 0 ? PATH_DIRT_ALT_TILE_ID : TILE_IDS.dirt;
}

function pathCenterTileId(x, y) {
    return coordinateHash(x, y) % 4 === 0
        ? PATH_OVERLAY_TILE_IDS.centerAlt
        : PATH_OVERLAY_TILE_IDS.center;
}

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

function roadCenterlineCells(entity) {
    const points = entity.geometry?.type === "polyline" ? entity.geometry.points : [];
    const cells = new Set();
    if (points.length === 1) {
        cells.add(pathCellKey(Math.floor(points[0].x), Math.floor(points[0].y)));
        return cells;
    }
    for (let index = 1; index < points.length; index++) {
        for (const cell of rasterizeEightDirectionSegment(points[index - 1], points[index])) {
            cells.add(pathCellKey(cell.x, cell.y));
        }
    }
    return cells;
}

function pathVisualWidth(entity) {
    const width = Math.max(1, Math.round(entity.geometry?.width ?? 1));
    // An odd tile band stays centred on the eight-direction centreline. The
    // current four-metre village roads therefore render as a three-tile track,
    // closer to the classic RPG scale while leaving their simulation width alone.
    return width % 2 === 0 ? Math.max(1, width - 1) : width;
}

function roadPathCells(entity) {
    const centreline = roadCenterlineCells(entity);
    const radius = Math.floor(pathVisualWidth(entity) / 2);
    if (radius === 0) return centreline;

    const cells = new Set();
    for (const key of centreline) {
        const centre = parsePathCellKey(key);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                cells.add(pathCellKey(centre.x + dx, centre.y + dy));
            }
        }
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

function drawEightDirectionRoadTile(cells, x, y, project) {
    const connections = pathConnections(cells, x, y);
    if (connections.n && connections.e && connections.s && connections.w) {
        return drawTile(pathTileId(x, y), x, y, project);
    }

    if (!drawAtlasTile(pathCenterTileId(x, y), x, y, project)) return false;
    for (const neighbour of PATH_NEIGHBOURS) {
        if (!connections[neighbour.key]) continue;
        if (!drawAtlasTile(PATH_OVERLAY_TILE_IDS[neighbour.key], x, y, project)) return false;
    }
    return true;
}

function pathAssetsReady() {
    return tileReady.has(TILE_IDS.dirt) &&
        tileReady.has(PATH_DIRT_ALT_TILE_ID) &&
        Object.values(PATH_OVERLAY_TILE_IDS).every(tileId => tileReady.has(tileId));
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
                drawEightDirectionRoadTile(cells, x, y, project);
            } else {
                drawTile(pathTileId(x, y), x, y, project);
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

// Roads keep their objective metre-based polyline/width for simulation. The viewer
// rasterises that geometry onto an eight-connected tile line and composes PNG arms
// so the visible path follows the classic RPG horizontal/vertical/diagonal style.
drawGrid = function(project) {
    drawEightDirectionWorldTiles(project);
};

function fixtureTileId(entity) {
    // Prop/scenery-only ids deliberately do not have tile-atlas images. They make
    // those sprites participate in the existing raised-depth pass while their
    // dedicated renderers own visual sprite bounds and artwork.
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

    // Older recordings stored one entry per exceptional metre. Retain support so
    // saved/debug recordings remain viewable after the compact run format ships.
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

// Some focused viewer harnesses intentionally load the tile atlas without the
// map-feature renderer. Only decorate field drawing when that optional layer is
// present; ordinary tile and fixture atlas behaviour remains independently usable.
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
    pathOverlayTileIds: PATH_OVERLAY_TILE_IDS,
    tileCount: TILE_IMAGE_PATHS.size,
    rasterizeEightDirectionSegment,
    pathVisualWidth,
    pathCellsForFeature,
    pathConnections,
    pathTileId,
    get ready() { return tileReady.size === TILE_IMAGE_PATHS.size; },
    get failed() { return tileFailed.size > 0; }
});
