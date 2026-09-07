// The navigation grid defines north as decreasing Y. The original viewer used a
// mathematical Y-up projection, which put navigation north at the bottom of the
// screen. Keep the viewer aligned with the simulation's cardinal directions.
projection = function() {
    const scale = Math.max(0.0001, camera.scale);
    const project = position => ({
        x: canvasWidth / 2 + (position.x - camera.x) * scale,
        y: canvasHeight / 2 + (position.y - camera.y) * scale
    });
    project.scale = scale;
    project.unproject = point => ({
        x: camera.x + (point.x - canvasWidth / 2) / scale,
        y: camera.y + (point.y - canvasHeight / 2) / scale
    });
    return project;
};

setCameraScale = function(nextScale, anchor = { x: canvasWidth / 2, y: canvasHeight / 2 }) {
    if (!cameraInitialised) return;
    const project = projection();
    const anchorWorld = project.unproject(anchor);
    const limits = cameraScaleLimits();
    camera.scale = clamp(nextScale, limits.min, limits.max);
    camera.x = anchorWorld.x - (anchor.x - canvasWidth / 2) / camera.scale;
    camera.y = anchorWorld.y - (anchor.y - canvasHeight / 2) / camera.scale;
};

// The pointer listener was registered by viewer.js before this extension loaded.
// Replace only the movement handler so pan/pinch Y maths follows the north-up
// projection while retaining the existing pointer-down/selection behaviour.
const originalPointerMoveHandler = handlePointerMove;
canvas.removeEventListener("pointermove", originalPointerMoveHandler);
handlePointerMove = function(event) {
    if (!activePointers.has(event.pointerId)) return;
    const point = pointerPosition(event);
    activePointers.set(event.pointerId, point);
    if (activePointers.size >= 2) {
        if (!pinchStart) startPinchGesture();
        const points = [...activePointers.values()];
        const [first, second] = points;
        const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        const limits = cameraScaleLimits();
        camera.scale = clamp(pinchStart.scale * distance / pinchStart.distance, limits.min, limits.max);
        camera.x = pinchStart.anchorWorld.x - (midpoint.x - canvasWidth / 2) / camera.scale;
        camera.y = pinchStart.anchorWorld.y - (midpoint.y - canvasHeight / 2) / camera.scale;
        followSelected = false;
        pointerDragged = true;
        canvas.classList.add("dragging");
        updateFollowButton();
        renderMap();
        return;
    }
    if (!panStart) return;
    const dx = point.x - panStart.screen.x;
    const dy = point.y - panStart.screen.y;
    if (Math.hypot(dx, dy) > 3) {
        pointerDragged = true;
        followSelected = false;
        canvas.classList.add("dragging");
        updateFollowButton();
    }
    if (!pointerDragged) return;
    camera.x = panStart.camera.x - dx / camera.scale;
    camera.y = panStart.camera.y - dy / camera.scale;
    renderMap();
};
canvas.addEventListener("pointermove", handlePointerMove);

const baseIncludeEntityBounds = includeEntityBounds;
includeEntityBounds = function(include, entity) {
    const geometry = entity.geometry;
    if (geometry?.type === "polyline") {
        const padding = Math.max(0, geometry.width ?? 0) / 2;
        for (const point of geometry.points ?? []) {
            include(point.x - padding, point.y - padding);
            include(point.x + padding, point.y + padding);
        }
        return;
    }
    if (geometry?.type === "polygon") {
        for (const point of geometry.points ?? []) include(point.x, point.y);
        return;
    }
    baseIncludeEntityBounds(include, entity);
};

const baseEntityScreenBounds = entityScreenBounds;
entityScreenBounds = function(entity, project) {
    const geometry = entity.geometry;
    if (geometry?.type === "polyline" || geometry?.type === "polygon") {
        const points = (geometry.points ?? []).map(project);
        if (points.length === 0) return undefined;
        const padding = geometry.type === "polyline"
            ? Math.max(2, (geometry.width ?? 0) * project.scale / 2)
            : 2;
        return {
            left: Math.min(...points.map(point => point.x)) - padding,
            right: Math.max(...points.map(point => point.x)) + padding,
            top: Math.min(...points.map(point => point.y)) - padding,
            bottom: Math.max(...points.map(point => point.y)) + padding
        };
    }
    return baseEntityScreenBounds(entity, project);
};

function drawMapFeature(entity, project) {
    const geometry = entity.geometry;
    const selected = entity.id === selectedEntityId;
    context.save();

    if (geometry?.type === "polygon" && geometry.points.length > 0) {
        const points = geometry.points.map(project);
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) context.lineTo(point.x, point.y);
        context.closePath();
        if (entity.subtype === "forest") {
            context.fillStyle = selected ? "rgba(63, 185, 80, 0.34)" : "rgba(46, 125, 50, 0.24)";
            context.strokeStyle = selected ? "#f2cc60" : "#2ea043";
        } else {
            context.fillStyle = selected ? "rgba(242, 204, 96, 0.28)" : "rgba(210, 153, 34, 0.12)";
            context.strokeStyle = selected ? "#f2cc60" : "rgba(210, 153, 34, 0.55)";
        }
        context.lineWidth = selected ? 2.5 : 1.2;
        context.fill();
        context.stroke();
    } else if (geometry?.type === "polyline" && geometry.points.length > 1) {
        const points = geometry.points.map(project);
        context.strokeStyle = selected ? "#f2cc60" : "rgba(177, 143, 91, 0.72)";
        context.lineWidth = Math.max(2, geometry.width * project.scale);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) context.lineTo(point.x, point.y);
        context.stroke();
        context.strokeStyle = selected ? "#f2cc60" : "rgba(217, 183, 129, 0.42)";
        context.lineWidth = Math.max(1, geometry.width * project.scale * 0.55);
        context.stroke();
    } else if (geometry?.type === "centered-rectangle") {
        const point = project(entity.position);
        const width = Math.max(3, geometry.width * project.scale);
        const height = Math.max(3, geometry.height * project.scale);
        context.strokeStyle = selected ? "#f2cc60" : "rgba(139, 148, 158, 0.7)";
        context.lineWidth = selected ? 2 : 1;
        context.setLineDash([5, 4]);
        context.strokeRect(point.x - width / 2, point.y - height / 2, width, height);
        context.setLineDash([]);
    }

    if (selected || (entity.subtype === "market-square" && project.scale >= 5) || (entity.subtype === "forest" && project.scale >= 5)) {
        const point = project(entity.position);
        context.font = "600 11px system-ui";
        context.fillStyle = selected ? "#f2cc60" : "#8b949e";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.fillText(entity.label ?? entity.id, point.x, point.y - 6);
    }
    context.restore();
}

const baseDrawEntity = drawEntity;
drawEntity = function(entity, point, project) {
    if (entity.category === "map-feature") {
        drawMapFeature(entity, project);
        return;
    }
    baseDrawEntity(entity, point, project);
};
