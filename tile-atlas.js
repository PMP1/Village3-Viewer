const TILE_PNG_DIRECTORY = "./assets/tiles-png/";
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
    for (const tile of entity.agriculture?.tileStates ?? []) {
        states.set(`${tile.x},${tile.y}`, tile.state);
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
    tileCount: TILE_IMAGE_PATHS.size,
    get ready() { return tileReady.size === TILE_IMAGE_PATHS.size; },
    get failed() { return tileFailed.size > 0; }
});
