(() => {
    const LPC_FRAME_SIZE = 64;
    const LPC_DIRECTION_ROWS = Object.freeze({
        north: 0,
        west: 1,
        south: 2,
        east: 3
    });
    const LPC_WALK_FRAMES = 9;
    const MIN_CHARACTER_SPRITE_PIXELS = 22;
    const MAX_CHARACTER_SPRITE_PIXELS = 88;
    const CHARACTER_VISUAL_HEIGHT_METRES = 1.65;

    const placeholderSheets = new Map();
    const facingByCharacter = new Map();

    const skinPalettes = [
        ["#e7bd91", "#b97852"],
        ["#d9a779", "#9d6345"],
        ["#b97955", "#744833"],
        ["#8c5a42", "#52362b"]
    ];
    const tunicPalettes = [
        ["#477db3", "#28527c"],
        ["#9a5a47", "#66382f"],
        ["#5d8754", "#385b35"],
        ["#9a793d", "#684f27"],
        ["#765d9e", "#4d3c70"]
    ];
    const hairPalettes = ["#3b2a20", "#6b452b", "#9a6a3c", "#292729", "#704f3f"];

    function stableHash(value) {
        let hash = 2166136261;
        for (const character of String(value)) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function paletteForCharacter(id) {
        const hash = stableHash(id);
        return {
            skin: skinPalettes[hash % skinPalettes.length],
            tunic: tunicPalettes[Math.floor(hash / 7) % tunicPalettes.length],
            hair: hairPalettes[Math.floor(hash / 31) % hairPalettes.length]
        };
    }

    function drawPlaceholderFrame(frameContext, frame, row, palette) {
        const offsetX = frame * LPC_FRAME_SIZE;
        const offsetY = row * LPC_FRAME_SIZE;
        const phase = frame % 4;
        const bob = phase === 1 || phase === 3 ? 1 : 0;
        const stride = phase === 1 ? -2 : phase === 3 ? 2 : 0;
        const [skin, skinShadow] = palette.skin;
        const [tunic, tunicShadow] = palette.tunic;

        frameContext.save();
        frameContext.translate(offsetX, offsetY + bob);

        // Shadow sits under the visual sprite only; it has no collision meaning.
        frameContext.fillStyle = "rgba(0, 0, 0, 0.24)";
        frameContext.fillRect(20, 56, 24, 4);
        frameContext.fillRect(24, 59, 16, 2);

        // Legs shift through a small walk cycle while staying inside the LPC frame.
        frameContext.fillStyle = "#49382e";
        frameContext.fillRect(25 + stride, 46, 6, 11);
        frameContext.fillRect(34 - stride, 46, 6, 11);
        frameContext.fillStyle = "#282522";
        frameContext.fillRect(23 + stride, 55, 9, 4);
        frameContext.fillRect(33 - stride, 55, 9, 4);

        // Torso and belt.
        frameContext.fillStyle = tunicShadow;
        frameContext.fillRect(20, 30, 24, 18);
        frameContext.fillStyle = tunic;
        frameContext.fillRect(22, 29, 20, 16);
        frameContext.fillStyle = "#4b3525";
        frameContext.fillRect(20, 43, 24, 4);
        frameContext.fillStyle = "#c79a45";
        frameContext.fillRect(31, 43, 3, 4);

        // Arms are deliberately simple placeholders; real LPC sheets replace this whole frame.
        frameContext.fillStyle = skinShadow;
        frameContext.fillRect(17, 32, 5, 13);
        frameContext.fillRect(42, 32, 5, 13);
        frameContext.fillStyle = skin;
        frameContext.fillRect(18, 32, 4, 10);
        frameContext.fillRect(42, 32, 4, 10);

        // Head and hair vary slightly by direction so facing is readable even before LPC art arrives.
        frameContext.fillStyle = skinShadow;
        frameContext.fillRect(23, 13, 18, 18);
        frameContext.fillStyle = skin;
        frameContext.fillRect(24, 12, 16, 17);
        frameContext.fillStyle = palette.hair;
        frameContext.fillRect(23, 10, 18, 7);
        frameContext.fillRect(22, 14, 4, 11);
        frameContext.fillRect(39, 14, 4, 11);

        if (row === LPC_DIRECTION_ROWS.south) {
            frameContext.fillStyle = "#302821";
            frameContext.fillRect(27, 20, 2, 2);
            frameContext.fillRect(35, 20, 2, 2);
            frameContext.fillRect(31, 25, 4, 1);
        } else if (row === LPC_DIRECTION_ROWS.west) {
            frameContext.fillStyle = "#302821";
            frameContext.fillRect(26, 20, 2, 2);
            frameContext.fillStyle = skinShadow;
            frameContext.fillRect(23, 22, 2, 3);
        } else if (row === LPC_DIRECTION_ROWS.east) {
            frameContext.fillStyle = "#302821";
            frameContext.fillRect(36, 20, 2, 2);
            frameContext.fillStyle = skinShadow;
            frameContext.fillRect(39, 22, 2, 3);
        } else {
            frameContext.fillStyle = palette.hair;
            frameContext.fillRect(25, 17, 15, 8);
        }

        frameContext.restore();
    }

    function placeholderSheet(characterId) {
        const cached = placeholderSheets.get(characterId);
        if (cached) return cached;

        const sheet = document.createElement("canvas");
        sheet.width = LPC_FRAME_SIZE * LPC_WALK_FRAMES;
        sheet.height = LPC_FRAME_SIZE * 4;
        const sheetContext = sheet.getContext("2d");
        sheetContext.imageSmoothingEnabled = false;
        const palette = paletteForCharacter(characterId);
        for (let row = 0; row < 4; row++) {
            for (let frame = 0; frame < LPC_WALK_FRAMES; frame++) {
                drawPlaceholderFrame(sheetContext, frame, row, palette);
            }
        }
        placeholderSheets.set(characterId, sheet);
        return sheet;
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

    function characterAnimationState(entity) {
        const previous = entityFromPreviousFrame(entity.id);
        const dx = previous ? entity.position.x - previous.position.x : 0;
        const dy = previous ? entity.position.y - previous.position.y : 0;
        const moving = Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001;
        const direction = directionFromDelta(dx, dy) ?? facingByCharacter.get(entity.id) ?? "south";
        facingByCharacter.set(entity.id, direction);

        // Keep this contract close to LPC: a direction row plus an animation frame index.
        // The placeholder uses nine walk columns; imported LPC profiles can supply the same
        // information without changing simulation or map rendering code.
        const frame = moving ? frameIndex % LPC_WALK_FRAMES : 0;
        return { animation: moving ? "walk" : "idle", direction, frame };
    }

    function characterSpriteSize(project) {
        return clamp(
            project.scale * CHARACTER_VISUAL_HEIGHT_METRES,
            MIN_CHARACTER_SPRITE_PIXELS,
            MAX_CHARACTER_SPRITE_PIXELS
        );
    }

    function characterSpriteBounds(entity, project) {
        const point = project(entity.position);
        const size = characterSpriteSize(project);
        return {
            left: point.x - size / 2,
            right: point.x + size / 2,
            top: point.y - size * 0.9,
            bottom: point.y + size * 0.1
        };
    }

    function drawCharacterSprite(entity, project) {
        const state = characterAnimationState(entity);
        const row = LPC_DIRECTION_ROWS[state.direction];
        const sheet = placeholderSheet(entity.id);
        const bounds = characterSpriteBounds(entity, project);
        const width = Math.max(1, Math.round(bounds.right - bounds.left));
        const height = Math.max(1, Math.round(bounds.bottom - bounds.top));

        context.save();
        context.imageSmoothingEnabled = false;
        context.drawImage(
            sheet,
            state.frame * LPC_FRAME_SIZE,
            row * LPC_FRAME_SIZE,
            LPC_FRAME_SIZE,
            LPC_FRAME_SIZE,
            Math.round(bounds.left),
            Math.round(bounds.top),
            width,
            height
        );

        const selected = entity.id === selectedEntityId;
        if (selected) {
            const point = project(entity.position);
            context.strokeStyle = "#f2cc60";
            context.lineWidth = 2;
            context.beginPath();
            context.ellipse(point.x, point.y + 1, width * 0.34, Math.max(3, height * 0.08), 0, 0, Math.PI * 2);
            context.stroke();
        }

        if (!deferRaisedEntityLabels && shouldDrawLabel(entity, project)) {
            context.font = "600 12px system-ui";
            context.fillStyle = selected ? "#f2cc60" : "#f0f6fc";
            context.textAlign = "center";
            context.textBaseline = "bottom";
            context.shadowColor = "rgba(0, 0, 0, 0.9)";
            context.shadowBlur = 3;
            context.fillText(entity.label ?? entity.id, (bounds.left + bounds.right) / 2, bounds.top - 3);
        }
        context.restore();
    }

    const entityScreenBoundsBeforeCharacterRenderer = entityScreenBounds;
    entityScreenBounds = function(entity, project) {
        if (entity.category === "character") return characterSpriteBounds(entity, project);
        return entityScreenBoundsBeforeCharacterRenderer(entity, project);
    };

    const drawEntityBeforeCharacterRenderer = drawEntity;
    drawEntity = function(entity, point, project) {
        if (entity.category === "character") {
            drawCharacterSprite(entity, project);
            return;
        }
        drawEntityBeforeCharacterRenderer(entity, point, project);
    };

    window.VillageCharacterRenderer = Object.freeze({
        frameSize: LPC_FRAME_SIZE,
        directionRows: LPC_DIRECTION_ROWS,
        placeholderWalkFrames: LPC_WALK_FRAMES
    });
})();