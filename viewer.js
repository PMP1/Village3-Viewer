const SCHEMA_VERSION = 1;
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
        for (const entity of frame.entities ?? []) {
            const { x, y } = entity.position ?? {};
            include(x, y);

            const footprint = rectangularFootprint(entity);
            if (footprint) {
                include(footprint.origin.x, footprint.origin.y);
                include(footprint.origin.x + footprint.width, footprint.origin.y + footprint.height);
            }
        }
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

function projection() {
    const padding = 34;
    const width = Math.max(1, canvasWidth - padding * 2);
    const height = Math.max(1, canvasHeight - padding * 2);
    const worldWidth = Math.max(1, worldBounds.maxX - worldBounds.minX);
    const worldHeight = Math.max(1, worldBounds.maxY - worldBounds.minY);
    const scale = Math.min(width / worldWidth, height / worldHeight);
    const drawnWidth = worldWidth * scale;
    const drawnHeight = worldHeight * scale;
    const left = (canvasWidth - drawnWidth) / 2;
    const top = (canvasHeight - drawnHeight) / 2;

    return position => ({
        x: left + (position.x - worldBounds.minX) * scale,
        y: top + drawnHeight - (position.y - worldBounds.minY) * scale
    });
}

function drawGrid(project) {
    context.save();
    context.strokeStyle = "#161b22";
    context.fillStyle = "#6e7681";
    context.lineWidth = 1;
    context.font = "11px system-ui";

    const gridSize = 10;
    const startX = Math.ceil(worldBounds.minX / gridSize) * gridSize;
    const startY = Math.ceil(worldBounds.minY / gridSize) * gridSize;

    for (let x = startX; x <= worldBounds.maxX; x += gridSize) {
        const top = project({ x, y: worldBounds.maxY });
        const bottom = project({ x, y: worldBounds.minY });
        context.beginPath();
        context.moveTo(top.x, top.y);
        context.lineTo(bottom.x, bottom.y);
        context.stroke();
        context.fillText(String(x), bottom.x + 3, Math.min(canvasHeight - 5, bottom.y - 4));
    }

    for (let y = startY; y <= worldBounds.maxY; y += gridSize) {
        const left = project({ x: worldBounds.minX, y });
        const right = project({ x: worldBounds.maxX, y });
        context.beginPath();
        context.moveTo(left.x, left.y);
        context.lineTo(right.x, right.y);
        context.stroke();
        context.fillText(String(y), Math.max(4, left.x + 3), left.y - 4);
    }
    context.restore();
}

function entityAtFrame(frame, id) {
    return frame.entities.find(entity => entity.id === id);
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
    const doors = (footprint.doors ?? [])
        .filter(door => door.side === side)
        .sort((first, second) => first.offset - second.offset);
    const length = footprintSideLength(footprint, side);
    let cursor = 0;

    context.strokeStyle = wallStroke;
    context.lineWidth = 3;
    context.setLineDash([]);
    for (const door of doors) {
        const start = clamp(door.offset, 0, length);
        const end = clamp(door.offset + 1, 0, length);
        if (start > cursor) {
            strokeWorldSegment(
                project,
                footprintSidePoint(footprint, side, cursor),
                footprintSidePoint(footprint, side, start)
            );
        }
        cursor = Math.max(cursor, end);
    }
    if (cursor < length) {
        strokeWorldSegment(
            project,
            footprintSidePoint(footprint, side, cursor),
            footprintSidePoint(footprint, side, length)
        );
    }

    for (const door of doors) {
        context.strokeStyle = door.state === "open"
            ? "#3fb950"
            : door.state === "locked"
                ? "#f85149"
                : "#d29922";
        context.lineWidth = door.state === "open" ? 2 : 4;
        context.setLineDash(door.state === "open" ? [3, 3] : []);
        strokeWorldSegment(
            project,
            footprintSidePoint(footprint, side, door.offset),
            footprintSidePoint(footprint, side, door.offset + 1)
        );
    }
    context.setLineDash([]);
}

function physicalBuildingScreenBounds(entity, project) {
    const footprint = rectangularFootprint(entity);
    if (!footprint) return undefined;
    const first = project(footprint.origin);
    const second = project({
        x: footprint.origin.x + footprint.width,
        y: footprint.origin.y + footprint.height
    });
    return {
        left: Math.min(first.x, second.x),
        right: Math.max(first.x, second.x),
        top: Math.min(first.y, second.y),
        bottom: Math.max(first.y, second.y)
    };
}

function drawPhysicalBuilding(entity, project) {
    const footprint = rectangularFootprint(entity);
    if (!footprint) return false;
    const selected = entity.id === selectedEntityId;
    const bounds = physicalBuildingScreenBounds(entity, project);

    context.save();
    context.fillStyle = selected ? "rgba(242, 204, 96, 0.16)" : "rgba(137, 87, 229, 0.18)";
    context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

    const wallStroke = selected ? "#f2cc60" : "#e6edf3";
    for (const side of ["north", "east", "south", "west"]) {
        drawFootprintSide(footprint, side, project, wallStroke);
    }

    const labelPoint = project({
        x: footprint.origin.x + footprint.width / 2,
        y: footprint.origin.y + footprint.height
    });
    context.font = "11px system-ui";
    context.fillStyle = selected ? "#f2cc60" : "#c9d1d9";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(entity.label ?? entity.id, labelPoint.x, labelPoint.y - 5);
    context.restore();
    return true;
}

function drawEntity(entity, point, project) {
    if (entity.subtype === "building" && drawPhysicalBuilding(entity, project)) return;

    const selected = entity.id === selectedEntityId;
    context.save();
    context.lineWidth = selected ? 3 : 1.5;
    context.strokeStyle = selected ? "#f2cc60" : "#e6edf3";

    if (entity.category === "character") {
        context.fillStyle = "#58a6ff";
        context.beginPath();
        context.arc(point.x, point.y, selected ? 9 : 7, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    } else if (entity.subtype === "building") {
        const visualSize = entity.properties?.visualSize;
        const size = visualSize === "large" ? 16 : visualSize === "medium" ? 13 : 10;
        context.fillStyle = "#8957e5";
        context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        context.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    } else if (entity.subtype === "fountain") {
        context.fillStyle = "#39c5cf";
        context.beginPath();
        context.arc(point.x, point.y, 8, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(point.x - 5, point.y);
        context.lineTo(point.x + 5, point.y);
        context.moveTo(point.x, point.y - 5);
        context.lineTo(point.x, point.y + 5);
        context.stroke();
    } else if (entity.category === "object") {
        context.fillStyle = "#d29922";
        context.beginPath();
        context.moveTo(point.x, point.y - 8);
        context.lineTo(point.x + 8, point.y + 7);
        context.lineTo(point.x - 8, point.y + 7);
        context.closePath();
        context.fill();
        context.stroke();
    } else {
        context.fillStyle = "#8b949e";
        context.beginPath();
        context.arc(point.x, point.y, 6, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    }

    context.font = entity.category === "character" ? "600 12px system-ui" : "11px system-ui";
    context.fillStyle = selected ? "#f2cc60" : "#c9d1d9";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(entity.label ?? entity.id, point.x, point.y - 11);
    context.restore();
}

function renderMap() {
    if (!recording || !context) return;
    const frame = recording.frames[frameIndex];
    const project = projection();

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = "#090d12";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    drawGrid(project);
    drawSelectedTrail(project);

    projectedEntities = frame.entities.map(entity => ({
        entity,
        point: project(entity.position),
        bounds: physicalBuildingScreenBounds(entity, project)
    }));
    for (const { entity, point } of projectedEntities) drawMovementTarget(entity, point, project);
    for (const { entity, point } of projectedEntities.filter(item => item.entity.category !== "character")) drawEntity(entity, point, project);
    for (const { entity, point } of projectedEntities.filter(item => item.entity.category === "character")) drawEntity(entity, point, project);
}

function addDefinitionListRow(list, key, value) {
    const term = document.createElement("dt");
    term.textContent = humanize(key);
    const description = document.createElement("dd");
    description.textContent = String(value);
    list.append(term, description);
}

function renderInspector() {
    inspectorElement.replaceChildren();
    if (!selectedEntityId) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Select a character, place, or object on the map.";
        inspectorElement.append(empty);
        return;
    }

    const entity = entityAtFrame(recording.frames[frameIndex], selectedEntityId);
    if (!entity) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "This entity is not present in the current frame.";
        inspectorElement.append(empty);
        return;
    }

    const heading = document.createElement("h2");
    heading.textContent = entity.label ?? entity.id;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [entity.category, entity.subtype].filter(Boolean).join(" · ");
    const list = document.createElement("dl");
    list.className = "kv";
    addDefinitionListRow(list, "id", entity.id);
    addDefinitionListRow(list, "position", `${formatNumber(entity.position.x)}, ${formatNumber(entity.position.y)}`);
    if (entity.state?.action) addDefinitionListRow(list, "action", entity.state.action);
    if (entity.state?.movementTarget) {
        addDefinitionListRow(list, "movement target", `${formatNumber(entity.state.movementTarget.x)}, ${formatNumber(entity.state.movementTarget.y)}`);
    }

    const footprint = rectangularFootprint(entity);
    if (footprint) {
        addDefinitionListRow(list, "footprint", `${formatNumber(footprint.width)} × ${formatNumber(footprint.height)} m`);
        addDefinitionListRow(list, "footprint origin", `${formatNumber(footprint.origin.x)}, ${formatNumber(footprint.origin.y)}`);
        if ((footprint.doors ?? []).length > 0) {
            addDefinitionListRow(
                list,
                "doors",
                footprint.doors.map(door => `${humanize(door.side)} ${door.state}`).join(", ")
            );
        }
    }

    for (const [key, value] of Object.entries(entity.properties ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        addDefinitionListRow(list, key, value === null ? "—" : value);
    }
    inspectorElement.append(heading, meta, list);
}

function frameForTick(tick) {
    return recording.frames[clamp(tick, 0, recording.frames.length - 1)];
}

function eventTimeLabel(event) {
    const frame = frameForTick(event.tick);
    return `${formatTime(frame.time)} · tick ${event.tick}`;
}

function renderEvents() {
    const currentTick = recording.frames[frameIndex].tick;
    const visible = recording.events
        .filter(event => event.level === "event" && event.tick < currentTick)
        .slice(-80);

    eventsElement.replaceChildren();
    if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No events yet.";
        eventsElement.append(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const event of visible) {
        const row = document.createElement("div");
        row.className = "event";
        const time = document.createElement("div");
        time.className = "event-time";
        time.textContent = eventTimeLabel(event);
        const message = document.createElement("div");
        message.textContent = event.message;
        row.append(time, message);
        fragment.append(row);
    }
    eventsElement.append(fragment);
    eventsElement.scrollTop = eventsElement.scrollHeight;
}

function renderFrame() {
    if (!recording) return;
    const frame = recording.frames[frameIndex];
    timeElement.textContent = formatTime(frame.time);
    tickElement.textContent = String(frame.tick);
    timeline.value = String(frameIndex);
    durationElement.textContent = `${frame.tick} / ${recording.frames.at(-1).tick}`;
    renderMap();
    renderEvents();
    renderInspector();
}

function setFrameIndex(nextIndex) {
    frameIndex = clamp(Math.round(nextIndex), 0, recording.frames.length - 1);
    if (frameIndex >= recording.frames.length - 1) stopPlayback();
    renderFrame();
}

function playbackDelay() {
    return Math.max(20, Math.round(450 / speed));
}

function scheduleNextFrame() {
    clearTimeout(playbackTimer);
    playbackTimer = setTimeout(() => {
        if (frameIndex >= recording.frames.length - 1) {
            stopPlayback();
            return;
        }
        frameIndex += 1;
        renderFrame();
        scheduleNextFrame();
    }, playbackDelay());
}

function startPlayback() {
    if (frameIndex >= recording.frames.length - 1) frameIndex = 0;
    playButton.textContent = "Pause";
    playButton.setAttribute("aria-pressed", "true");
    scheduleNextFrame();
}

function stopPlayback() {
    clearTimeout(playbackTimer);
    playbackTimer = undefined;
    playButton.textContent = "Play";
    playButton.setAttribute("aria-pressed", "false");
}

function togglePlayback() {
    if (playbackTimer) stopPlayback();
    else startPlayback();
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvasWidth = Math.max(1, Math.round(rect.width));
    canvasHeight = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderMap();
}

function handleCanvasSelection(event) {
    if (!recording) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest;
    let nearestDistance = 20;
    for (const item of projectedEntities) {
        const insidePhysicalFootprint = item.bounds &&
            x >= item.bounds.left && x <= item.bounds.right &&
            y >= item.bounds.top && y <= item.bounds.bottom;
        const distance = insidePhysicalFootprint
            ? 0
            : Math.hypot(item.point.x - x, item.point.y - y);
        if (distance < nearestDistance) {
            nearest = item.entity;
            nearestDistance = distance;
        }
    }
    if (!nearest) return;
    selectedEntityId = nearest.id;
    renderMap();
    renderInspector();
}

playButton.addEventListener("click", togglePlayback);
restartButton.addEventListener("click", () => {
    stopPlayback();
    setFrameIndex(0);
});
backButton.addEventListener("click", () => {
    stopPlayback();
    setFrameIndex(frameIndex - 1);
});
forwardButton.addEventListener("click", () => {
    stopPlayback();
    setFrameIndex(frameIndex + 1);
});
timeline.addEventListener("input", () => {
    stopPlayback();
    setFrameIndex(Number(timeline.value));
});
canvas.addEventListener("click", handleCanvasSelection);
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
        if (data.schemaVersion !== SCHEMA_VERSION) {
            throw new Error(`Unsupported recording schema ${data.schemaVersion}; viewer expects ${SCHEMA_VERSION}.`);
        }
        if (!Array.isArray(data.frames) || data.frames.length === 0 || !Array.isArray(data.events)) {
            throw new Error("Recording does not contain frames and events in the expected format.");
        }

        recording = data;
        worldBounds = calculateWorldBounds(recording.frames);
        timeline.max = String(recording.frames.length - 1);
        statusElement.textContent = `${recording.title} · ${recording.frames.length} frames`;
        renderFrame();
        resizeCanvas();
    } catch (error) {
        statusElement.textContent = error instanceof Error ? error.message : "Unable to load simulation recording.";
        timeElement.textContent = "Viewer unavailable";
        playButton.disabled = true;
        backButton.disabled = true;
        forwardButton.disabled = true;
        restartButton.disabled = true;
        timeline.disabled = true;
    }
}

loadRecording();
