const SCHEMA_VERSION = 1;
const CHARACTER_DIAMETER_METRES = 0.6;
const CHARACTER_MIN_RADIUS_PIXELS = 2;
const CHARACTER_SELECTION_RING_GAP_PIXELS = 4;
const CAMERA_PADDING_PIXELS = 34;
const FOLLOW_MIN_SCALE = 10;
const FOLLOW_DEAD_ZONE_FRACTION = 0.22;
const root = document;
const canvas = root.querySelector("#map");
const context = canvas.getContext("2d");
const timeElement = root.querySelector("#time");
const tickElement = root.querySelector("#tick");
const durationElement = root.querySelector("#duration");
const statusElement = root.querySelector("#status");
const timeline = root.querySelector("#timeline");
const playButton = root.querySelector("#play");
const restartButton = root.querySelector("#restart");
const backButton = root.querySelector("#back");
const forwardButton = root.querySelector("#forward");
const zoomInButton = root.querySelector("#zoom-in");
const zoomOutButton = root.querySelector("#zoom-out");
const fitWorldButton = root.querySelector("#fit-world");
const followSelectedButton = root.querySelector("#follow-selected");
const eventsElement = root.querySelector("#events");
const inspectorElement = root.querySelector("#inspector");
const speedButtons = [...root.querySelectorAll("[data-speed]")];

let recording;
let frameIndex = 0;
let speed = 1;
let selectedEntityId;
let playbackTimer;
let worldBounds;
let canvasWidth = 1;
let canvasHeight = 1;
let projectedEntities = [];
let cameraInitialised = false;
let followSelected = false;
const camera = { x: 0, y: 0, scale: 1 };
const activePointers = new Map();
let panStart;
let pinchStart;
let pointerDragged = false;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return "—";
    return Math.abs(value - Math.round(value)) < 0.0001 ? String(Math.round(value)) : value.toFixed(2);
}

function formatTime(time) {
    return `Day ${time.day} ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

function humanize(value) {
    return String(value)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .replace(/^./, character => character.toUpperCase());
}

function rectangularFootprint(entity) {
    return entity.geometry?.type === "rectangular-footprint" ? entity.geometry : undefined;
}

function includeEntityBounds(include, entity) {
    const { x, y } = entity.position ?? {};
    include(x, y);

    const geometry = entity.geometry;
    if (geometry?.type === "rectangular-footprint") {
        include(geometry.origin.x, geometry.origin.y);
        include(geometry.origin.x + geometry.width, geometry.origin.y + geometry.height);
    } else if (geometry?.type === "circle") {
        include(x - geometry.radius, y - geometry.radius);
        include(x + geometry.radius, y + geometry.radius);
    } else if (geometry?.type === "centered-rectangle") {
        include(x - geometry.width / 2, y - geometry.height / 2);
        include(x + geometry.width / 2, y + geometry.height / 2);
    }
}

function calculateWorldBounds(frames) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const include = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    };

    for (const frame of frames) {
        for (const entity of frame.entities ?? []) includeEntityBounds(include, entity);
    }

    if (!Number.isFinite(minX)) return { minX: -10, maxX: 10, minY: -10, maxY: 10 };
    const xRange = Math.max(1, maxX - minX);
    const yRange = Math.max(1, maxY - minY);
    return {
        minX: minX - xRange * 0.08,
        maxX: maxX + xRange * 0.08,
        minY: minY - yRange * 0.08,
        maxY: maxY + yRange * 0.08
    };
}

function fittedScale() {
    if (!worldBounds) return 1;
    const width = Math.max(1, canvasWidth - CAMERA_PADDING_PIXELS * 2);
    const height = Math.max(1, canvasHeight - CAMERA_PADDING_PIXELS * 2);
    const worldWidth = Math.max(1, worldBounds.maxX - worldBounds.minX);
    const worldHeight = Math.max(1, worldBounds.maxY - worldBounds.minY);
    return Math.min(width / worldWidth, height / worldHeight);
}

function cameraScaleLimits() {
    const fit = Math.max(0.01, fittedScale());
    return {
        min: fit * 0.5,
        max: Math.max(40, fit * 30)
    };
}

function fitWorld() {
    if (!worldBounds) return;
    camera.x = (worldBounds.minX + worldBounds.maxX) / 2;
    camera.y = (worldBounds.minY + worldBounds.maxY) / 2;
    camera.scale = fittedScale();
    cameraInitialised = true;
    followSelected = false;
    updateFollowButton();
}

function projection() {
    const scale = Math.max(0.0001, camera.scale);
    const project = position => ({
        x: canvasWidth / 2 + (position.x - camera.x) * scale,
        y: canvasHeight / 2 - (position.y - camera.y) * scale
    });
    project.scale = scale;
    project.unproject = point => ({
        x: camera.x + (point.x - canvasWidth / 2) / scale,
        y: camera.y - (point.y - canvasHeight / 2) / scale
    });
    return project;
}

function setCameraScale(nextScale, anchor = { x: canvasWidth / 2, y: canvasHeight / 2 }) {
    if (!cameraInitialised) return;
    const project = projection();
    const anchorWorld = project.unproject(anchor);
    const limits = cameraScaleLimits();
    camera.scale = clamp(nextScale, limits.min, limits.max);
    camera.x = anchorWorld.x - (anchor.x - canvasWidth / 2) / camera.scale;
    camera.y = anchorWorld.y + (anchor.y - canvasHeight / 2) / camera.scale;
}

function visibleWorldBounds(project) {
    const first = project.unproject({ x: 0, y: canvasHeight });
    const second = project.unproject({ x: canvasWidth, y: 0 });
    return {
        minX: Math.min(first.x, second.x),
        maxX: Math.max(first.x, second.x),
        minY: Math.min(first.y, second.y),
        maxY: Math.max(first.y, second.y)
    };
}

function chooseGridSize(scale) {
    const sizes = [1, 2, 5, 10, 20, 50, 100, 200];
    return sizes.find(size => size * scale >= 62) ?? sizes.at(-1);
}

function drawGrid(project) {
    const bounds = visibleWorldBounds(project);
    const gridSize = chooseGridSize(project.scale);
    const startX = Math.ceil(bounds.minX / gridSize) * gridSize;
    const startY = Math.ceil(bounds.minY / gridSize) * gridSize;

    context.save();
    context.strokeStyle = "#161b22";
    context.fillStyle = "#6e7681";
    context.lineWidth = 1;
    context.font = "11px system-ui";

    for (let x = startX; x <= bounds.maxX; x += gridSize) {
        const point = project({ x, y: 0 });
        context.beginPath();
        context.moveTo(point.x, 0);
        context.lineTo(point.x, canvasHeight);
        context.stroke();
        if (point.x >= 0 && point.x <= canvasWidth - 24) context.fillText(String(x), point.x + 3, canvasHeight - 6);
    }

    for (let y = startY; y <= bounds.maxY; y += gridSize) {
        const point = project({ x: 0, y });
        context.beginPath();
        context.moveTo(0, point.y);
        context.lineTo(canvasWidth, point.y);
        context.stroke();
        if (point.y >= 12 && point.y <= canvasHeight) context.fillText(String(y), 4, point.y - 4);
    }
    context.restore();
}

function entityAtFrame(frame, id) {
    return frame.entities.find(entity => entity.id === id);
}

function selectedEntity() {
    if (!recording || !selectedEntityId) return undefined;
    return entityAtFrame(recording.frames[frameIndex], selectedEntityId);
}

function updateFollowButton() {
    const entity = selectedEntity();
    const canFollow = entity?.category === "character";
    if (!canFollow && followSelected) followSelected = false;
    followSelectedButton.disabled = !canFollow;
    followSelectedButton.textContent = canFollow ? `Follow ${entity.label ?? entity.id}` : "Follow selected";
    followSelectedButton.setAttribute("aria-pressed", String(Boolean(canFollow && followSelected)));
}

function updateFollowCamera(frame, immediate = false) {
    if (!followSelected || !selectedEntityId) return;
    const entity = entityAtFrame(frame, selectedEntityId);
    if (!entity || entity.category !== "character") {
        followSelected = false;
        updateFollowButton();
        return;
    }

    if (immediate) {
        camera.x = entity.position.x;
        camera.y = entity.position.y;
        return;
    }

    const halfDeadX = canvasWidth * FOLLOW_DEAD_ZONE_FRACTION / camera.scale;
    const halfDeadY = canvasHeight * FOLLOW_DEAD_ZONE_FRACTION / camera.scale;
    const dx = entity.position.x - camera.x;
    const dy = entity.position.y - camera.y;

    if (dx > halfDeadX) camera.x = entity.position.x - halfDeadX;
    else if (dx < -halfDeadX) camera.x = entity.position.x + halfDeadX;

    if (dy > halfDeadY) camera.y = entity.position.y - halfDeadY;
    else if (dy < -halfDeadY) camera.y = entity.position.y + halfDeadY;
}

function drawSelectedTrail(project) {
    if (!selectedEntityId || frameIndex <= 0) return;
    const points = [];
    const firstFrame = Math.max(0, frameIndex - 180);
    for (let index = firstFrame; index <= frameIndex; index++) {
        const entity = entityAtFrame(recording.frames[index], selectedEntityId);
        if (entity) points.push(project(entity.position));
    }
    if (points.length < 2) return;

    context.save();
    context.strokeStyle = "rgba(242, 204, 96, 0.55)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
}

function drawMovementTarget(entity, point, project) {
    if (!entity.state?.movementTarget) return;
    if (entity.id !== selectedEntityId && project.scale < 8) return;
    const target = project(entity.state.movementTarget);
    context.save();
    context.strokeStyle = entity.id === selectedEntityId ? "#f2cc60" : "rgba(139, 148, 158, 0.45)";
    context.lineWidth = entity.id === selectedEntityId ? 2 : 1;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(target.x, target.y);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(target.x, target.y, 3, 0, Math.PI * 2);
    context.stroke();
    context.restore();
}

function footprintSidePoint(footprint, side, offset) {
    if (side === "north") return { x: footprint.origin.x + offset, y: footprint.origin.y };
    if (side === "south") return { x: footprint.origin.x + offset, y: footprint.origin.y + footprint.height };
    if (side === "west") return { x: footprint.origin.x, y: footprint.origin.y + offset };
    return { x: footprint.origin.x + footprint.width, y: footprint.origin.y + offset };
}

function footprintSideLength(footprint, side) {
    return side === "north" || side === "south" ? footprint.width : footprint.height;
}

function strokeWorldSegment(project, from, to) {
    const start = project(from);
    const end = project(to);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
}

function drawFootprintSide(footprint, side, project, wallStroke) {
    const doors = (footprint.doors ?? []).filter(door => door.side === side).sort((a, b) => a.offset - b.offset);
    const length = footprintSideLength(footprint, side);
    let cursor = 0;

    context.strokeStyle = wallStroke;
    context.lineWidth = clamp(project.scale * 0.12, 1, 3);
    context.setLineDash([]);
    for (const door of doors) {
        const start = clamp(door.offset, 0, length);
        const end = clamp(door.offset + 1, 0, length);
        if (start > cursor) strokeWorldSegment(project, footprintSidePoint(footprint, side, cursor), footprintSidePoint(footprint, side, start));
        cursor = Math.max(cursor, end);
    }
    if (cursor < length) strokeWorldSegment(project, footprintSidePoint(footprint, side, cursor), footprintSidePoint(footprint, side, length));

    for (const door of doors) {
        context.strokeStyle = door.state === "open" ? "#3fb950" : door.state === "locked" ? "#f85149" : "#d29922";
        context.lineWidth = door.state === "open" ? clamp(project.scale * 0.1, 1, 2) : clamp(project.scale * 0.16, 1.5, 4);
        context.setLineDash(door.state === "open" ? [3, 3] : []);
        strokeWorldSegment(project, footprintSidePoint(footprint, side, door.offset), footprintSidePoint(footprint, side, door.offset + 1));
    }
    context.setLineDash([]);
}

function entityScreenBounds(entity, project) {
    const footprint = rectangularFootprint(entity);
    if (footprint) {
        const first = project(footprint.origin);
        const second = project({ x: footprint.origin.x + footprint.width, y: footprint.origin.y + footprint.height });
        return {
            left: Math.min(first.x, second.x), right: Math.max(first.x, second.x),
            top: Math.min(first.y, second.y), bottom: Math.max(first.y, second.y)
        };
    }

    const geometry = entity.geometry;
    const point = project(entity.position);
    if (geometry?.type === "circle") {
        const radius = Math.max(1.5, geometry.radius * project.scale);
        return { left: point.x - radius, right: point.x + radius, top: point.y - radius, bottom: point.y + radius };
    }
    if (geometry?.type === "centered-rectangle") {
        const halfWidth = Math.max(1.5, geometry.width * project.scale / 2);
        const halfHeight = Math.max(1.5, geometry.height * project.scale / 2);
        return { left: point.x - halfWidth, right: point.x + halfWidth, top: point.y - halfHeight, bottom: point.y + halfHeight };
    }
    return undefined;
}

function drawPhysicalBuilding(entity, project) {
    const footprint = rectangularFootprint(entity);
    if (!footprint) return false;
    const selected = entity.id === selectedEntityId;
    const bounds = entityScreenBounds(entity, project);

    context.save();
    context.fillStyle = selected ? "rgba(242, 204, 96, 0.16)" : "rgba(137, 87, 229, 0.18)";
    context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    const wallStroke = selected ? "#f2cc60" : "#e6edf3";
    for (const side of ["north", "east", "south", "west"]) drawFootprintSide(footprint, side, project, wallStroke);

    const labelPoint = project({ x: footprint.origin.x + footprint.width / 2, y: footprint.origin.y + footprint.height });
    context.font = "11px system-ui";
    context.fillStyle = selected ? "#f2cc60" : "#c9d1d9";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(entity.label ?? entity.id, labelPoint.x, labelPoint.y - 5);
    context.restore();
    return true;
}

function characterScreenRadius(project) {
    return Math.max(CHARACTER_MIN_RADIUS_PIXELS, project.scale * CHARACTER_DIAMETER_METRES / 2);
}

function genericObjectRadiusMetres(entity) {
    const visualSize = entity.properties?.visualSize;
    if (visualSize === "large") return 0.8;
    if (visualSize === "medium") return 0.55;
    if (visualSize === "small") return 0.35;
    return 0.3;
}

function shouldDrawLabel(entity, project) {
    if (entity.id === selectedEntityId) return true;
    if (entity.subtype === "building") return true;
    if (entity.category === "character") return project.scale >= 3;
    if (entity.subtype === "fountain") return project.scale >= 7;
    if (entity.properties?.resourceType || entity.properties?.servicePointServices) return project.scale >= 10;
    return project.scale >= 12;
}

function labelOffset(entity, project) {
    if (entity.category === "character") return characterScreenRadius(project) + 5;
    const geometry = entity.geometry;
    if (geometry?.type === "circle") return Math.max(2, geometry.radius * project.scale) + 5;
    if (geometry?.type === "centered-rectangle") return Math.max(2, geometry.height * project.scale / 2) + 5;
    return Math.max(2, genericObjectRadiusMetres(entity) * project.scale) + 5;
}

function drawPointGeometry(entity, point, project) {
    const geometry = entity.geometry;
    if (geometry?.type === "circle") {
        const radius = Math.max(1.5, geometry.radius * project.scale);
        context.fillStyle = entity.subtype === "fountain" ? "#39c5cf" : "#8b949e";
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        if (entity.subtype === "fountain" && radius >= 4) {
            const cross = radius * 0.65;
            context.beginPath();
            context.moveTo(point.x - cross, point.y); context.lineTo(point.x + cross, point.y);
            context.moveTo(point.x, point.y - cross); context.lineTo(point.x, point.y + cross);
            context.stroke();
        }
        return true;
    }
    if (geometry?.type === "centered-rectangle") {
        const width = Math.max(3, geometry.width * project.scale);
        const height = Math.max(3, geometry.height * project.scale);
        context.fillStyle = entity.properties?.servicePointServices ? "#8957e5" : entity.properties?.resourceType ? "#8b6f47" : "#8b949e";
        context.fillRect(point.x - width / 2, point.y - height / 2, width, height);
        context.strokeRect(point.x - width / 2, point.y - height / 2, width, height);
        return true;
    }
    return false;
}

function drawEntity(entity, point, project) {
    if (entity.subtype === "building" && drawPhysicalBuilding(entity, project)) return;
    const selected = entity.id === selectedEntityId;
    context.save();
    context.lineWidth = selected ? 2.5 : 1.2;
    context.strokeStyle = selected ? "#f2cc60" : "#e6edf3";

    if (entity.category === "character") {
        const radius = characterScreenRadius(project);
        context.fillStyle = "#58a6ff";
        context.lineWidth = 1.25;
        context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
        if (selected) {
            context.strokeStyle = "#f2cc60"; context.lineWidth = 2; context.beginPath();
            context.arc(point.x, point.y, radius + CHARACTER_SELECTION_RING_GAP_PIXELS, 0, Math.PI * 2); context.stroke();
        }
    } else if (!drawPointGeometry(entity, point, project)) {
        const radius = Math.max(1.5, genericObjectRadiusMetres(entity) * project.scale);
        if (entity.subtype === "building") {
            context.fillStyle = "#8957e5";
            context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
            context.strokeRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
        } else if (entity.category === "object") {
            context.fillStyle = "#d29922";
            context.beginPath(); context.moveTo(point.x, point.y - radius);
            context.lineTo(point.x + radius, point.y + radius * 0.85);
            context.lineTo(point.x - radius, point.y + radius * 0.85); context.closePath(); context.fill(); context.stroke();
        } else {
            context.fillStyle = "#8b949e"; context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
        }
    }

    if (shouldDrawLabel(entity, project)) {
        context.font = entity.category === "character" ? "600 12px system-ui" : "11px system-ui";
        context.fillStyle = selected ? "#f2cc60" : "#c9d1d9";
        context.textAlign = "center"; context.textBaseline = "bottom";
        context.fillText(entity.label ?? entity.id, point.x, point.y - labelOffset(entity, project));
    }
    context.restore();
}

function onScreen(item) {
    if (item.bounds) return item.bounds.right >= -40 && item.bounds.left <= canvasWidth + 40 && item.bounds.bottom >= -40 && item.bounds.top <= canvasHeight + 40;
    return item.point.x >= -40 && item.point.x <= canvasWidth + 40 && item.point.y >= -40 && item.point.y <= canvasHeight + 40;
}

function renderMap() {
    if (!recording || !context || !cameraInitialised) return;
    const frame = recording.frames[frameIndex];
    updateFollowCamera(frame);
    const project = projection();

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = "#090d12"; context.fillRect(0, 0, canvasWidth, canvasHeight);
    drawGrid(project); drawSelectedTrail(project);

    projectedEntities = frame.entities.map(entity => ({ entity, point: project(entity.position), bounds: entityScreenBounds(entity, project) }));
    for (const item of projectedEntities.filter(onScreen)) drawMovementTarget(item.entity, item.point, project);
    for (const item of projectedEntities.filter(item => item.entity.category !== "character").filter(onScreen)) drawEntity(item.entity, item.point, project);
    for (const item of projectedEntities.filter(item => item.entity.category === "character").filter(onScreen)) drawEntity(item.entity, item.point, project);
}

function addDefinitionListRow(list, key, value) {
    const term = document.createElement("dt"); term.textContent = humanize(key);
    const description = document.createElement("dd"); description.textContent = String(value);
    list.append(term, description);
}

function renderInspector() {
    inspectorElement.replaceChildren();
    if (!selectedEntityId) {
        const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Select a character, place, or object on the map.";
        inspectorElement.append(empty); return;
    }
    const entity = entityAtFrame(recording.frames[frameIndex], selectedEntityId);
    if (!entity) {
        const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "This entity is not present in the current frame.";
        inspectorElement.append(empty); return;
    }
    const heading = document.createElement("h2"); heading.textContent = entity.label ?? entity.id;
    const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = [entity.category, entity.subtype].filter(Boolean).join(" · ");
    const list = document.createElement("dl"); list.className = "kv";
    addDefinitionListRow(list, "id", entity.id);
    addDefinitionListRow(list, "position", `${formatNumber(entity.position.x)}, ${formatNumber(entity.position.y)}`);
    if (entity.state?.action) addDefinitionListRow(list, "action", entity.state.action);
    if (entity.state?.movementTarget) addDefinitionListRow(list, "movement target", `${formatNumber(entity.state.movementTarget.x)}, ${formatNumber(entity.state.movementTarget.y)}`);

    const footprint = rectangularFootprint(entity);
    if (footprint) {
        addDefinitionListRow(list, "footprint", `${formatNumber(footprint.width)} × ${formatNumber(footprint.height)} m`);
        addDefinitionListRow(list, "footprint origin", `${formatNumber(footprint.origin.x)}, ${formatNumber(footprint.origin.y)}`);
        if ((footprint.doors ?? []).length > 0) addDefinitionListRow(list, "doors", footprint.doors.map(door => `${humanize(door.side)} ${door.state}`).join(", "));
    } else if (entity.geometry?.type === "circle") {
        addDefinitionListRow(list, "display radius", `${formatNumber(entity.geometry.radius)} m`);
    } else if (entity.geometry?.type === "centered-rectangle") {
        addDefinitionListRow(list, "display size", `${formatNumber(entity.geometry.width)} × ${formatNumber(entity.geometry.height)} m`);
    }
    for (const [key, value] of Object.entries(entity.properties ?? {}).sort(([a], [b]) => a.localeCompare(b))) addDefinitionListRow(list, key, value === null ? "—" : value);
    inspectorElement.append(heading, meta, list);
}

function frameForTick(tick) { return recording.frames[clamp(tick, 0, recording.frames.length - 1)]; }
function eventTimeLabel(event) { const frame = frameForTick(event.tick); return `${formatTime(frame.time)} · tick ${event.tick}`; }

function renderEvents() {
    const currentTick = recording.frames[frameIndex].tick;
    const visible = recording.events.filter(event => event.level === "event" && event.tick < currentTick).slice(-80);
    eventsElement.replaceChildren();
    if (visible.length === 0) { const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No events yet."; eventsElement.append(empty); return; }
    const fragment = document.createDocumentFragment();
    for (const event of visible) {
        const row = document.createElement("div"); row.className = "event";
        const time = document.createElement("div"); time.className = "event-time"; time.textContent = eventTimeLabel(event);
        const message = document.createElement("div"); message.textContent = event.message;
        row.append(time, message); fragment.append(row);
    }
    eventsElement.append(fragment); eventsElement.scrollTop = eventsElement.scrollHeight;
}

function renderFrame() {
    if (!recording) return;
    const frame = recording.frames[frameIndex];
    timeElement.textContent = formatTime(frame.time); tickElement.textContent = String(frame.tick); timeline.value = String(frameIndex);
    durationElement.textContent = `${frame.tick} / ${recording.frames.at(-1).tick}`;
    updateFollowButton(); renderMap(); renderEvents(); renderInspector();
}

function setFrameIndex(nextIndex) {
    frameIndex = clamp(Math.round(nextIndex), 0, recording.frames.length - 1);
    if (frameIndex >= recording.frames.length - 1) stopPlayback();
    renderFrame();
}

function playbackDelay() { return Math.max(20, Math.round(450 / speed)); }
function scheduleNextFrame() {
    clearTimeout(playbackTimer);
    playbackTimer = setTimeout(() => {
        if (frameIndex >= recording.frames.length - 1) { stopPlayback(); return; }
        frameIndex += 1; renderFrame(); scheduleNextFrame();
    }, playbackDelay());
}
function startPlayback() { if (frameIndex >= recording.frames.length - 1) frameIndex = 0; playButton.textContent = "Pause"; playButton.setAttribute("aria-pressed", "true"); scheduleNextFrame(); }
function stopPlayback() { clearTimeout(playbackTimer); playbackTimer = undefined; playButton.textContent = "Play"; playButton.setAttribute("aria-pressed", "false"); }
function togglePlayback() { if (playbackTimer) stopPlayback(); else startPlayback(); }

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvasWidth = Math.max(1, Math.round(rect.width)); canvasHeight = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(canvasWidth * dpr); canvas.height = Math.round(canvasHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (recording && !cameraInitialised) fitWorld();
    renderMap();
}

function selectAtScreenPoint(x, y) {
    if (!recording) return;
    let nearest; let nearestDistance = 20;
    for (const item of projectedEntities) {
        const insideBounds = item.bounds && x >= item.bounds.left && x <= item.bounds.right && y >= item.bounds.top && y <= item.bounds.bottom;
        const distance = insideBounds ? 0 : Math.hypot(item.point.x - x, item.point.y - y);
        if (distance < nearestDistance) { nearest = item.entity; nearestDistance = distance; }
    }
    if (!nearest) return;
    selectedEntityId = nearest.id;
    if (followSelected && nearest.category === "character") updateFollowCamera(recording.frames[frameIndex], true);
    else if (nearest.category !== "character") followSelected = false;
    updateFollowButton(); renderMap(); renderInspector();
}

function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startPinchGesture() {
    const points = [...activePointers.values()];
    if (points.length < 2) return;
    const [first, second] = points;
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    pinchStart = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        scale: camera.scale,
        anchorWorld: projection().unproject(midpoint)
    };
    panStart = undefined; pointerDragged = true;
}

function handlePointerDown(event) {
    const point = pointerPosition(event); activePointers.set(event.pointerId, point); canvas.setPointerCapture(event.pointerId);
    if (activePointers.size === 1) {
        panStart = { screen: point, camera: { x: camera.x, y: camera.y } }; pinchStart = undefined; pointerDragged = false;
    } else if (activePointers.size === 2) startPinchGesture();
}

function handlePointerMove(event) {
    if (!activePointers.has(event.pointerId)) return;
    const point = pointerPosition(event); activePointers.set(event.pointerId, point);
    if (activePointers.size >= 2) {
        if (!pinchStart) startPinchGesture();
        const points = [...activePointers.values()]; const [first, second] = points;
        const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        const limits = cameraScaleLimits(); camera.scale = clamp(pinchStart.scale * distance / pinchStart.distance, limits.min, limits.max);
        camera.x = pinchStart.anchorWorld.x - (midpoint.x - canvasWidth / 2) / camera.scale;
        camera.y = pinchStart.anchorWorld.y + (midpoint.y - canvasHeight / 2) / camera.scale;
        followSelected = false; pointerDragged = true; canvas.classList.add("dragging"); updateFollowButton(); renderMap(); return;
    }
    if (!panStart) return;
    const dx = point.x - panStart.screen.x; const dy = point.y - panStart.screen.y;
    if (Math.hypot(dx, dy) > 3) { pointerDragged = true; followSelected = false; canvas.classList.add("dragging"); updateFollowButton(); }
    if (!pointerDragged) return;
    camera.x = panStart.camera.x - dx / camera.scale; camera.y = panStart.camera.y + dy / camera.scale; renderMap();
}

function finishPointer(event, allowSelection) {
    if (!activePointers.has(event.pointerId)) return;
    const point = activePointers.get(event.pointerId); const wasSinglePointer = activePointers.size === 1;
    const shouldSelect = allowSelection && wasSinglePointer && !pointerDragged;
    activePointers.delete(event.pointerId);
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
    if (shouldSelect) selectAtScreenPoint(point.x, point.y);
    if (activePointers.size === 1) {
        const remaining = [...activePointers.values()][0];
        panStart = { screen: remaining, camera: { x: camera.x, y: camera.y } }; pinchStart = undefined; pointerDragged = true;
    } else if (activePointers.size === 0) {
        panStart = undefined; pinchStart = undefined; pointerDragged = false; canvas.classList.remove("dragging");
    }
}

function zoomBy(factor, anchor) {
    followSelected = false; updateFollowButton(); setCameraScale(camera.scale * factor, anchor); renderMap();
}

playButton.addEventListener("click", togglePlayback);
restartButton.addEventListener("click", () => { stopPlayback(); setFrameIndex(0); });
backButton.addEventListener("click", () => { stopPlayback(); setFrameIndex(frameIndex - 1); });
forwardButton.addEventListener("click", () => { stopPlayback(); setFrameIndex(frameIndex + 1); });
timeline.addEventListener("input", () => { stopPlayback(); setFrameIndex(Number(timeline.value)); });
zoomInButton.addEventListener("click", () => zoomBy(1.35));
zoomOutButton.addEventListener("click", () => zoomBy(1 / 1.35));
fitWorldButton.addEventListener("click", () => { fitWorld(); renderMap(); });
followSelectedButton.addEventListener("click", () => {
    const entity = selectedEntity(); if (!entity || entity.category !== "character") return;
    followSelected = !followSelected;
    if (followSelected) {
        const limits = cameraScaleLimits(); camera.scale = clamp(Math.max(camera.scale, FOLLOW_MIN_SCALE), limits.min, limits.max);
        updateFollowCamera(recording.frames[frameIndex], true);
    }
    updateFollowButton(); renderMap();
});
canvas.addEventListener("wheel", event => { event.preventDefault(); zoomBy(Math.exp(-event.deltaY * 0.0015), pointerPosition(event)); }, { passive: false });
canvas.addEventListener("dblclick", event => { event.preventDefault(); zoomBy(1.5, pointerPosition(event)); });
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", event => finishPointer(event, true));
canvas.addEventListener("pointercancel", event => finishPointer(event, false));
for (const button of speedButtons) {
    button.addEventListener("click", () => {
        speed = Number(button.dataset.speed) || 1;
        for (const candidate of speedButtons) candidate.setAttribute("aria-pressed", String(candidate === button));
        if (playbackTimer) scheduleNextFrame();
    });
}

new ResizeObserver(resizeCanvas).observe(canvas);

async function loadRecording() {
    try {
        const response = await fetch("./simulation-recording.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`Recording request failed (${response.status}).`);
        const data = await response.json();
        if (data.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported recording schema ${data.schemaVersion}; viewer expects ${SCHEMA_VERSION}.`);
        if (!Array.isArray(data.frames) || data.frames.length === 0 || !Array.isArray(data.events)) throw new Error("Recording does not contain frames and events in the expected format.");
        recording = data; worldBounds = calculateWorldBounds(recording.frames); timeline.max = String(recording.frames.length - 1);
        statusElement.textContent = `${recording.title} · ${recording.frames.length} frames`;
        fitWorld(); renderFrame(); resizeCanvas();
    } catch (error) {
        statusElement.textContent = error instanceof Error ? error.message : "Unable to load simulation recording.";
        timeElement.textContent = "Viewer unavailable";
        playButton.disabled = true; backButton.disabled = true; forwardButton.disabled = true; restartButton.disabled = true;
        zoomInButton.disabled = true; zoomOutButton.disabled = true; fitWorldButton.disabled = true; followSelectedButton.disabled = true; timeline.disabled = true;
    }
}

loadRecording();
