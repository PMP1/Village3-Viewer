(() => {
    if (!window.__VILLAGE_LIVE_MODE__) return;

    const MAX_LIVE_FRAMES = 360;
    const MAX_LIVE_EVENTS = 2000;
    const PERSISTENCE_KEY = "village3.live.replay.v1";
    const PERSISTENCE_SCHEMA_VERSION = 1;
    const PERSISTENCE_SCENARIO = "default-village";
    const workerUrl = "./simulation-worker.js";
    let worker;
    let liveRunning = false;
    let diagnosticActive = false;
    let diagnosticStartedAtTick;
    let restoring = false;
    let restoreCurrentTick;
    let restoreTargetTick;
    let persistedTick = loadPersistedTick();
    let liveAnimationRequest;
    let liveAnimationFromFrame;
    let liveAnimationToFrame;
    let liveAnimationStartedAt;
    let liveAnimationLastAt;
    let liveAnimationTimeMs = 0;
    let liveAnimationDisplayFrame;

    restartButton.textContent = "Reset village";
    restartButton.title = "Clear locally saved progress and start the village again from tick 0.";

    const toolbar = root.querySelector(".toolbar");
    const diagnosticDuration = document.createElement("select");
    diagnosticDuration.setAttribute("aria-label", "Diagnostic capture duration");
    for (const [minutes, label] of [[60, "1 hour"], [360, "6 hours"], [1440, "24 hours"]]) {
        const option = document.createElement("option");
        option.value = String(minutes);
        option.textContent = label;
        if (minutes === 360) option.selected = true;
        diagnosticDuration.append(option);
    }
    const diagnosticButton = document.createElement("button");
    diagnosticButton.type = "button";
    diagnosticButton.textContent = "Capture diagnostic";
    diagnosticButton.setAttribute("aria-pressed", "false");
    if (toolbar && statusElement) {
        toolbar.insertBefore(diagnosticDuration, statusElement);
        toolbar.insertBefore(diagnosticButton, statusElement);
    }

    function loadPersistedTick() {
        try {
            const raw = localStorage.getItem(PERSISTENCE_KEY);
            if (!raw) return undefined;
            const saved = JSON.parse(raw);
            if (
                saved?.schemaVersion !== PERSISTENCE_SCHEMA_VERSION ||
                saved?.scenario !== PERSISTENCE_SCENARIO ||
                !Number.isSafeInteger(saved?.tick) ||
                saved.tick < 0
            ) {
                return undefined;
            }
            return saved.tick;
        } catch {
            return undefined;
        }
    }

    function savePersistedTick(tick) {
        if (!Number.isSafeInteger(tick) || tick < 0) return;
        try {
            localStorage.setItem(PERSISTENCE_KEY, JSON.stringify({
                schemaVersion: PERSISTENCE_SCHEMA_VERSION,
                scenario: PERSISTENCE_SCENARIO,
                tick
            }));
            persistedTick = tick;
        } catch {
            // Persistence is an enhancement. Browsers that block local storage can
            // still run the live simulation normally for the lifetime of the page.
        }
    }

    function clearPersistedTick() {
        try {
            localStorage.removeItem(PERSISTENCE_KEY);
        } catch {
            // The new worker still resets even if the browser refuses storage access.
        }
        persistedTick = undefined;
    }

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

    function cancelLiveAnimation(renderLatest = false) {
        if (liveAnimationRequest) cancelAnimationFrame(liveAnimationRequest);
        liveAnimationRequest = undefined;
        liveAnimationFromFrame = undefined;
        liveAnimationToFrame = undefined;
        liveAnimationStartedAt = undefined;
        liveAnimationLastAt = undefined;
        liveAnimationDisplayFrame = undefined;
        if (renderLatest && recording?.frames?.length) renderMap();
    }

    function liveTransitionDuration() {
        return playbackDelay();
    }

    function animateLiveTransition(timestamp) {
        const renderer = window.VillageCharacterRenderer;
        if (
            !liveAnimationFromFrame ||
            !liveAnimationToFrame ||
            !renderer?.renderTransitionFrame ||
            !liveRunning ||
            !isAtLiveEdge()
        ) {
            cancelLiveAnimation(true);
            return;
        }

        if (liveAnimationStartedAt === undefined) liveAnimationStartedAt = timestamp;
        if (liveAnimationLastAt === undefined) liveAnimationLastAt = timestamp;
        const animationDelta = Math.max(0, timestamp - liveAnimationLastAt);
        liveAnimationTimeMs += animationDelta * Math.max(1, speed);
        liveAnimationLastAt = timestamp;

        const progress = clamp(
            (timestamp - liveAnimationStartedAt) / liveTransitionDuration(),
            0,
            1
        );
        liveAnimationDisplayFrame = renderer.interpolatedLatestFrame(
            liveAnimationFromFrame,
            liveAnimationToFrame,
            progress
        );
        renderer.renderTransitionFrame(
            liveAnimationFromFrame,
            liveAnimationToFrame,
            progress,
            liveAnimationTimeMs
        );

        if (progress >= 1) {
            cancelLiveAnimation(true);
            return;
        }
        liveAnimationRequest = requestAnimationFrame(animateLiveTransition);
    }

    function startLiveAnimation(previousFrame, latestFrame) {
        const renderer = window.VillageCharacterRenderer;
        if (!renderer?.renderTransitionFrame || !renderer?.interpolatedLatestFrame) return;
        const fromFrame = liveAnimationDisplayFrame ?? previousFrame;
        if (liveAnimationRequest) cancelAnimationFrame(liveAnimationRequest);
        liveAnimationFromFrame = fromFrame;
        liveAnimationToFrame = latestFrame;
        liveAnimationStartedAt = undefined;
        liveAnimationLastAt = undefined;
        liveAnimationDisplayFrame = fromFrame;
        renderer.renderTransitionFrame(fromFrame, latestFrame, 0, liveAnimationTimeMs);
        liveAnimationRequest = requestAnimationFrame(animateLiveTransition);
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
        playButton.disabled = restoring;
        backButton.disabled = restoring;
        forwardButton.disabled = restoring;
        timeline.disabled = restoring;
        restartButton.disabled = diagnosticActive;
        for (const button of speedButtons) button.disabled = restoring;
        diagnosticDuration.disabled = diagnosticActive || restoring;
        diagnosticButton.disabled = restoring;
        diagnosticButton.textContent = diagnosticActive
            ? `Stop & export diagnostic${Number.isFinite(diagnosticStartedAtTick) ? ` (from ${diagnosticStartedAtTick})` : ""}`
            : "Capture diagnostic";
        diagnosticButton.setAttribute("aria-pressed", String(diagnosticActive));
    }

    function setWorkerState(message) {
        const wasRunning = liveRunning;
        liveRunning = Boolean(message.running);
        if (Number.isFinite(message.ticksPerSecond)) speed = message.ticksPerSecond;
        diagnosticActive = Boolean(message.diagnosticCapture?.active);
        diagnosticStartedAtTick = message.diagnosticCapture?.startedAtTick;
        restoring = Boolean(message.restoration?.active);
        restoreCurrentTick = message.restoration?.currentTick;
        restoreTargetTick = message.restoration?.targetTick;
        if ((!liveRunning && wasRunning) || restoring) cancelLiveAnimation(true);
        updateLiveControls();

        if (restoring) {
            const current = Number.isFinite(restoreCurrentTick) ? restoreCurrentTick : 0;
            const target = Number.isFinite(restoreTargetTick) ? restoreTargetTick : persistedTick;
            statusElement.textContent = Number.isFinite(target)
                ? `Restoring saved village · tick ${current} / ${target}`
                : `Restoring saved village · tick ${current}`;
        }
    }

    function appendLiveFrame(frame, events) {
        const followLive = isAtLiveEdge();
        const previousFrame = recording.frames.at(-1);
        const transitionFrom = followLive
            ? liveAnimationDisplayFrame ?? previousFrame
            : undefined;
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
        savePersistedTick(frame.tick);
        statusElement.textContent = `Live in this browser · progress saved locally at tick ${frame.tick} · ${recording.frames.length}/${MAX_LIVE_FRAMES} recent frames retained`;

        if (!worldBounds || recording.frames.length === 1) {
            worldBounds = calculateWorldBounds(recording.frames);
            fitWorld();
        }
        renderFrame();
        if (followLive && liveRunning && transitionFrom) {
            startLiveAnimation(transitionFrom, frame);
        }
    }

    function exportDiagnosticBundle(bundle) {
        const snapshots = Array.isArray(bundle?.snapshots) ? bundle.snapshots : [];
        const firstTick = snapshots[0]?.tick ?? "start";
        const lastTick = snapshots.at(-1)?.tick ?? "end";
        // Keep the file compact: these captures are designed to be uploaded for
        // analysis rather than hand-edited, so pretty-print whitespace adds no value.
        const json = JSON.stringify(bundle);
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `village-diagnostic-${firstTick}-${lastTick}.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        statusElement.textContent = `Diagnostic capture exported · ticks ${firstTick}–${lastTick}`;
    }

    function handleWorkerMessage(event) {
        const message = event.data;
        if (!message || typeof message.type !== "string") return;
        if (message.type === "error") {
            statusElement.textContent = `Live simulation error: ${message.message}`;
            return;
        }
        if (message.type === "diagnostic-capture") {
            diagnosticActive = false;
            diagnosticStartedAtTick = undefined;
            updateLiveControls();
            exportDiagnosticBundle(message.bundle);
            return;
        }
        if (message.type === "state") {
            setWorkerState(message);
            return;
        }
        if (message.type === "ready") {
            cancelLiveAnimation(false);
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
            fitWorld();
            renderFrame();
            resizeCanvas();

            if (Number.isSafeInteger(persistedTick) && persistedTick > message.frame.tick) {
                restoring = true;
                restoreCurrentTick = message.frame.tick;
                restoreTargetTick = persistedTick;
                updateLiveControls();
                statusElement.textContent = `Restoring saved village · tick ${message.frame.tick} / ${persistedTick}`;
                send({ type: "restore-to-tick", tick: persistedTick });
            } else {
                savePersistedTick(message.frame.tick);
                statusElement.textContent = `Live in this browser · progress saved locally at tick ${message.frame.tick}`;
            }
            return;
        }
        if (message.type === "update") {
            setWorkerState(message);
            appendLiveFrame(message.frame, message.events);
        }
    }

    function createWorker() {
        cancelLiveAnimation(false);
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
        cancelLiveAnimation(true);
        send({ type: "pause" });
    };

    togglePlayback = function toggleLiveSimulation() {
        if (liveRunning) cancelLiveAnimation(true);
        send({ type: liveRunning ? "pause" : "start" });
    };

    function pauseAndInspect(index) {
        cancelLiveAnimation(false);
        send({ type: "pause" });
        frameIndex = clamp(Math.round(index), 0, recording.frames.length - 1);
        renderFrame();
    }

    diagnosticButton.addEventListener("click", () => {
        if (diagnosticActive) {
            send({ type: "stop-diagnostic-capture" });
            return;
        }
        send({
            type: "start-diagnostic-capture",
            maxMinutes: Number(diagnosticDuration.value) || 360
        });
    });

    playButton.addEventListener("click", event => {
        event.stopImmediatePropagation();
        togglePlayback();
    }, true);

    restartButton.addEventListener("click", event => {
        event.stopImmediatePropagation();
        cancelLiveAnimation(false);
        clearPersistedTick();
        liveRunning = false;
        restoring = false;
        restoreCurrentTick = undefined;
        restoreTargetTick = undefined;
        diagnosticActive = false;
        diagnosticStartedAtTick = undefined;
        recording = {
            schemaVersion: SCHEMA_VERSION,
            title: "Village live browser simulation",
            frames: [],
            events: []
        };
        frameIndex = 0;
        worldBounds = undefined;
        cameraInitialised = false;
        statusElement.textContent = "Resetting village…";
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
            cancelLiveAnimation(false);
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
        statusElement.textContent = Number.isSafeInteger(persistedTick) && persistedTick > 0
            ? `Starting live browser simulation · saved tick ${persistedTick} found`
            : "Starting live browser simulation…";
        updateLiveControls();
        createWorker();
    });
})();
