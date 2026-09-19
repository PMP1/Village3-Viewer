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
    const INTERACTION_FACING_RANGE_METRES = 1.05;

    // Additional appearance layers are pinned to one upstream Universal LPC
    // revision. Colour variants use the same palette swapping approach as the LPC
    // generator rather than browser canvas filters, which are not reliable across
    // all browsers and cannot recolour neutral white/grey pixels by hue rotation.
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
        Object.freeze({ id: "vest-male", path: upstream("torso/clothes/vest/male/walk/white.png") }),
        Object.freeze({ id: "head-male", path: "./assets/characters/lpc/head-human-male-walk.png" }),
        Object.freeze({ id: "head-female", path: upstream("head/heads/human/female/walk.png") }),
        Object.freeze({ id: "hair-balding", path: upstream("hair/balding/adult/walk.png") }),
        Object.freeze({ id: "hair-bedhead", path: upstream("hair/bedhead/adult/walk.png") }),
        Object.freeze({ id: "hair-bob", path: upstream("hair/bob/adult/walk.png") }),
        Object.freeze({ id: "hair-bob-side-part", path: upstream("hair/bob_side_part/adult/walk.png") }),
        Object.freeze({ id: "hair-long-bangs", path: upstream("hair/bangslong/adult/walk.png") }),
        Object.freeze({ id: "hair-short-bangs", path: upstream("hair/bangsshort/adult/walk.png") })
    ]);

    // Exact ULPC source/target palettes from palette_definitions/cloth/cloth_ulpc.json
    // and palette_definitions/hair/hair_ulpc.json at LPC_UPSTREAM_COMMIT.
    const LPC_CLOTH_SOURCE_PALETTE = Object.freeze([
        "#281820", "#4D4A5D", "#958080", "#C4B59F", "#E5E6C7", "#FFFFFF"
    ]);
    const LPC_CLOTH_TARGET_PALETTES = Object.freeze({
        cream: Object.freeze(["#3e2613", "#684415", "#986A20", "#B78C41", "#B7996A", "#CFC587"]),
        blue: Object.freeze(["#180716", "#281E41", "#322D6A", "#3C49AD", "#466AC9", "#61A0EF"]),
        green: Object.freeze(["#101820", "#192832", "#0B5C2F", "#214437", "#2F8136", "#64A42C"]),
        red: Object.freeze(["#1d131e", "#400B1F", "#651117", "#82171C", "#AB1E1E", "#CD2429"]),
        ochre: Object.freeze(["#301723", "#5F2F25", "#BA5B23", "#D99431", "#F3C03F", "#FFE360"]),
        brown: Object.freeze(["#1d131e", "#411E05", "#4B2B13", "#62351C", "#744B30", "#996B4A"]),
        charcoal: Object.freeze(["#000000", "#130D14", "#1C2222", "#2A3034", "#4A5057", "#6E7675"])
    });
    const LPC_FOOTWEAR_TARGET_PALETTES = Object.freeze({
        brown: LPC_CLOTH_TARGET_PALETTES.brown,
        "dark-brown": Object.freeze(["#2b1c1d", "#311210", "#4B2B13", "#704325", "#75502D", "#9A6F37"]),
        black: Object.freeze(["#000000", "#101414", "#1C2222", "#22282A", "#2A3034", "#4A5057"])
    });
    const LPC_HAIR_SOURCE_PALETTE = Object.freeze([
        "#260D14", "#6A1108", "#A42600", "#BF4000", "#E55600", "#FF8A00"
    ]);
    const LPC_HAIR_TARGET_PALETTES = Object.freeze({
        black: Object.freeze(["#000000", "#080A0A", "#101414", "#1C2222", "#31313E", "#4A5057"]),
        "dark-brown": Object.freeze(["#050100", "#160701", "#290E02", "#421603", "#5F1F04", "#792806"]),
        brown: Object.freeze(["#200C0D", "#3A130E", "#63200B", "#81310A", "#B6550E", "#D28102"]),
        auburn: Object.freeze(["#260D14", "#3E111A", "#73171E", "#9E1F1F", "#C7341B", "#E74716"]),
        blonde: Object.freeze(["#331313", "#552B15", "#AC5D1F", "#E09E2B", "#FCCF56", "#FFE67D"]),
        grey: Object.freeze(["#0E0E0E", "#292929", "#4B4B4B", "#777777", "#AAAAAA", "#D9D9D9"])
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
    const recolouredLayerCache = new Map();
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

    function interpolatedLatestFrame(previousFrame, latestFrame, progress) {
        if (!previousFrame || !latestFrame) return latestFrame;
        const amount = clampUnit(progress);
        return {
            ...latestFrame,
            entities: latestFrame.entities.map(entity => {
                if (entity.category !== "character") return entity;
                const previousEntity = entityAtFrame(previousFrame, entity.id);
                if (!previousEntity || previousEntity.category !== "character") return entity;
                const from = previousEntity.position;
                const to = entity.position;
                return {
                    ...entity,
                    position: interpolatePosition(from, to, amount),
                    __viewerMotion: {
                        from,
                        to,
                        progress: amount
                    }
                };
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

    function renderTransitionFrame(previousFrame, latestFrame, progress, animationTimeMs = playbackAnimationTimeMs) {
        if (!recording || !previousFrame || !latestFrame || !recording.frames[frameIndex]) return;
        const currentFrame = recording.frames[frameIndex];
        const previousAnimationTimeMs = playbackAnimationTimeMs;
        const displayFrame = interpolatedLatestFrame(previousFrame, latestFrame, progress);
        playbackAnimationTimeMs = Number.isFinite(animationTimeMs)
            ? animationTimeMs
            : previousAnimationTimeMs;
        recording.frames[frameIndex] = displayFrame;
        try {
            renderMapBeforeCharacterInterpolation();
        } finally {
            recording.frames[frameIndex] = currentFrame;
            playbackAnimationTimeMs = previousAnimationTimeMs;
        }
    }

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
        layer.image.crossOrigin = "anonymous";
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

    function colourKeyForLayer(layerId, appearance) {
        if (layerId.startsWith("hair-")) return appearance.hairColor;
        if (layerId.startsWith("pants-")) return appearance.lowerBodyColor;
        if (layerId.startsWith("shirt-")) return appearance.torsoColor;
        if (layerId.startsWith("apron-") || layerId.startsWith("vest-")) return appearance.outerwearColor;
        if (layerId.startsWith("boots-")) return appearance.footwearColor;
        return undefined;
    }

    function paletteMappingForLayer(layerId, appearance) {
        const colour = colourKeyForLayer(layerId, appearance);
        if (!colour) return undefined;
        if (layerId.startsWith("hair-")) {
            const target = LPC_HAIR_TARGET_PALETTES[colour];
            return target ? { key: `hair:${colour}`, source: LPC_HAIR_SOURCE_PALETTE, target } : undefined;
        }
        if (layerId.startsWith("boots-")) {
            const target = LPC_FOOTWEAR_TARGET_PALETTES[colour];
            return target ? { key: `footwear:${colour}`, source: LPC_CLOTH_SOURCE_PALETTE, target } : undefined;
        }
        const target = LPC_CLOTH_TARGET_PALETTES[colour];
        return target ? { key: `cloth:${colour}`, source: LPC_CLOTH_SOURCE_PALETTE, target } : undefined;
    }

    function rgbFromHex(hex) {
        return {
            r: Number.parseInt(hex.slice(1, 3), 16),
            g: Number.parseInt(hex.slice(3, 5), 16),
            b: Number.parseInt(hex.slice(5, 7), 16)
        };
    }

    function recolourLayerImage(layer, appearance) {
        const mapping = paletteMappingForLayer(layer.id, appearance);
        if (!mapping) return layer.image;
        const cacheKey = `${layer.id}:${mapping.key}`;
        const cached = recolouredLayerCache.get(cacheKey);
        if (cached) return cached;

        const canvas = document.createElement("canvas");
        canvas.width = LPC_SHEET_WIDTH;
        canvas.height = LPC_SHEET_HEIGHT;
        const paletteContext = canvas.getContext("2d", { willReadFrequently: true });
        if (!paletteContext) return layer.image;
        paletteContext.imageSmoothingEnabled = false;
        paletteContext.drawImage(layer.image, 0, 0);

        try {
            const imageData = paletteContext.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            const pairs = mapping.source.map((source, index) => ({
                source: rgbFromHex(source),
                target: rgbFromHex(mapping.target[index])
            }));

            for (let offset = 0; offset < pixels.length; offset += 4) {
                if (pixels[offset + 3] === 0) continue;
                for (const pair of pairs) {
                    if (
                        Math.abs(pixels[offset] - pair.source.r) <= 1 &&
                        Math.abs(pixels[offset + 1] - pair.source.g) <= 1 &&
                        Math.abs(pixels[offset + 2] - pair.source.b) <= 1
                    ) {
                        pixels[offset] = pair.target.r;
                        pixels[offset + 1] = pair.target.g;
                        pixels[offset + 2] = pair.target.b;
                        break;
                    }
                }
            }
            paletteContext.putImageData(imageData, 0, 0);
            recolouredLayerCache.set(cacheKey, canvas);
            return canvas;
        } catch (error) {
            console.warn(`Unable to palette-swap LPC layer ${layer.id}; using its source colours.`, error);
            return layer.image;
        }
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

    function isInteractionWait(entity) {
        const action = entity?.state?.action;
        return typeof action === "string" &&
            action.startsWith("wait-for-") &&
            !action.endsWith("-service-retry");
    }

    function nearestInteractionCharacter(entity, frame) {
        let nearest;
        let nearestDistance = Infinity;
        for (const candidate of frame?.entities ?? []) {
            if (candidate.category !== "character" || candidate.id === entity.id) continue;
            const distance = Math.hypot(
                candidate.position.x - entity.position.x,
                candidate.position.y - entity.position.y
            );
            if (distance > INTERACTION_FACING_RANGE_METRES || distance >= nearestDistance) continue;
            nearest = candidate;
            nearestDistance = distance;
        }
        return nearest;
    }

    function interactionPartner(entity) {
        const frame = recording?.frames?.[frameIndex];
        if (!frame || entity?.state?.movementTarget) return undefined;

        if (isInteractionWait(entity)) {
            const direct = nearestInteractionCharacter(entity, frame);
            if (direct) return direct;
        }

        for (const source of frame.entities) {
            if (source.category !== "character" || source.id === entity.id || !isInteractionWait(source)) continue;
            if (source.state?.movementTarget) continue;
            const partner = nearestInteractionCharacter(source, frame);
            if (partner?.id === entity.id) return source;
        }
        return undefined;
    }

    function interactionFacingDirection(entity) {
        const partner = interactionPartner(entity);
        if (!partner) return undefined;
        return directionFromDelta(
            partner.position.x - entity.position.x,
            partner.position.y - entity.position.y
        );
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
            const direction = moving
                ? directionFromDelta(dx, dy) ?? facingByCharacter.get(entity.id) ?? "south"
                : interactionFacingDirection(entity) ?? facingByCharacter.get(entity.id) ?? "south";
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
        const direction = interactionFacingDirection(entity) ??
            directionFromDelta(dx, dy) ??
            facingByCharacter.get(entity.id) ??
            "south";
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
            context.drawImage(
                recolourLayerImage(layer, appearance),
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
        interactionFacingRangeMetres: INTERACTION_FACING_RANGE_METRES,
        upstreamCommit: LPC_UPSTREAM_COMMIT,
        layers: LPC_ASSET_DEFINITIONS,
        appearanceFromEntity,
        layerIdsForAppearance,
        paletteMappingForLayer,
        recolourLayerImage,
        directionFromDelta,
        interactionFacingDirection,
        characterAnimationState,
        characterSpriteBounds,
        frameSourceRect,
        drawCharacterLayers,
        interpolatePosition,
        interpolatedCharacterEntity,
        interpolatedFrame,
        interpolatedLatestFrame,
        renderTransitionFrame,
        get movementProgress() { return movementProgress; },
        get playbackAnimationTimeMs() { return playbackAnimationTimeMs; },
        get ready() { return layersReady(defaultEntity); },
        get failed() { return spriteLayers.some(layer => layer.failed); }
    });
})();