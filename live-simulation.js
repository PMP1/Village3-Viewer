(() => {
    if (!window.__VILLAGE_LIVE_MODE__) return;

    const MAX_LIVE_FRAMES = 360;
    const MAX_LIVE_EVENTS = 2000;
    const workerUrl = "./simulation-worker.js";
    let worker;
    let liveRunning = false;

    function sleep(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    async function waitForViewerBootstrap() {
        while (!recording || !Array.isArray(recording.frames) || recording.frames.length === 0) {
            await sleep(0);
        }
    }

    function isAtLiveEdge() {
        return Boolean(recording?.frames?.length) && frameIndex >= recording.frames.length - 1;
    }

    function nearestFrameForTick(tick) {
        if (!recording?.frames?.length) return undefined;
        let nearest = recording.frames[0];
        let nearestDistance = Math.abs(nearest.tick - tick);
        for (const frame of recording.frames.slice(1)) {
            const distance = Math.abs(frame.tick - tick);
            if (distance >= nearestDistance) continue;
            nearest = frame;
            nearestDistance = distance;
        }
        return nearest;
    }

    frameForTick = tick => nearestFrameForTick(tick) ?? recording.frames[0];
    eventTimeLabel = event => {
        const frame = nearestFrameForTick(event.tick);
        return frame ? `${formatTime(frame.time)} · tick ${event.tick}` : `tick ${event.tick}`;
    };

    function updateLiveControls() {
        playButton.textContent = liveRunning ? "Pause simulation" : "Run simulation";
        playButton.setAttribute("aria-pressed", String(liveRunning));
    }

    function setWorkerState(message) {
        liveRunning = Boolean(message.running);
        if (Number.isFinite(message.ticksPerSecond)) speed = message.ticksPerSecond;
        updateLiveControls();
    }

    function appendLiveFrame(frame, events) {
        const followLive = isAtLiveEdge();
        recording.title = "Village live browser simulation";
        recording.frames.push(frame);
        recording.events.push(...(events ?? []));

        const extraFrames = Math.max(0, recording.frames.length - MAX_LIVE_FRAMES);
        if (extraFrames > 0) {
            recording.frames.splice(0, extraFrames);
            frameIndex = Math.max(0, frameIndex - extraFrames);
        }
        const extraEvents = Math.max(0, recording.events.length - MAX_LIVE_EVENTS);
        if (extraEvents > 0) recording.events.splice(0, extraEvents);

        if (followLive) frameIndex = recording.frames.length - 1;
        timeline.max = String(recording.frames.length - 1);
        statusElement.textContent = `Live in this browser · ${recording.frames.length}/${MAX_LIVE_FRAMES} recent frames retained`;

        if (!worldBounds || recording.frames.length === 1) {
            worldBounds = calculateWorldBounds(recording.frames);
            fitWorld();
        }
        renderFrame();
    }

    function handleWorkerMessage(event) {
        const message = event.data;
        if (!message || typeof message.type !== "string") return;
        if (message.type === "error") {
            statusElement.textContent = `Live simulation error: ${message.message}`;
            return;
        }
        if (message.type === "state") {
            setWorkerState(message);
            return;
        }
        if (message.type === "ready") {
            setWorkerState(message);
            recording = {
                schemaVersion: SCHEMA_VERSION,
                title: "Village live browser simulation",
                frames: [message.frame],
                events: [...(message.events ?? [])]
            };
            frameIndex = 0;
            worldBounds = calculateWorldBounds(recording.frames);
            timeline.max = "0";
            statusElement.textContent = `Live in this browser · ${MAX_LIVE_FRAMES}-frame rolling history`;
            fitWorld();
            renderFrame();
            resizeCanvas();
            return;
        }
        if (message.type === "update") {
            setWorkerState(message);
            appendLiveFrame(message.frame, message.events);
        }
    }

    function createWorker() {
        worker?.terminate();
        worker = new Worker(workerUrl);
        worker.addEventListener("message", handleWorkerMessage);
        worker.addEventListener("error", event => {
            statusElement.textContent = `Unable to start live simulation worker: ${event.message || "unknown error"}`;
        });
    }

    function send(command) {
        worker?.postMessage(command);
    }

    startPlayback = function startLiveSimulation() {
        send({ type: "start" });
    };

    stopPlayback = function pauseLiveSimulation() {
        send({ type: "pause" });
    };

    togglePlayback = function toggleLiveSimulation() {
        send({ type: liveRunning ? "pause" : "start" });
    };

    function pauseAndInspect(index) {
        send({ type: "pause" });
        frameIndex = clamp(Math.round(index), 0, recording.frames.length - 1);
        renderFrame();
    }

    playButton.addEventListener("click", event => {
        event.stopImmediatePropagation();
        togglePlayback();
    }, true);

    restartButton.addEventListener("click", event => {
        event.stopImmediatePropagation();
        liveRunning = false;
        recording = {
            schemaVersion: SCHEMA_VERSION,
            title: "Village live browser simulation",
            frames: [],
            events: []
        };
        frameIndex = 0;
        worldBounds = undefined;
        cameraInitialised = false;
        statusElement.textContent = "Restarting live simulation…";
        updateLiveControls();
        createWorker();
    }, true);

    backButton.addEventListener("click", event => {
        event.stopImmediatePropagation();
        pauseAndInspect(frameIndex - 1);
    }, true);

    forwardButton.addEventListener("click", event => {
        event.stopImmediatePropagation();
        if (frameIndex < recording.frames.length - 1) {
            pauseAndInspect(frameIndex + 1);
        } else {
            send({ type: "pause" });
            send({ type: "step", minutes: 1 });
        }
    }, true);

    timeline.addEventListener("input", event => {
        event.stopImmediatePropagation();
        pauseAndInspect(Number(timeline.value));
    }, true);

    for (const button of speedButtons) {
        button.addEventListener("click", event => {
            event.stopImmediatePropagation();
            speed = Number(button.dataset.speed) || 1;
            for (const candidate of speedButtons) {
                candidate.setAttribute("aria-pressed", String(candidate === button));
            }
            send({ type: "set-speed", ticksPerSecond: speed });
        }, true);
    }

    waitForViewerBootstrap().then(() => {
        statusElement.textContent = "Starting live browser simulation…";
        createWorker();
    });
})();
