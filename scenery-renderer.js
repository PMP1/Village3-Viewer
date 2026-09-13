(() => {
    const TREE_ASSET_PATH = "./assets/scenery/tree.svg";
    const TREE_VISUAL_WIDTH_METRES = 2.4;
    const TREE_VISUAL_HEIGHT_METRES = 3.2;
    const DECORATION_MIN_SCALE = 7;
    const MAX_VISIBLE_DECORATION_TILES = 4500;

    const treeImage = new Image();
    let treeReady = false;
    let treeFailed = false;
    treeImage.addEventListener("load", () => {
        treeReady = true;
        if (recording && cameraInitialised) renderMap();
    });
    treeImage.addEventListener("error", () => {
        treeFailed = true;
    });
    treeImage.src = window.__VILLAGE_VIEWER_ASSETS__?.[TREE_ASSET_PATH] ?? TREE_ASSET_PATH;

    function isWorldSceneryEntity(entity) {
        return entity?.subtype === "tree";
    }

    function treePhysicalScreenBounds(entity, project) {
        const geometry = entity.geometry;
        if (geometry?.type === "centered-rectangle") {
            const halfWidth = geometry.width / 2;
            const halfHeight = geometry.height / 2;
            const first = project({ x: entity.position.x - halfWidth, y: entity.position.y - halfHeight });
            const second = project({ x: entity.position.x + halfWidth, y: entity.position.y + halfHeight });
            return {
                left: Math.min(first.x, second.x),
                right: Math.max(first.x, second.x),
                top: Math.min(first.y, second.y),
                bottom: Math.max(first.y, second.y)
            };
        }
        const point = project(entity.position);
        const half = Math.max(2, project.scale * 0.5);
        return {
            left: point.x - half,
            right: point.x + half,
            top: point.y - half,
            bottom: point.y + half
        };
    }

    function treeSpriteBounds(entity, project) {
        if (!isWorldSceneryEntity(entity)) return undefined;
        const physical = treePhysicalScreenBounds(entity, project);
        const width = Math.max(8, TREE_VISUAL_WIDTH_METRES * project.scale);
        const height = Math.max(10, TREE_VISUAL_HEIGHT_METRES * project.scale);
        const centreX = (physical.left + physical.right) / 2;
        return {
            left: centreX - width / 2,
            right: centreX + width / 2,
            top: physical.bottom - height,
            bottom: physical.bottom,
            width,
            height,
            physical
        };
    }

    function drawTreeSelection(entity, bounds) {
        if (entity.id !== selectedEntityId) return;
        const physical = bounds.physical;
        context.save();
        context.strokeStyle = "#f2cc60";
        context.lineWidth = 2;
        context.strokeRect(
            Math.round(physical.left),
            Math.round(physical.top),
            Math.max(1, Math.round(physical.right - physical.left)),
            Math.max(1, Math.round(physical.bottom - physical.top))
        );
        context.restore();
    }

    function drawWorldSceneryEntity(entity, project) {
        if (!isWorldSceneryEntity(entity) || !treeReady) return false;
        const bounds = treeSpriteBounds(entity, project);
        if (!bounds) return false;
        context.save();
        context.imageSmoothingEnabled = false;
        context.drawImage(
            treeImage,
            Math.round(bounds.left),
            Math.round(bounds.top),
            Math.max(1, Math.round(bounds.width)),
            Math.max(1, Math.round(bounds.height))
        );
        context.restore();
        drawTreeSelection(entity, bounds);
        return true;
    }

    function hash32(x, y, salt = 0) {
        let value = Math.imul(x + 0x9e3779b9, 73856093) ^ Math.imul(y - 0x7f4a7c15, 19349663) ^ Math.imul(salt + 17, 83492791);
        value ^= value >>> 16;
        value = Math.imul(value, 0x45d9f3b);
        value ^= value >>> 16;
        return value >>> 0;
    }

    function hashUnit(x, y, salt = 0) {
        return hash32(x, y, salt) / 0xffffffff;
    }

    function pointInPolygon(point, points) {
        let inside = false;
        for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
            const a = points[current];
            const b = points[previous];
            const crosses = (a.y > point.y) !== (b.y > point.y) &&
                point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
            if (crosses) inside = !inside;
        }
        return inside;
    }

    function pointToSegmentDistanceSquared(point, start, end) {
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

    function mapFeatureContainsPoint(entity, point) {
        const geometry = entity.geometry;
        if (geometry?.type === "polygon") return pointInPolygon(point, geometry.points ?? []);
        if (geometry?.type === "polyline") {
            const radius = Math.max(0, geometry.width ?? 0) / 2;
            const radiusSquared = radius * radius;
            const points = geometry.points ?? [];
            for (let index = 1; index < points.length; index++) {
                if (pointToSegmentDistanceSquared(point, points[index - 1], points[index]) <= radiusSquared) return true;
            }
            return false;
        }
        if (geometry?.type === "centered-rectangle") {
            return Math.abs(point.x - entity.position.x) <= geometry.width / 2 &&
                Math.abs(point.y - entity.position.y) <= geometry.height / 2;
        }
        return false;
    }

    function rectangularFootprintContainsPoint(entity, point) {
        const geometry = entity.geometry;
        if (geometry?.type !== "rectangular-footprint") return false;
        return point.x >= geometry.origin.x && point.x < geometry.origin.x + geometry.width &&
            point.y >= geometry.origin.y && point.y < geometry.origin.y + geometry.height;
    }

    function centredGeometryContainsPoint(entity, point) {
        const geometry = entity.geometry;
        if (geometry?.type !== "centered-rectangle") return false;
        return Math.abs(point.x - entity.position.x) <= geometry.width / 2 &&
            Math.abs(point.y - entity.position.y) <= geometry.height / 2;
    }

    function forestAtPoint(frame, point) {
        return frame.entities.find(entity =>
            entity.category === "map-feature" &&
            entity.subtype === "forest" &&
            mapFeatureContainsPoint(entity, point)
        );
    }

    function isDecorationExcluded(frame, point) {
        for (const entity of frame.entities) {
            if (entity.category === "map-feature") {
                if ((entity.subtype === "road" || entity.subtype === "market-square" || entity.subtype === "cart-pitch") &&
                    mapFeatureContainsPoint(entity, point)) {
                    return true;
                }
                continue;
            }
            if (entity.subtype === "building" && rectangularFootprintContainsPoint(entity, point)) return true;
            if (entity.category === "object" && centredGeometryContainsPoint(entity, point)) return true;
        }
        return false;
    }

    function visibleDecorationTileRange(project) {
        const bounds = visibleWorldBounds(project);
        const minX = Math.floor(bounds.minX) - 1;
        const maxX = Math.ceil(bounds.maxX) + 1;
        const minY = Math.floor(bounds.minY) - 1;
        const maxY = Math.ceil(bounds.maxY) + 1;
        const width = Math.max(1, maxX - minX + 1);
        const height = Math.max(1, maxY - minY + 1);
        const step = Math.max(1, Math.ceil(Math.sqrt(width * height / MAX_VISIBLE_DECORATION_TILES)));
        return { minX, maxX, minY, maxY, step };
    }

    function drawGrassTuft(point, project, variant) {
        const screen = project(point);
        const size = Math.max(2, Math.min(6, project.scale * 0.16));
        context.save();
        context.strokeStyle = variant ? "rgba(94, 139, 73, 0.86)" : "rgba(73, 122, 63, 0.88)";
        context.lineWidth = Math.max(1, Math.round(size / 3));
        context.beginPath();
        context.moveTo(screen.x, screen.y + size / 2);
        context.lineTo(screen.x - size / 3, screen.y - size / 2);
        context.moveTo(screen.x, screen.y + size / 2);
        context.lineTo(screen.x + size / 3, screen.y - size / 3);
        context.stroke();
        context.restore();
    }

    function drawFlower(point, project, variant) {
        const screen = project(point);
        const pixel = Math.max(1, Math.min(3, Math.round(project.scale / 14)));
        context.save();
        context.fillStyle = variant ? "#e5d27a" : "#d9c3e8";
        context.fillRect(Math.round(screen.x - pixel), Math.round(screen.y - pixel), pixel, pixel);
        context.fillRect(Math.round(screen.x + 1), Math.round(screen.y), pixel, pixel);
        context.fillStyle = "#739457";
        context.fillRect(Math.round(screen.x), Math.round(screen.y + pixel), Math.max(1, pixel - 1), pixel + 1);
        context.restore();
    }

    function drawStone(point, project) {
        const screen = project(point);
        const width = Math.max(2, Math.min(5, project.scale * 0.13));
        const height = Math.max(1, Math.round(width * 0.6));
        context.save();
        context.fillStyle = "rgba(126, 126, 112, 0.82)";
        context.fillRect(Math.round(screen.x - width / 2), Math.round(screen.y - height / 2), Math.round(width), height);
        context.restore();
    }

    function drawForestFloorCluster(point, project, variant) {
        const screen = project(point);
        const radius = Math.max(4, Math.min(14, project.scale * (variant ? 0.38 : 0.3)));
        context.save();
        context.fillStyle = variant ? "rgba(25, 67, 34, 0.34)" : "rgba(35, 82, 39, 0.28)";
        context.beginPath();
        context.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }

    function proceduralDecorationsForTile(frame, x, y) {
        const decorations = [];
        const forestPoint = { x: x + 0.5, y: y + 0.5 };
        const inForest = Boolean(forestAtPoint(frame, forestPoint));
        const seed = hash32(x, y, 0);

        if (inForest && seed % 3 === 0) {
            decorations.push({
                type: "forest-floor",
                point: {
                    x: x + 0.18 + hashUnit(x, y, 1) * 0.64,
                    y: y + 0.18 + hashUnit(x, y, 2) * 0.64
                },
                variant: seed % 2 === 0
            });
        }

        if (seed % (inForest ? 4 : 6) === 0) {
            decorations.push({
                type: "grass",
                point: {
                    x: x + 0.14 + hashUnit(x, y, 3) * 0.72,
                    y: y + 0.14 + hashUnit(x, y, 4) * 0.72
                },
                variant: seed % 5 === 0
            });
        }
        if (!inForest && seed % 17 === 0) {
            decorations.push({
                type: "flower",
                point: {
                    x: x + 0.18 + hashUnit(x, y, 5) * 0.64,
                    y: y + 0.18 + hashUnit(x, y, 6) * 0.64
                },
                variant: seed % 2 === 0
            });
        }
        if (!inForest && seed % 29 === 0) {
            decorations.push({
                type: "stone",
                point: {
                    x: x + 0.2 + hashUnit(x, y, 7) * 0.6,
                    y: y + 0.2 + hashUnit(x, y, 8) * 0.6
                }
            });
        }
        return decorations;
    }

    function drawProceduralScenery(project) {
        if (!recording || project.scale < DECORATION_MIN_SCALE) return;
        const frame = recording.frames[frameIndex];
        if (!frame) return;
        const range = visibleDecorationTileRange(project);
        for (let y = range.minY; y <= range.maxY; y += range.step) {
            for (let x = range.minX; x <= range.maxX; x += range.step) {
                for (const decoration of proceduralDecorationsForTile(frame, x, y)) {
                    if (isDecorationExcluded(frame, decoration.point)) continue;
                    if (decoration.type === "grass") drawGrassTuft(decoration.point, project, decoration.variant);
                    else if (decoration.type === "flower") drawFlower(decoration.point, project, decoration.variant);
                    else if (decoration.type === "stone") drawStone(decoration.point, project);
                    else if (decoration.type === "forest-floor") drawForestFloorCluster(decoration.point, project, decoration.variant);
                }
            }
        }
    }

    const entityScreenBoundsBeforeSceneryRenderer = entityScreenBounds;
    entityScreenBounds = function(entity, project) {
        return treeSpriteBounds(entity, project) ?? entityScreenBoundsBeforeSceneryRenderer(entity, project);
    };

    const drawEntityBeforeSceneryRenderer = drawEntity;
    drawEntity = function(entity, point, project) {
        if (drawWorldSceneryEntity(entity, project)) return;
        drawEntityBeforeSceneryRenderer(entity, point, project);
    };

    const shouldDrawLabelBeforeSceneryRenderer = shouldDrawLabel;
    shouldDrawLabel = function(entity, project) {
        if (isWorldSceneryEntity(entity) && entity.id !== selectedEntityId) return false;
        return shouldDrawLabelBeforeSceneryRenderer(entity, project);
    };

    const drawGridBeforeSceneryRenderer = drawGrid;
    drawGrid = function(project) {
        drawGridBeforeSceneryRenderer(project);
        drawProceduralScenery(project);
    };

    window.VillageSceneryRenderer = Object.freeze({
        treeAssetPath: TREE_ASSET_PATH,
        isWorldSceneryEntity,
        treePhysicalScreenBounds,
        treeSpriteBounds,
        mapFeatureContainsPoint,
        isDecorationExcluded,
        proceduralDecorationsForTile,
        drawProceduralScenery,
        get ready() { return treeReady; },
        get failed() { return treeFailed; }
    });
})();
