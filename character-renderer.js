(() => {
    const LPC_FRAME_SIZE = 64;
    const LPC_WALK_FRAMES = 9;
    const LPC_DIRECTION_ROWS = Object.freeze({
        north: 0,
        west: 1,
        south: 2,
        east: 3
    });
    const LPC_SHEET_WIDTH = LPC_FRAME_SIZE * LPC_WALK_FRAMES;
    const LPC_SHEET_HEIGHT = LPC_FRAME_SIZE * 4;
    // The native LPC frame is visual space only: it has no collision meaning and
    // does not change the simulation/navigation grid from one metre per cell.
    const LPC_VISUAL_SIZE_METRES = 2;
    const LPC_GROUND_ANCHOR_Y = 60;
    const MIN_CHARACTER_SPRITE_PIXELS = 24;
    const MAX_CHARACTER_SPRITE_PIXELS = 128;

    // These are genuine Universal LPC walk layers, kept separate so appearance
    // can become data-driven later without changing the frame/render contract.
    const LPC_LAYER_DEFINITIONS = Object.freeze([
        Object.freeze({ id: "body", path: "./assets/characters/lpc/body-male-walk.png" }),
        Object.freeze({ id: "pants", path: "./assets/characters/lpc/pants-male-walk.png" }),
        Object.freeze({ id: "shirt", path: "./assets/characters/lpc/shirt-male-walk.png" }),
        Object.freeze({ id: "head", path: "./assets/characters/lpc/head-human-male-walk.png" })
    ]);

    const facingByCharacter = new Map();
    const spriteLayers = LPC_LAYER_DEFINITIONS.map(definition => {
        const layer = {
            id: definition.id,
            path: definition.path,
            image: new Image(),
            ready: false,
            failed: false
        };
        layer.image.addEventListener("load", () => {
            layer.ready = true;
            layer.failed = false;
            if (recording && cameraInitialised) renderMap();
        });
        layer.image.addEventListener("error", () => {
            layer.failed = true;
            layer.ready = false;
        });
        layer.image.src = window.__VILLAGE_VIEWER_ASSETS__?.[definition.path] ?? definition.path;
        return layer;
    });

    function entityFromPreviousFrame(id) {
        if (!recording || frameIndex <= 0) return undefined;
        return entityAtFrame(recording.frames[frameIndex - 1], id);
    }

    function directionFromDelta(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "west" : "east";
        if (Math.abs(dy) > 0.0001) return dy < 0 ? "north" : "south";
        return undefined;
    }

    function characterAnimationState(entity) {
        const previous = entityFromPreviousFrame(entity.id);
        const dx = previous ? entity.position.x - previous.position.x : 0;
        const dy = previous ? entity.position.y - previous.position.y : 0;
        const moving = Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001;
        const direction = directionFromDelta(dx, dy) ?? facingByCharacter.get(entity.id) ?? "south";
        facingByCharacter.set(entity.id, direction);
        return {
            animation: moving ? "walk" : "idle",
            direction,
            frame: moving ? frameIndex % LPC_WALK_FRAMES : 0
        };
    }

    function characterSpriteSize(project) {
        return clamp(
            project.scale * LPC_VISUAL_SIZE_METRES,
            MIN_CHARACTER_SPRITE_PIXELS,
            MAX_CHARACTER_SPRITE_PIXELS
        );
    }

    function characterSpriteBounds(entity, project) {
        const point = project(entity.position);
        const size = characterSpriteSize(project);
        const groundRatio = LPC_GROUND_ANCHOR_Y / LPC_FRAME_SIZE;
        const top = point.y - size * groundRatio;
        return {
            left: point.x - size / 2,
            right: point.x + size / 2,
            top,
            bottom: top + size,
            width: size,
            height: size,
            groundX: point.x,
            groundY: point.y
        };
    }

    function frameSourceRect(state) {
        return {
            x: state.frame * LPC_FRAME_SIZE,
            y: LPC_DIRECTION_ROWS[state.direction] * LPC_FRAME_SIZE,
            width: LPC_FRAME_SIZE,
            height: LPC_FRAME_SIZE
        };
    }

    function layersReady() {
        return spriteLayers.every(layer => layer.ready);
    }

    function drawCharacterLayers(state, bounds) {
        if (!layersReady()) return false;
        const source = frameSourceRect(state);
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));
        const left = Math.round(bounds.left);
        const top = Math.round(bounds.top);

        for (const layer of spriteLayers) {
            context.drawImage(
                layer.image,
                source.x,
                source.y,
                source.width,
                source.height,
                left,
                top,
                width,
                height
            );
        }
        return true;
    }

    function drawCharacterSprite(entity, project) {
        const state = characterAnimationState(entity);
        const bounds = characterSpriteBounds(entity, project);

        context.save();
        context.imageSmoothingEnabled = false;
        if (!drawCharacterLayers(state, bounds)) {
            context.restore();
            return false;
        }

        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));
        const selected = entity.id === selectedEntityId;
        if (selected) {
            context.strokeStyle = "#f2cc60";
            context.lineWidth = 2;
            context.beginPath();
            context.ellipse(
                bounds.groundX,
                bounds.groundY + Math.max(1, height * 0.03),
                width * 0.28,
                Math.max(3, height * 0.06),
                0,
                0,
                Math.PI * 2
            );
            context.stroke();
        }

        if (!deferRaisedEntityLabels && shouldDrawLabel(entity, project)) {
            context.font = "600 12px system-ui";
            context.fillStyle = selected ? "#f2cc60" : "#f0f6fc";
            context.textAlign = "center";
            context.textBaseline = "bottom";
            context.shadowColor = "rgba(0, 0, 0, 0.9)";
            context.shadowBlur = 3;
            context.fillText(entity.label ?? entity.id, bounds.groundX, bounds.top - 3);
        }
        context.restore();
        return true;
    }

    const entityScreenBoundsBeforeCharacterRenderer = entityScreenBounds;
    entityScreenBounds = function(entity, project) {
        if (entity.category === "character") return characterSpriteBounds(entity, project);
        return entityScreenBoundsBeforeCharacterRenderer(entity, project);
    };

    const drawEntityBeforeCharacterRenderer = drawEntity;
    drawEntity = function(entity, point, project) {
        if (entity.category === "character" && drawCharacterSprite(entity, project)) return;
        drawEntityBeforeCharacterRenderer(entity, point, project);
    };

    window.VillageCharacterRenderer = Object.freeze({
        frameSize: LPC_FRAME_SIZE,
        sheetWidth: LPC_SHEET_WIDTH,
        sheetHeight: LPC_SHEET_HEIGHT,
        directionRows: LPC_DIRECTION_ROWS,
        walkFrames: LPC_WALK_FRAMES,
        visualSizeMetres: LPC_VISUAL_SIZE_METRES,
        groundAnchorY: LPC_GROUND_ANCHOR_Y,
        layers: LPC_LAYER_DEFINITIONS,
        directionFromDelta,
        characterAnimationState,
        characterSpriteBounds,
        frameSourceRect,
        drawCharacterLayers,
        get ready() { return layersReady(); },
        get failed() { return spriteLayers.some(layer => layer.failed); }
    });
})();
