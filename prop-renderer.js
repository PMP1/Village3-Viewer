(() => {
    const PROP_ASSET_PATHS = Object.freeze({
        hearth: "./assets/props/home-hearth.png",
        bed: "./assets/props/home-bed.png",
        "dining-table": "./assets/props/home-dining-table.png",
        "service-counter": "./assets/tiles-png/service_counter.png",
        "dining-seat": "./assets/props/home-chair.png",
        cart: "./assets/props/cart.svg"
    });

    const DIRECTION_INDEX = Object.freeze({ north: 0, east: 1, south: 2, west: 3 });
    const CARDINAL_DIRECTIONS = new Set(Object.keys(DIRECTION_INDEX));

    const PROP_DEFINITIONS = Object.freeze({
        hearth: Object.freeze({ visualWidth: 1.10, visualHeight: 1.50, baseFacing: "south", rotateWithFacing: false }),
        bed: Object.freeze({ visualWidth: 1.10, visualHeight: 2.00, baseFacing: "east", rotateWithFacing: false }),
        "dining-table": Object.freeze({ visualWidth: 1.40, visualHeight: 1.05, baseFacing: "south", rotateWithFacing: false }),
        "service-counter": Object.freeze({ visualWidth: 1.55, visualHeight: 1.10, baseFacing: "south", rotateWithFacing: false }),
        "dining-seat": Object.freeze({ visualWidth: 0.80, visualHeight: 1.30, baseFacing: "south", rotateWithFacing: true }),
        cart: Object.freeze({ visualWidth: 2.00, visualHeight: 1.55, baseFacing: "east", rotateWithFacing: true })
    });

    const propImages = new Map();
    const propReady = new Set();
    const propFailed = new Set();

    for (const [type, path] of Object.entries(PROP_ASSET_PATHS)) {
        const image = new Image();
        propImages.set(type, image);
        image.addEventListener("load", () => {
            propReady.add(type);
            if (recording && cameraInitialised) renderMap();
        });
        image.addEventListener("error", () => {
            propFailed.add(type);
        });
        image.src = window.__VILLAGE_VIEWER_ASSETS__?.[path] ?? path;
    }

    function propType(entity) {
        if (entity.subtype === "cart") return "cart";
        if (entity.properties?.facilityType === "hearth") return "hearth";
        if (entity.properties?.resourceType === "bed") return "bed";
        if (entity.properties?.resourceType === "dining-seat") return "dining-seat";
        if (entity.properties?.fixtureType === "dining-table") return "dining-table";
        if (entity.properties?.fixtureType === "service-counter") return "service-counter";
        return undefined;
    }

    function isPropEntity(entity) {
        return Boolean(propType(entity));
    }

    function currentFrameEntities() {
        return recording?.frames?.[frameIndex]?.entities ?? [];
    }

    function diningSeatFacing(entity) {
        const match = /^(.*)-seat-\d+$/.exec(entity.id);
        if (!match) return undefined;
        const table = currentFrameEntities().find(candidate => candidate.id === match[1]);
        if (!table) return undefined;
        const dx = table.position.x - entity.position.x;
        const dy = table.position.y - entity.position.y;
        if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "west" : "east";
        if (Math.abs(dy) > 0.0001) return dy < 0 ? "north" : "south";
        return undefined;
    }

    function propFacing(entity) {
        const explicit = entity.properties?.facing;
        if (typeof explicit === "string" && CARDINAL_DIRECTIONS.has(explicit)) return explicit;

        const type = propType(entity);
        if (type === "dining-seat") return diningSeatFacing(entity) ?? "south";
        if (type === "cart") return "east";
        if (type === "service-counter") {
            const geometry = entity.geometry;
            if (geometry?.type === "centered-rectangle" && geometry.height > geometry.width) return "east";
            return "south";
        }
        return PROP_DEFINITIONS[type]?.baseFacing ?? "south";
    }

    function quarterTurns(definition, facing) {
        if (!definition.rotateWithFacing) return 0;
        const from = DIRECTION_INDEX[definition.baseFacing];
        const to = DIRECTION_INDEX[facing];
        return (to - from + 4) % 4;
    }

    function physicalScreenBounds(entity, project) {
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

    function propSpriteBounds(entity, project) {
        const type = propType(entity);
        const definition = PROP_DEFINITIONS[type];
        if (!definition) return undefined;

        const facing = propFacing(entity);
        const turns = quarterTurns(definition, facing);
        const baseWidth = Math.max(3, definition.visualWidth * project.scale);
        const baseHeight = Math.max(3, definition.visualHeight * project.scale);
        const width = turns % 2 === 0 ? baseWidth : baseHeight;
        const height = turns % 2 === 0 ? baseHeight : baseWidth;
        const physical = physicalScreenBounds(entity, project);
        const centreX = (physical.left + physical.right) / 2;
        const groundY = physical.bottom;

        return {
            left: centreX - width / 2,
            right: centreX + width / 2,
            top: groundY - height,
            bottom: groundY,
            width,
            height,
            baseWidth,
            baseHeight,
            facing,
            turns,
            physical
        };
    }

    function drawSelection(entity, bounds) {
        if (entity.id !== selectedEntityId) return;
        const physical = bounds.physical;
        context.strokeStyle = "#f2cc60";
        context.lineWidth = 2;
        context.strokeRect(
            Math.round(physical.left),
            Math.round(physical.top),
            Math.max(1, Math.round(physical.right - physical.left)),
            Math.max(1, Math.round(physical.bottom - physical.top))
        );
    }

    function drawProp(entity, project) {
        const type = propType(entity);
        if (!type) return false;
        const image = propImages.get(type);
        if (!image || !propReady.has(type)) return false;
        const bounds = propSpriteBounds(entity, project);
        if (!bounds) return false;

        context.save();
        context.imageSmoothingEnabled = false;
        const centreX = (bounds.left + bounds.right) / 2;
        const centreY = (bounds.top + bounds.bottom) / 2;
        if (bounds.turns !== 0) {
            context.translate(Math.round(centreX), Math.round(centreY));
            context.rotate(bounds.turns * Math.PI / 2);
            context.drawImage(
                image,
                -Math.round(bounds.baseWidth / 2),
                -Math.round(bounds.baseHeight / 2),
                Math.max(1, Math.round(bounds.baseWidth)),
                Math.max(1, Math.round(bounds.baseHeight))
            );
        } else {
            context.drawImage(
                image,
                Math.round(bounds.left),
                Math.round(bounds.top),
                Math.max(1, Math.round(bounds.width)),
                Math.max(1, Math.round(bounds.height))
            );
        }

        drawSelection(entity, bounds);

        if (!deferRaisedEntityLabels && shouldDrawLabel(entity, project)) {
            const selected = entity.id === selectedEntityId;
            context.font = "11px system-ui";
            context.fillStyle = selected ? "#f2cc60" : "#f0e6d2";
            context.textAlign = "center";
            context.textBaseline = "bottom";
            context.shadowColor = "rgba(0, 0, 0, 0.85)";
            context.shadowBlur = 3;
            context.fillText(entity.label ?? entity.id, centreX, bounds.top - 4);
        }
        context.restore();
        return true;
    }

    const entityScreenBoundsBeforePropRenderer = entityScreenBounds;
    entityScreenBounds = function(entity, project) {
        return propSpriteBounds(entity, project) ?? entityScreenBoundsBeforePropRenderer(entity, project);
    };

    const drawEntityBeforePropRenderer = drawEntity;
    drawEntity = function(entity, point, project) {
        if (drawProp(entity, project)) return;
        drawEntityBeforePropRenderer(entity, point, project);
    };

    window.VillagePropRenderer = Object.freeze({
        assets: PROP_ASSET_PATHS,
        definitions: PROP_DEFINITIONS,
        propType,
        isPropEntity,
        propFacing,
        physicalScreenBounds,
        propSpriteBounds,
        get ready() { return propReady.size === Object.keys(PROP_ASSET_PATHS).length; },
        get failed() { return propFailed.size > 0; }
    });
})();
