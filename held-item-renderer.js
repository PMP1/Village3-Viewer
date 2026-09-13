(() => {
    const BUCKET_ASSET_PATH = "./assets/items/bucket.png";
    const BUCKET_INLINE_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAPCAYAAAAyPTUwAAABDUlEQVR4nI2QLWvDUBSGnwQmQqERG0QMWlhUTUgYEYm4RMTXT/YXVJWJMVEm9ktm9weqIloxRqCmatCIiUIDW8xExZ26t/lYy46559z7nHPe+0IrYpHK+8cnGYtUtt/+BOv1v8CTDafAdoOpLp7nD8ZZjYAZi1SKJDkLiSQhFqk0YpHKn483RlcXBMM+eVF1zs3+gOWGmMtsoddHntOYWK+X2cIwASw3ZDCeMst6bG2f0p+wtX1mWY/BeIrlhgAYAMG1Le9uL4k8h9V619H88l6Sf34b2o28qDSYF5WWkBfV0Q2VBMM+kefoj63WO5134NKfNDS/ft3oXIV2oq1bTVV6G7BqqPu92R80CPALIZl8S+NPo08AAAAASUVORK5CYII=";
    const BUCKET_NATIVE_WIDTH = 11;
    const BUCKET_NATIVE_HEIGHT = 15;
    const WORLD_PIXELS_PER_METRE = 32;
    const BUCKET_WIDTH_METRES = BUCKET_NATIVE_WIDTH / WORLD_PIXELS_PER_METRE;
    const BUCKET_HEIGHT_METRES = BUCKET_NATIVE_HEIGHT / WORLD_PIXELS_PER_METRE;
    const BUCKET_SIDE_OFFSET_METRES = 0.16;
    const BUCKET_BOTTOM_OFFSET_METRES = 0.04;

    const bucketImage = new Image();
    let bucketReady = false;
    let bucketFailed = false;

    bucketImage.addEventListener("load", () => {
        bucketReady = true;
        bucketFailed = false;
        if (recording && cameraInitialised) renderMap();
    });
    bucketImage.addEventListener("error", () => {
        bucketReady = false;
        bucketFailed = true;
    });
    const bundledAssets = window.__VILLAGE_VIEWER_ASSETS__;
    bucketImage.src = bundledAssets
        ? bundledAssets[BUCKET_ASSET_PATH] ?? BUCKET_INLINE_DATA
        : BUCKET_ASSET_PATH;

    function heldBucketHands(entity) {
        const properties = entity?.properties ?? {};
        const hands = [];
        if (properties.heldItemLeft === "bucket") hands.push("left");
        if (properties.heldItemRight === "bucket") hands.push("right");
        return hands;
    }

    function bucketSpriteBounds(entity, project, hand) {
        const characterBounds = window.VillageCharacterRenderer?.characterSpriteBounds(entity, project);
        if (!characterBounds) return undefined;

        const width = Math.max(1, Math.round(project.scale * BUCKET_WIDTH_METRES));
        const height = Math.max(1, Math.round(project.scale * BUCKET_HEIGHT_METRES));
        const sideOffset = Math.max(1, Math.round(project.scale * BUCKET_SIDE_OFFSET_METRES));
        const bottomOffset = Math.max(1, Math.round(project.scale * BUCKET_BOTTOM_OFFSET_METRES));
        const left = hand === "left"
            ? Math.round(characterBounds.groundX - sideOffset - width)
            : Math.round(characterBounds.groundX + sideOffset);
        const top = Math.round(characterBounds.groundY - bottomOffset - height);

        return { left, top, width, height };
    }

    function drawHeldItems(entity, project) {
        if (!bucketReady || entity?.category !== "character") return false;
        const hands = heldBucketHands(entity);
        if (hands.length === 0) return false;

        context.save();
        context.imageSmoothingEnabled = false;
        for (const hand of hands) {
            const bounds = bucketSpriteBounds(entity, project, hand);
            if (!bounds) continue;
            context.drawImage(bucketImage, bounds.left, bounds.top, bounds.width, bounds.height);
        }
        context.restore();
        return true;
    }

    const drawEntityBeforeHeldItems = drawEntity;
    drawEntity = function(entity, point, project) {
        drawEntityBeforeHeldItems(entity, point, project);
        drawHeldItems(entity, project);
    };

    window.VillageHeldItemRenderer = Object.freeze({
        bucketAssetPath: BUCKET_ASSET_PATH,
        bucketNativeWidth: BUCKET_NATIVE_WIDTH,
        bucketNativeHeight: BUCKET_NATIVE_HEIGHT,
        bucketWidthMetres: BUCKET_WIDTH_METRES,
        bucketHeightMetres: BUCKET_HEIGHT_METRES,
        heldBucketHands,
        bucketSpriteBounds,
        drawHeldItems,
        get ready() { return bucketReady; },
        get failed() { return bucketFailed; }
    });
})();
