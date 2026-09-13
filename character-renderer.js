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
    const LPC_WALK_FRAME_DURATION_MS = 110;
    const MIN_CHARACTER_SPRITE_PIXELS = 24;
    const MAX_CHARACTER_SPRITE_PIXELS = 128;

    // Additional appearance layers are pinned to one upstream Universal LPC
    // revision. Direct image compositing remains safe here because the viewer never
    // reads pixels back from the canvas. Palette-style colour filters are applied
    // only while drawing individual visual layers.
    const LPC_UPSTREAM_COMMIT = "553ba7562534cbf32e7d9a502660f569d6b26512";
    const LPC_UPSTREAM_ROOT = `https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/${LPC_UPSTREAM_COMMIT}/spritesheets/`;
    const upstream = path => `${LPC_UPSTREAM_ROOT}${path}`;

    const LPC_ASSET_DEFINITIONS = Object.freeze([
        Object.freeze({ id: "body-male", path: "./assets/characters/lpc/body-male-walk.png" }),
        Object.freeze({ id: "body-female", path: upstream("body/bodies/female/walk.png") }),
        Object.freeze({ id: "pants-male", path: "./assets/characters/lpc/pants-male-walk.png" }),
        Object.freeze({ id: "pants-female", path: upstream("legs/pants/thin/walk.png") }),
        Object.freeze({ id: "boots-male", path: upstream("feet/boots/basic/male/walk.png") }),
        Object.freeze({ id: "boots-female", path: upstream("feet/boots/basic/thin/walk.png") }),
        Object.freeze({ id: "shirt-male", path: "./assets/characters/lpc/shirt-male-walk.png" }),
        Object.freeze({ id: "shirt-female", path: upstream("torso/clothes/shortsleeve/shortsleeve/female/walk.png") }),
        Object.freeze({ id: "apron-male", path: upstream("torso/aprons/apron/male/walk/white.png") }),
        Object.freeze({ id: "apron-female", path: upstream("torso/aprons/apron/female/walk/white.png") }),
        Object.freeze({ id: "vest-male", path: upstream("torso/clothes/vest/male/walk/brown.png") }),
        Object.freeze({ id: "head-male", path: "./assets/characters/lpc/head-human-male-walk.png" }),
        Object.freeze({ id: "head-female", path: upstream("head/heads/human/female/walk.png") }),
        Object.freeze({ id: "hair-balding", path: upstream("hair/balding/adult/walk.png") }),
        Object.freeze({ id: "hair-bedhead", path: upstream("hair/bedhead/adult/walk.png") }),
        Object.freeze({ id: "hair-bob", path: upstream("hair/bob/adult/walk.png") }),
        Object.freeze({ id: "hair-bob-side-part", path: upstream("hair/bob_side_part/adult/walk.png") }),
        Object.freeze({ id: "hair-long-bangs", path: upstream("hair/bangslong/adult/walk.png") }),
        Object.freeze({ id: "hair-short-bangs", path: upstream("hair/bangsshort/adult/walk.png") })
    ]);

    const LPC_COLOR_FILTERS = Object.freeze({
        black: "grayscale(1) brightness(0.32)",
        "dark-brown": "sepia(1) saturate(2.2) hue-rotate(345deg) brightness(0.5)",
        brown: "sepia(1) saturate(1.7) hue-rotate(350deg) brightness(0.72)",
        auburn: "sepia(1) saturate(3.4) hue-rotate(320deg) brightness(0.72)",
        blonde: "sepia(1) saturate(1.4) hue-rotate(355deg) brightness(1.18)",
        grey: "grayscale(1) brightness(0.85)",
        cream: "sepia(0.35) saturate(0.8) brightness(1.03)",
        blue: "sepia(1) saturate(3.2) hue-rotate(165deg) brightness(0.82)",
        green: "sepia(1) saturate(2.8) hue-rotate(75deg) brightness(0.76)",
        red: "sepia(1) saturate(3.6) hue-rotate(320deg) brightness(0.82)",
        ochre: "sepia(1) saturate(2.4) hue-rotate(350deg) brightness(0.92)",
        charcoal: "grayscale(1) brightness(0.5)"
    });

    const VALID_BODY_TYPES = new Set(["male", "female"]);
    const VALID_HAIR_STYLES = new Set([
        "none",
        "balding",
        "bedhead",
        "bob",
        "bob-side-part",
        "long-bangs",
        "short-bangs"
    ]);
    const VALID_HAIR_COLORS = new Set(["black", "dark-brown", "brown", "auburn", "blonde", "grey"]);
    const VALID_CLOTHING_COLORS = new Set(["cream", "blue", "green", "red", "ochre", "brown", "charcoal"]);
    const VALID_FOOTWEAR = new Set(["boots"]);
    const VALID_FOOTWEAR_COLORS = new Set(["brown", "dark-brown", "black"]);
    const VALID_OUTERWEAR = new Set(["none", "apron", "vest"]);
    const DEFAULT_APPEARANCE = Object.freeze({
        bodyType: "male",
        hairStyle: "none",
        hairColor: "brown",
        lowerBody: "pants",
        lowerBodyColor: "charcoal",
        torso: "shirt",
        torsoColor: "cream",
        outerwear: "none",
        outerwearColor: "brown",
        footwear: "boots",
        footwearColor: "dark-brown"
    });

    const facingByCharacter = new Map();
    let movementProgress = 0;
    let playbackAnimationTimeMs = 0;
    let transitionStartedAt;
    let lastAnimationTimestamp;

    function clampUnit(value) {
        return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    }

    function interpolatePosition(from, to, progress) {
        const amount = clampUnit(progress);
        return {
            x: from.x + (to.x - from.x) * amount,
            y: from.y + (to.y - from.y) * amount
        };
    }

    function interpolatedCharacterEntity(entity, nextEntity, progress) {
        if (entity?.category !== "character" || nextEntity?.category !== "character") return entity;
        const amount = clampUnit(progress);
        const from = entity.position;
        const to = nextEntity.position;
        return {
            ...entity,
            position: interpolatePosition(from, to, amount),
            __viewerMotion: {
                from,
                to,
                progress: amount
            }
        };
    }

    function interpolatedFrame(frame, nextFrame, progress) {
        if (!frame || !nextFrame) return frame;
        return {
            ...frame,
            entities: frame.entities.map(entity => {
                if (entity.category !== "character") return entity;
                return interpolatedCharacterEntity(entity, entityAtFrame(nextFrame, entity.id), progress);
            })
        };
    }

    // Keep the recording as the source of truth. During drawing only, substitute a
    // transient frame whose character positions are between two recorded ticks.
    // All simulation state, inspector data, events, and navigation remain discrete.
    const renderMapBeforeCharacterInterpolation = renderMap;
    renderMap = function() {
        if (!recording || frameIndex >= recording.frames.length - 1) {
            renderMapBeforeCharacterInterpolation();
            return;
        }

        const frame = recording.frames[frameIndex];
        const nextFrame = recording.frames[frameIndex + 1];
        const shouldInterpolate = Boolean(playbackTimer) || movementProgress > 0;
        if (!shouldInterpolate) {
            renderMapBeforeCharacterInterpolation();
            return;
        }

        const displayFrame = interpolatedFrame(frame, nextFrame, movementProgress);
        recording.frames[frameIndex] = displayFrame;
        try {
            renderMapBeforeCharacterInterpolation();
        } finally {
            recording.frames[frameIndex] = frame;
        }
    };

    const setFrameIndexBeforeCharacterInterpolation = setFrameIndex;
    setFrameIndex = function(nextIndex) {
        movementProgress = 0;
        transitionStartedAt = undefined;
        lastAnimationTimestamp = undefined;
        setFrameIndexBeforeCharacterInterpolation(nextIndex);
    };

    function animationStep(timestamp) {
        if (!playbackTimer || !recording) return;
        const duration = playbackDelay();
        if (transitionStartedAt === undefined) transitionStartedAt = timestamp;
        if (lastAnimationTimestamp === undefined) lastAnimationTimestamp = timestamp;

        const animationDelta = Math.max(0, timestamp - lastAnimationTimestamp);
        playbackAnimationTimeMs += animationDelta * speed;
        lastAnimationTimestamp = timestamp;

        let elapsed = Math.max(0, timestamp - transitionStartedAt);
        if (elapsed >= duration) {
            const frameAdvance = Math.max(1, Math.floor(elapsed / duration));
            frameIndex = Math.min(recording.frames.length - 1, frameIndex + frameAdvance);
            transitionStartedAt += frameAdvance * duration;
            elapsed = Math.max(0, timestamp - transitionStartedAt);
            movementProgress = frameIndex >= recording.frames.length - 1 ? 0 : clampUnit(elapsed / duration);
            renderFrame();

            if (frameIndex >= recording.frames.length - 1) {
                stopPlayback();
                return;
            }
        } else {
            movementProgress = clampUnit(elapsed / duration);
            renderMap();
        }

        playbackTimer = requestAnimationFrame(animationStep);
    }

    scheduleNextFrame = function() {
        if (playbackTimer) cancelAnimationFrame(playbackTimer);
        const now = performance.now();
        transitionStartedAt = now - movementProgress * playbackDelay();
        lastAnimationTimestamp = now;
        playbackTimer = requestAnimationFrame(animationStep);
    };

    startPlayback = function() {
        if (!recording) return;
        if (frameIndex >= recording.frames.length - 1) {
            playbackAnimationTimeMs = 0;
            setFrameIndex(0);
        }
        playButton.textContent = "Pause";
        playButton.setAttribute("aria-pressed", "true");
        scheduleNextFrame();
    };

    stopPlayback = function() {
        if (playbackTimer) cancelAnimationFrame(playbackTimer);
        playbackTimer = undefined;
        transitionStartedAt = undefined;
        lastAnimationTimestamp = undefined;
        playButton.textContent = "Play";
        playButton.setAttribute("aria-pressed", "false");
        renderMap();
    };

    const spriteLayers = LPC_ASSET_DEFINITIONS.map(definition => {
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
    const spriteLayerById = new Map(spriteLayers.map(layer => [layer.id, layer]));

    function appearanceFromEntity(entity) {
        const properties = entity?.properties ?? {};
        const bodyType = VALID_BODY_TYPES.has(properties.appearanceBodyType)
            ? properties.appearanceBodyType
            : DEFAULT_APPEARANCE.bodyType;
        const hairStyle = VALID_HAIR_STYLES.has(properties.appearanceHairStyle)
            ? properties.appearanceHairStyle
            : DEFAULT_APPEARANCE.hairStyle;
        const hairColor = VALID_HAIR_COLORS.has(properties.appearanceHairColor)
            ? properties.appearanceHairColor
            : DEFAULT_APPEARANCE.hairColor;
        const outerwear = VALID_OUTERWEAR.has(properties.appearanceOuterwear)
            ? properties.appearanceOuterwear
            : DEFAULT_APPEARANCE.outerwear;
        const footwear = VALID_FOOTWEAR.has(properties.appearanceFootwear)
            ? properties.appearanceFootwear
            : DEFAULT_APPEARANCE.footwear;

        return {
            bodyType,
            hairStyle,
            hairColor,
            lowerBody: properties.appearanceLowerBody === "pants" ? "pants" : DEFAULT_APPEARANCE.lowerBody,
            lowerBodyColor: VALID_CLOTHING_COLORS.has(properties.appearanceLowerBodyColor)
                ? properties.appearanceLowerBodyColor
                : DEFAULT_APPEARANCE.lowerBodyColor,
            torso: properties.appearanceTorso === "shirt" ? "shirt" : DEFAULT_APPEARANCE.torso,
            torsoColor: VALID_CLOTHING_COLORS.has(properties.appearanceTorsoColor)
                ? properties.appearanceTorsoColor
                : DEFAULT_APPEARANCE.torsoColor,
            // The current LPC vest layer is male-body-specific. Invalid combinations
            // degrade to the base outfit rather than breaking the whole character.
            outerwear: outerwear === "vest" && bodyType !== "male" ? "none" : outerwear,
            outerwearColor: VALID_CLOTHING_COLORS.has(properties.appearanceOuterwearColor)
                ? properties.appearanceOuterwearColor
                : DEFAULT_APPEARANCE.outerwearColor,
            footwear,
            footwearColor: VALID_FOOTWEAR_COLORS.has(properties.appearanceFootwearColor)
                ? properties.appearanceFootwearColor
                : DEFAULT_APPEARANCE.footwearColor
        };
    }

    function layerIdsForAppearance(appearance) {
        const ids = [
            `body-${appearance.bodyType}`,
            `pants-${appearance.bodyType}`,
            `${appearance.footwear}-${appearance.bodyType}`,
            `shirt-${appearance.bodyType}`
        ];
        if (appearance.outerwear !== "none") {
            ids.push(`${appearance.outerwear}-${appearance.bodyType}`);
        }
        ids.push(`head-${appearance.bodyType}`);
        if (appearance.hairStyle !== "none") {
            ids.push(`hair-${appearance.hairStyle}`);
        }
        return ids;
    }

    function selectedSpriteLayers(entity, appearance = appearanceFromEntity(entity)) {
        const ids = layerIdsForAppearance(appearance);
        const layers = ids.map(id => spriteLayerById.get(id));
        return layers.every(Boolean) ? layers : undefined;
    }

    function colourFilterForLayer(layerId, appearance) {
        let colour;
        if (layerId.startsWith("hair-")) colour = appearance.hairColor;
        else if (layerId.startsWith("pants-")) colour = appearance.lowerBodyColor;
        else if (layerId.startsWith("shirt-")) colour = appearance.torsoColor;
        else if (layerId.startsWith("apron-") || layerId.startsWith("vest-")) colour = appearance.outerwearColor;
        else if (layerId.startsWith("boots-")) colour = appearance.footwearColor;
        return colour ? LPC_COLOR_FILTERS[colour] ?? "none" : "none";
    }

    function entityFromPreviousFrame(id) {
        if (!recording || frameIndex <= 0) return undefined;
        return entityAtFrame(recording.frames[frameIndex - 1], id);
    }

    function directionFromDelta(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "west" : "east";
        if (Math.abs(dy) > 0.0001) return dy < 0 ? "north" : "south";
        return undefined;
    }

    function walkAnimationFrame() {
        return Math.floor(playbackAnimationTimeMs / LPC_WALK_FRAME_DURATION_MS) % LPC_WALK_FRAMES;
    }

    function characterAnimationState(entity) {
        const motion = entity.__viewerMotion;
        if (motion) {
            const dx = motion.to.x - motion.from.x;
            const dy = motion.to.y - motion.from.y;
            const moving = Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001;
            const direction = directionFromDelta(dx, dy) ?? facingByCharacter.get(entity.id) ?? "south";
            facingByCharacter.set(entity.id, direction);
            return {
                animation: moving ? "walk" : "idle",
                direction,
                frame: moving ? walkAnimationFrame() : 0
            };
        }

        const previous = entityFromPreviousFrame(entity.id);
        const dx = previous ? entity.position.x - previous.position.x : 0;
        const dy = previous ? entity.position.y - previous.position.y : 0;
        const direction = directionFromDelta(dx, dy) ?? facingByCharacter.get(entity.id) ?? "south";
        facingByCharacter.set(entity.id, direction);
        return {
            animation: "idle",
            direction,
            frame: 0
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

    function layersReady(entity) {
        const layers = selectedSpriteLayers(entity);
        return Boolean(layers) && layers.every(layer => layer.ready);
    }

    function drawCharacterLayers(entity, state, bounds) {
        const appearance = appearanceFromEntity(entity);
        const layers = selectedSpriteLayers(entity, appearance);
        if (!layers || !layers.every(layer => layer.ready)) return false;
        const source = frameSourceRect(state);
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));
        const left = Math.round(bounds.left);
        const top = Math.round(bounds.top);

        for (const layer of layers) {
            context.filter = colourFilterForLayer(layer.id, appearance);
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
        context.filter = "none";
        return true;
    }

    function drawCharacterSprite(entity, project) {
        const state = characterAnimationState(entity);
        const bounds = characterSpriteBounds(entity, project);

        context.save();
        context.imageSmoothingEnabled = false;
        if (!drawCharacterLayers(entity, state, bounds)) {
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

    const defaultEntity = { category: "character", properties: {} };
    window.VillageCharacterRenderer = Object.freeze({
        frameSize: LPC_FRAME_SIZE,
        sheetWidth: LPC_SHEET_WIDTH,
        sheetHeight: LPC_SHEET_HEIGHT,
        directionRows: LPC_DIRECTION_ROWS,
        walkFrames: LPC_WALK_FRAMES,
        walkFrameDurationMs: LPC_WALK_FRAME_DURATION_MS,
        visualSizeMetres: LPC_VISUAL_SIZE_METRES,
        groundAnchorY: LPC_GROUND_ANCHOR_Y,
        upstreamCommit: LPC_UPSTREAM_COMMIT,
        layers: LPC_ASSET_DEFINITIONS,
        appearanceFromEntity,
        layerIdsForAppearance,
        colourFilterForLayer,
        directionFromDelta,
        characterAnimationState,
        characterSpriteBounds,
        frameSourceRect,
        drawCharacterLayers,
        interpolatePosition,
        interpolatedCharacterEntity,
        interpolatedFrame,
        get movementProgress() { return movementProgress; },
        get playbackAnimationTimeMs() { return playbackAnimationTimeMs; },
        get ready() { return layersReady(defaultEntity); },
        get failed() { return spriteLayers.some(layer => layer.failed); }
    });
})();
