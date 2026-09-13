(() => {
    const LPC_FRAME_SIZE = 64;
    const LPC_WALK_FRAMES = 9;
    const LPC_DIRECTION_ROWS = Object.freeze({
        north: 0,
        west: 1,
        south: 2,
        east: 3
    });
    const LPC_TEMPLATE_PATH = "./assets/characters/lpc-villager-template.svg";
    const LPC_SHEET_WIDTH = LPC_FRAME_SIZE * LPC_WALK_FRAMES;
    const LPC_SHEET_HEIGHT = LPC_FRAME_SIZE * 4;
    // The native LPC frame is visual space only: it has no collision meaning and
    // does not change the simulation/navigation grid from one metre per cell.
    const LPC_VISUAL_SIZE_METRES = 2;
    const LPC_GROUND_ANCHOR_Y = 58;
    const MIN_CHARACTER_SPRITE_PIXELS = 24;
    const MAX_CHARACTER_SPRITE_PIXELS = 128;

    const characterSheets = new Map();
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
    const trouserPalettes = ["#4d566d", "#625147", "#3e5d50", "#554968", "#665c3f"];

    const templateImage = new Image();
    let templateReady = false;
    let templateFailed = false;
    templateImage.addEventListener("load", () => {
        templateReady = true;
        characterSheets.clear();
        if (recording && cameraInitialised) renderMap();
    });
    templateImage.addEventListener("error", () => {
        templateFailed = true;
    });
    templateImage.src = window.__VILLAGE_VIEWER_ASSETS__?.[LPC_TEMPLATE_PATH] ?? LPC_TEMPLATE_PATH;

    function stableHash(value) {
        let hash = 2166136261;
        for (const character of String(value)) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function appearanceForCharacter(id) {
        const hash = stableHash(id);
        const skin = skinPalettes[hash % skinPalettes.length];
        const tunic = tunicPalettes[Math.floor(hash / 7) % tunicPalettes.length];
        return Object.freeze({
            skinLight: skin[0],
            skinShadow: skin[1],
            tunicLight: tunic[0],
            tunicShadow: tunic[1],
            hair: hairPalettes[Math.floor(hash / 31) % hairPalettes.length],
            trousers: trouserPalettes[Math.floor(hash / 97) % trouserPalettes.length]
        });
    }

    function hexRgb(hex) {
        const value = Number.parseInt(hex.slice(1), 16);
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }

    function replaceRgb(data, offset, rgb) {
        data[offset] = rgb[0];
        data[offset + 1] = rgb[1];
        data[offset + 2] = rgb[2];
    }

    function recolourTemplatePixels(imageData, appearance) {
        const skinLight = hexRgb(appearance.skinLight);
        const skinShadow = hexRgb(appearance.skinShadow);
        const tunicLight = hexRgb(appearance.tunicLight);
        const tunicShadow = hexRgb(appearance.tunicShadow);
        const hair = hexRgb(appearance.hair);
        const trousers = hexRgb(appearance.trousers);
        const data = imageData.data;

        for (let offset = 0; offset < data.length; offset += 4) {
            if (data[offset + 3] === 0) continue;
            const r = data[offset];
            const g = data[offset + 1];
            const b = data[offset + 2];
            if (r === 255 && g === 0 && b === 255) replaceRgb(data, offset, skinLight);
            else if (r === 170 && g === 0 && b === 170) replaceRgb(data, offset, skinShadow);
            else if (r === 0 && g === 255 && b === 255) replaceRgb(data, offset, tunicLight);
            else if (r === 0 && g === 136 && b === 136) replaceRgb(data, offset, tunicShadow);
            else if (r === 255 && g === 255 && b === 0) replaceRgb(data, offset, hair);
            else if (r === 0 && g === 0 && b === 255) replaceRgb(data, offset, trousers);
        }
        return imageData;
    }

    function characterSheet(characterId) {
        const cached = characterSheets.get(characterId);
        if (cached) return cached;
        if (!templateReady) return undefined;

        const sheet = document.createElement("canvas");
        sheet.width = LPC_SHEET_WIDTH;
        sheet.height = LPC_SHEET_HEIGHT;
        const sheetContext = sheet.getContext("2d");
        if (!sheetContext) return undefined;
        sheetContext.imageSmoothingEnabled = false;
        sheetContext.drawImage(templateImage, 0, 0, LPC_SHEET_WIDTH, LPC_SHEET_HEIGHT);
        const pixels = sheetContext.getImageData(0, 0, LPC_SHEET_WIDTH, LPC_SHEET_HEIGHT);
        recolourTemplatePixels(pixels, appearanceForCharacter(characterId));
        sheetContext.clearRect(0, 0, LPC_SHEET_WIDTH, LPC_SHEET_HEIGHT);
        sheetContext.putImageData(pixels, 0, 0);
        characterSheets.set(characterId, sheet);
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

    function drawCharacterSprite(entity, project) {
        const sheet = characterSheet(entity.id);
        if (!sheet) return false;
        const state = characterAnimationState(entity);
        const row = LPC_DIRECTION_ROWS[state.direction];
        const bounds = characterSpriteBounds(entity, project);
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));

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
        assetPath: LPC_TEMPLATE_PATH,
        frameSize: LPC_FRAME_SIZE,
        sheetWidth: LPC_SHEET_WIDTH,
        sheetHeight: LPC_SHEET_HEIGHT,
        directionRows: LPC_DIRECTION_ROWS,
        walkFrames: LPC_WALK_FRAMES,
        visualSizeMetres: LPC_VISUAL_SIZE_METRES,
        groundAnchorY: LPC_GROUND_ANCHOR_Y,
        appearanceForCharacter,
        directionFromDelta,
        characterAnimationState,
        characterSpriteBounds,
        recolourTemplatePixels,
        get ready() { return templateReady; },
        get failed() { return templateFailed; }
    });
})();
