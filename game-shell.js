(() => {
    const toolbar = root.querySelector(".toolbar");
    const worldPanel = canvas.closest("section.panel");
    const peoplePanel = root.querySelector(".people-panel");
    const inspectorPanel = root.querySelector(".inspector-panel");
    const eventsPanel = root.querySelector(".events-panel");
    const peopleList = root.querySelector("#people-list");
    const timeSource = root.querySelector("#time");
    const playButton = root.querySelector("#play");
    const speedButtons = new Map(
        [...root.querySelectorAll(".speed-group [data-speed]")]
            .map(button => [String(button.dataset.speed), button])
    );
    if (!toolbar || !worldPanel || !peoplePanel || !inspectorPanel || !eventsPanel || !timeSource || !playButton) return;

    worldPanel.classList.add("world-panel");

    const styles = document.createElement("style");
    styles.textContent = `
        :root {
            --game-wood-pale: #f1d8a9;
            --game-wood-light: #dfb879;
            --game-wood-mid: #be8950;
            --game-wood-dark: #6f4525;
            --game-wood-edge: #4d2f19;
            --game-ink: #3b2414;
            --game-paper: #f7e8c7;
            --game-shadow: rgba(33, 18, 8, 0.38);
        }

        .entity-contents { margin-top: 14px; padding-top: 12px; border-top: 1px solid #30363d; }
        .entity-contents h3 { margin: 0 0 7px; font-size: 14px; }
        .entity-contents-summary { margin-bottom: 9px; color: #c9d1d9; font-size: 12px; line-height: 1.4; }
        .entity-content-list { display: grid; gap: 6px; }
        .entity-content-row { padding: 7px 8px; border: 1px solid #30363d; border-radius: 7px; background: #161b22; }
        .entity-content-main { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .entity-content-name { font-size: 13px; font-weight: 650; }
        .entity-content-quantity { flex: 0 0 auto; font-size: 12px; font-variant-numeric: tabular-nums; }
        .entity-content-meta { margin-top: 2px; color: #8b949e; font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
        .entity-content-sale { color: #3fb950; font-weight: 650; }

        .view-mode-group { display: flex; gap: 6px; margin-left: auto; }
        .view-mode-group button { min-height: 40px; }
        .game-hud,
        .game-bottom-nav,
        .game-drawer { display: none; }

        body[data-view-mode="game"] {
            overflow: hidden;
            overscroll-behavior: none;
            background: #182114;
        }

        body[data-view-mode="game"] .shell {
            width: 100vw;
            max-width: none;
            height: 100dvh;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }

        body[data-view-mode="game"] .toolbar,
        body[data-view-mode="game"] .timeline-row,
        body[data-view-mode="game"] .events-panel,
        body[data-view-mode="game"] .inspector-panel,
        body[data-view-mode="game"] .map-note {
            display: none;
        }

        body[data-view-mode="game"] .layout {
            display: block;
            width: 100%;
            height: 100%;
        }

        body[data-view-mode="game"] .world-panel {
            display: block;
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100dvh;
            margin: 0;
            border: 0;
            border-radius: 0;
            background: #10160e;
        }

        body[data-view-mode="game"] .world-panel > .panel-heading { display: none; }
        body[data-view-mode="game"] .world-panel .map-wrap,
        body[data-view-mode="game"] #map {
            width: 100%;
            height: 100%;
            min-height: 0;
        }

        body[data-view-mode="game"] .map-controls {
            top: 14px;
            left: 14px;
            z-index: 20;
            gap: 6px;
        }

        body[data-view-mode="game"] .map-controls button,
        body[data-view-mode="game"] .game-wood-button {
            color: var(--game-ink);
            border: 2px solid var(--game-wood-edge);
            background:
                linear-gradient(90deg, rgba(255,255,255,.13), transparent 20%, rgba(89,48,20,.08) 53%, transparent 78%),
                repeating-linear-gradient(3deg, var(--game-wood-light) 0 9px, #d8ad70 9px 11px, var(--game-wood-light) 11px 20px);
            box-shadow: inset 0 0 0 2px rgba(255, 232, 187, .28), 0 3px 8px var(--game-shadow);
            font-family: Georgia, "Times New Roman", serif;
            font-weight: 700;
        }

        body[data-view-mode="game"] .map-controls button:hover:not(:disabled),
        body[data-view-mode="game"] .game-wood-button:hover:not(:disabled) {
            background:
                linear-gradient(rgba(255,255,255,.14), rgba(255,255,255,.14)),
                repeating-linear-gradient(3deg, #e8c78f 0 9px, #dcb47a 9px 11px, #e8c78f 11px 20px);
        }

        body[data-view-mode="game"] .game-hud {
            position: fixed;
            top: max(12px, env(safe-area-inset-top));
            right: max(12px, env(safe-area-inset-right));
            z-index: 60;
            display: flex;
            align-items: stretch;
            gap: 8px;
            pointer-events: none;
            font-family: Georgia, "Times New Roman", serif;
            color: var(--game-ink);
        }

        body[data-view-mode="game"] .game-speed-controls,
        body[data-view-mode="game"] .game-time-card {
            pointer-events: auto;
            border: 2px solid var(--game-wood-edge);
            background:
                linear-gradient(90deg, rgba(255,255,255,.18), transparent 22%, rgba(98,53,23,.08) 60%, transparent 78%),
                repeating-linear-gradient(2deg, var(--game-wood-pale) 0 14px, #e8c990 14px 16px, var(--game-wood-pale) 16px 30px);
            box-shadow: inset 0 0 0 2px rgba(255, 245, 218, .35), 0 5px 18px var(--game-shadow);
        }

        body[data-view-mode="game"] .game-speed-controls {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px;
            border-radius: 14px;
        }

        body[data-view-mode="game"] .game-speed-button {
            min-width: 48px;
            height: 48px;
            padding: 0 10px;
            border-radius: 50%;
            font-size: 19px;
            line-height: 1;
        }

        body[data-view-mode="game"] .game-speed-button[data-hud-speed="5"],
        body[data-view-mode="game"] .game-speed-button[data-hud-speed="20"] {
            border-radius: 13px;
            font-size: 17px;
        }

        body[data-view-mode="game"] .game-speed-button[aria-pressed="true"] {
            background:
                linear-gradient(rgba(255, 237, 183, .42), rgba(255, 237, 183, .14)),
                repeating-linear-gradient(3deg, #c88d48 0 9px, #b77d41 9px 11px, #c88d48 11px 20px);
            box-shadow: inset 0 0 0 2px rgba(255, 236, 190, .46), 0 0 0 2px #f3d08f, 0 3px 8px var(--game-shadow);
        }

        body[data-view-mode="game"] .game-time-card {
            min-width: 126px;
            padding: 8px 18px 7px;
            border-radius: 14px;
            text-align: center;
            display: grid;
            align-content: center;
        }

        .game-day-label { font-size: 15px; font-weight: 700; line-height: 1.05; }
        .game-clock-label { margin-top: 2px; font-size: 27px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }

        body[data-view-mode="game"] .people-panel,
        body[data-view-mode="game"] .game-drawer {
            position: fixed;
            left: 50%;
            right: auto;
            bottom: calc(86px + max(8px, env(safe-area-inset-bottom)));
            z-index: 55;
            width: min(640px, calc(100vw - 24px));
            max-height: min(58dvh, 610px);
            margin: 0;
            transform: translateX(-50%);
            overflow: hidden;
            border: 3px solid var(--game-wood-edge);
            border-radius: 16px;
            background:
                linear-gradient(rgba(248, 224, 180, .95), rgba(239, 207, 154, .96)),
                repeating-linear-gradient(0deg, transparent 0 20px, rgba(126,77,37,.06) 20px 22px);
            color: var(--game-ink);
            box-shadow: inset 0 0 0 3px rgba(255, 244, 215, .33), 0 14px 45px rgba(23, 12, 5, .48);
            font-family: Georgia, "Times New Roman", serif;
        }

        body[data-view-mode="game"] .people-panel { display: none; }
        body[data-view-mode="game"][data-game-panel="people"] .people-panel,
        body[data-view-mode="game"][data-game-panel="buildings"] .game-buildings-panel,
        body[data-view-mode="game"][data-game-panel="settings"] .game-settings-panel {
            display: block;
        }

        body[data-view-mode="game"] .people-panel .panel-heading,
        body[data-view-mode="game"] .game-drawer-heading {
            min-height: 52px;
            padding: 11px 16px;
            border: 0;
            border-bottom: 2px solid rgba(78, 44, 20, .48);
            background:
                linear-gradient(90deg, rgba(255,255,255,.12), transparent 30%, rgba(91,48,20,.08)),
                repeating-linear-gradient(2deg, #d9ad70 0 13px, #c99759 13px 15px, #d9ad70 15px 28px);
            color: var(--game-ink);
            font-size: 20px;
            font-weight: 700;
            align-items: center;
        }

        body[data-view-mode="game"] #show-all-events { display: none; }
        body[data-view-mode="game"] .people-list,
        body[data-view-mode="game"] .game-building-list,
        body[data-view-mode="game"] .game-settings-content {
            max-height: calc(min(58dvh, 610px) - 52px);
            overflow: auto;
            overscroll-behavior: contain;
            padding: 10px;
        }

        body[data-view-mode="game"] .person-card,
        body[data-view-mode="game"] .game-building-card {
            width: 100%;
            min-height: 68px;
            margin: 0 0 7px;
            padding: 9px 12px;
            border: 1px solid rgba(103, 62, 28, .42);
            border-radius: 11px;
            background: rgba(255, 242, 211, .58);
            color: var(--game-ink);
            box-shadow: inset 0 1px rgba(255,255,255,.45);
            text-align: left;
        }

        body[data-view-mode="game"] .person-card:last-child,
        body[data-view-mode="game"] .game-building-card:last-child { margin-bottom: 0; }
        body[data-view-mode="game"] .person-card:hover,
        body[data-view-mode="game"] .game-building-card:hover { background: rgba(255, 244, 215, .86); }
        body[data-view-mode="game"] .person-card[aria-pressed="true"],
        body[data-view-mode="game"] .game-building-card[aria-pressed="true"] {
            background: #f0d49e;
            box-shadow: inset 4px 0 #88572d;
        }

        body[data-view-mode="game"] .person-avatar {
            border-color: #82542e;
            background: #c49358;
            color: #fff4dc;
        }
        body[data-view-mode="game"] .person-name { font-size: 16px; color: var(--game-ink); }
        body[data-view-mode="game"] .person-stats,
        body[data-view-mode="game"] .person-goal { display: none; }
        body[data-view-mode="game"] .person-action {
            display: block;
            margin-top: 5px;
            color: #6c4527;
            font-size: 12px;
        }
        body[data-view-mode="game"] .person-detail-label { color: #835833; }

        .game-building-card { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 12px; align-items: center; }
        .game-building-icon {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            display: grid;
            place-items: center;
            background: rgba(175, 121, 65, .22);
            border: 1px solid rgba(103, 62, 28, .32);
        }
        .game-building-icon svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.8; }
        .game-building-name { display: block; font-size: 17px; font-weight: 700; }
        .game-building-meta { display: block; margin-top: 3px; color: #7a5130; font-size: 12px; }

        .game-settings-content { display: grid; gap: 10px; }
        .game-settings-note { margin: 0; color: #765033; font-size: 13px; line-height: 1.45; }
        .game-settings-action {
            width: 100%;
            min-height: 48px;
            border-radius: 11px;
            text-align: left;
        }

        body[data-view-mode="game"] .game-bottom-nav {
            position: fixed;
            left: 50%;
            bottom: max(10px, env(safe-area-inset-bottom));
            z-index: 65;
            width: min(720px, calc(100vw - 20px));
            min-height: 72px;
            padding: 6px;
            transform: translateX(-50%);
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            border: 3px solid var(--game-wood-edge);
            border-radius: 16px;
            background:
                linear-gradient(90deg, rgba(255,255,255,.13), transparent 24%, rgba(90,47,20,.08) 65%, transparent),
                repeating-linear-gradient(2deg, var(--game-wood-light) 0 16px, #d2a367 16px 18px, var(--game-wood-light) 18px 32px);
            box-shadow: inset 0 0 0 3px rgba(255, 239, 201, .28), 0 10px 32px rgba(27, 14, 6, .42);
            font-family: Georgia, "Times New Roman", serif;
        }

        body[data-view-mode="game"] .game-nav-button {
            min-width: 0;
            min-height: 56px;
            padding: 5px 8px;
            border: 1px solid rgba(91, 53, 25, .42);
            border-radius: 11px;
            background: rgba(255, 236, 194, .18);
            color: var(--game-ink);
            display: grid;
            grid-template-columns: 30px auto;
            place-content: center;
            align-items: center;
            gap: 8px;
            font-size: 16px;
            font-weight: 700;
        }
        body[data-view-mode="game"] .game-nav-button:hover { background: rgba(255, 242, 210, .38); }
        body[data-view-mode="game"] .game-nav-button[aria-pressed="true"] {
            background: rgba(255, 226, 160, .58);
            box-shadow: inset 0 0 0 2px rgba(255, 244, 211, .42), 0 0 0 2px #efca82;
        }
        .game-nav-icon { width: 28px; height: 28px; display: grid; place-items: center; }
        .game-nav-icon svg { width: 27px; height: 27px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

        @media (max-width: 700px) {
            body[data-view-mode="game"] .game-hud {
                left: 8px;
                right: 8px;
                justify-content: flex-end;
                gap: 6px;
            }
            body[data-view-mode="game"] .game-speed-controls { gap: 4px; padding: 5px; }
            body[data-view-mode="game"] .game-speed-button { min-width: 42px; height: 42px; padding: 0 7px; font-size: 16px; }
            body[data-view-mode="game"] .game-speed-button[data-hud-speed="5"],
            body[data-view-mode="game"] .game-speed-button[data-hud-speed="20"] { font-size: 14px; }
            body[data-view-mode="game"] .game-time-card { min-width: 104px; padding: 6px 10px; }
            .game-day-label { font-size: 13px; }
            .game-clock-label { font-size: 22px; }
            body[data-view-mode="game"] .map-controls { top: 72px; left: 8px; }
            body[data-view-mode="game"] .map-controls button { min-height: 40px; padding: 0 8px; }
            body[data-view-mode="game"] .people-panel,
            body[data-view-mode="game"] .game-drawer { bottom: calc(80px + max(7px, env(safe-area-inset-bottom))); }
            body[data-view-mode="game"] .game-bottom-nav { min-height: 66px; bottom: max(7px, env(safe-area-inset-bottom)); }
            body[data-view-mode="game"] .game-nav-button { min-height: 52px; grid-template-columns: 26px auto; gap: 5px; font-size: 14px; }
            .game-nav-icon, .game-nav-icon svg { width: 24px; height: 24px; }
        }

        @media (max-width: 440px) {
            body[data-view-mode="game"] .game-speed-button { min-width: 38px; width: 38px; padding: 0 4px; }
            body[data-view-mode="game"] .game-speed-button[data-hud-speed="20"] { width: 44px; }
            body[data-view-mode="game"] .game-time-card { min-width: 88px; padding-inline: 7px; }
            body[data-view-mode="game"] .game-nav-button { grid-template-columns: 1fr; gap: 1px; font-size: 12px; }
            .game-nav-icon { margin: 0 auto; }
        }
    `;
    document.head.append(styles);

    const iconMarkup = {
        people: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="11" cy="10" r="4"/><circle cx="22" cy="11" r="3.5"/><path d="M4.5 25c0-5 2.8-8 6.5-8s6.5 3 6.5 8"/><path d="M17.5 25c0-4.1 2-6.6 5-6.6 3.1 0 5 2.5 5 6.6"/></svg>',
        buildings: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 15.5 16 5l12 10.5"/><path d="M7.5 14v13h17V14"/><path d="M13 27v-8h6v8"/></svg>',
        settings: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="4"/><path d="m16 3 2 3.3 3.8.8 3.1-2.4 2.4 2.4-2.4 3.1.8 3.8L29 16l-3.3 2-.8 3.8 2.4 3.1-2.4 2.4-3.1-2.4-3.8.8L16 29l-2-3.3-3.8-.8-3.1 2.4-2.4-2.4 2.4-3.1-.8-3.8L3 16l3.3-2 .8-3.8-2.4-3.1 2.4-2.4 3.1 2.4 3.8-.8L16 3Z"/></svg>'
    };

    const hud = document.createElement("div");
    hud.className = "game-hud";
    hud.setAttribute("aria-label", "Simulation time and speed");

    const hudControls = document.createElement("div");
    hudControls.className = "game-speed-controls";
    hudControls.setAttribute("role", "group");
    hudControls.setAttribute("aria-label", "Simulation speed controls");

    function hudButton(label, text, speed) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "game-speed-button game-wood-button";
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", "false");
        button.textContent = text;
        if (speed) button.dataset.hudSpeed = speed;
        return button;
    }

    const hudPauseButton = hudButton("Pause simulation", "Ⅱ", "pause");
    const hudPlayButton = hudButton("Run simulation at normal speed", "▶", "1");
    const hudFiveButton = hudButton("Run simulation at five times speed", "×5", "5");
    const hudTwentyButton = hudButton("Run simulation at twenty times speed", "×20", "20");
    hudControls.append(hudPauseButton, hudPlayButton, hudFiveButton, hudTwentyButton);

    const hudTime = document.createElement("div");
    hudTime.className = "game-time-card";
    hudTime.setAttribute("aria-live", "polite");
    const hudDay = document.createElement("span");
    hudDay.className = "game-day-label";
    const hudClock = document.createElement("span");
    hudClock.className = "game-clock-label";
    hudTime.append(hudDay, hudClock);
    hud.append(hudControls, hudTime);
    document.body.append(hud);

    function simulationRunning() {
        return playButton.getAttribute("aria-pressed") === "true";
    }

    function speedIs(speed) {
        return speedButtons.get(String(speed))?.getAttribute("aria-pressed") === "true";
    }

    function refreshHudControls() {
        const running = simulationRunning();
        hudPauseButton.setAttribute("aria-pressed", String(!running));
        hudPlayButton.setAttribute("aria-pressed", String(running && speedIs(1)));
        hudFiveButton.setAttribute("aria-pressed", String(running && speedIs(5)));
        hudTwentyButton.setAttribute("aria-pressed", String(running && speedIs(20)));
    }

    function runAtSpeed(speed) {
        const speedButton = speedButtons.get(String(speed));
        if (speedButton && !speedIs(speed)) speedButton.click();
        if (!simulationRunning()) playButton.click();
        refreshHudControls();
    }

    hudPauseButton.addEventListener("click", () => {
        if (simulationRunning()) playButton.click();
        refreshHudControls();
    });
    hudPlayButton.addEventListener("click", () => runAtSpeed(1));
    hudFiveButton.addEventListener("click", () => runAtSpeed(5));
    hudTwentyButton.addEventListener("click", () => runAtSpeed(20));

    function refreshHudTime() {
        const label = timeSource.textContent?.trim() ?? "";
        const match = /^Day\s+(\d+)\s+(\d{1,2}:\d{2})$/i.exec(label);
        if (match) {
            hudDay.textContent = `Day ${match[1]}`;
            hudClock.textContent = match[2];
            return;
        }
        hudDay.textContent = "Village";
        hudClock.textContent = label || "--:--";
    }

    const toolbarObserver = new MutationObserver(() => {
        refreshHudControls();
        refreshHudTime();
    });
    toolbarObserver.observe(toolbar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-pressed"] });

    const modeGroup = document.createElement("div");
    modeGroup.className = "view-mode-group";
    modeGroup.setAttribute("aria-label", "Viewer mode");
    const gameButton = document.createElement("button");
    gameButton.type = "button";
    gameButton.textContent = "Game";
    gameButton.dataset.viewMode = "game";
    const debugButton = document.createElement("button");
    debugButton.type = "button";
    debugButton.textContent = "Debug";
    debugButton.dataset.viewMode = "debug";
    modeGroup.append(gameButton, debugButton);
    toolbar.append(modeGroup);

    const buildingsPanel = document.createElement("section");
    buildingsPanel.className = "panel game-drawer game-buildings-panel";
    buildingsPanel.setAttribute("aria-label", "Buildings");
    const buildingsHeading = document.createElement("div");
    buildingsHeading.className = "game-drawer-heading";
    buildingsHeading.textContent = "Buildings";
    const buildingsList = document.createElement("div");
    buildingsList.className = "game-building-list";
    buildingsList.setAttribute("aria-label", "Building list");
    buildingsPanel.append(buildingsHeading, buildingsList);
    document.body.append(buildingsPanel);

    const settingsPanel = document.createElement("section");
    settingsPanel.className = "panel game-drawer game-settings-panel";
    settingsPanel.setAttribute("aria-label", "Settings");
    const settingsHeading = document.createElement("div");
    settingsHeading.className = "game-drawer-heading";
    settingsHeading.textContent = "Settings";
    const settingsContent = document.createElement("div");
    settingsContent.className = "game-settings-content";
    const settingsNote = document.createElement("p");
    settingsNote.className = "game-settings-note";
    settingsNote.textContent = "Game view keeps the village front and centre. Debug view restores the timeline, inspector and event log.";
    const fitVillageButton = document.createElement("button");
    fitVillageButton.type = "button";
    fitVillageButton.className = "game-settings-action game-wood-button";
    fitVillageButton.textContent = "Fit village to screen";
    const openDebugButton = document.createElement("button");
    openDebugButton.type = "button";
    openDebugButton.className = "game-settings-action game-wood-button";
    openDebugButton.textContent = "Open debug view";
    settingsContent.append(settingsNote, fitVillageButton, openDebugButton);
    settingsPanel.append(settingsHeading, settingsContent);
    document.body.append(settingsPanel);

    const bottomNav = document.createElement("nav");
    bottomNav.className = "game-bottom-nav";
    bottomNav.setAttribute("aria-label", "Village menu");

    function navButton(id, label) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "game-nav-button";
        button.dataset.gamePanel = id;
        button.setAttribute("aria-pressed", "false");
        const icon = document.createElement("span");
        icon.className = "game-nav-icon";
        icon.innerHTML = iconMarkup[id];
        const text = document.createElement("span");
        text.textContent = label;
        button.append(icon, text);
        return button;
    }

    const peopleNavButton = navButton("people", "People");
    const buildingsNavButton = navButton("buildings", "Buildings");
    const settingsNavButton = navButton("settings", "Settings");
    bottomNav.append(peopleNavButton, buildingsNavButton, settingsNavButton);
    document.body.append(bottomNav);
    const navButtons = new Map([
        ["people", peopleNavButton],
        ["buildings", buildingsNavButton],
        ["settings", settingsNavButton]
    ]);

    function contentLabel(id) {
        const frame = recording?.frames?.[frameIndex];
        const entity = frame ? entityAtFrame(frame, id) : undefined;
        return entity?.label ?? humanize(id);
    }

    function contentQuantity(content) {
        if (content.kind === "liquid" && Number.isFinite(content.capacity)) {
            return `${formatNumber(content.quantity)} / ${formatNumber(content.capacity)}`;
        }
        return `×${formatNumber(content.quantity)}`;
    }

    function contentSummary(contents) {
        const grouped = new Map();
        for (const content of contents) {
            const key = `${content.kind}:${content.type}`;
            const existing = grouped.get(key) ?? {
                kind: content.kind,
                type: content.type,
                quantity: 0,
                capacity: 0
            };
            existing.quantity += content.quantity;
            if (content.kind === "liquid" && Number.isFinite(content.capacity)) existing.capacity += content.capacity;
            grouped.set(key, existing);
        }
        return [...grouped.values()]
            .sort((first, second) => first.type.localeCompare(second.type))
            .map(content => content.kind === "liquid"
                ? `${humanize(content.type)} ${formatNumber(content.quantity)}/${formatNumber(content.capacity)}`
                : `${humanize(content.type)} ×${formatNumber(content.quantity)}`)
            .join(" · ");
    }

    function appendEntityContents() {
        const entity = selectedEntity();
        if (!entity || !Array.isArray(entity.contents)) return;

        const section = document.createElement("section");
        section.className = "entity-contents";
        const heading = document.createElement("h3");
        heading.textContent = "Contents";
        section.append(heading);

        if (entity.contents.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No stored stock recorded here.";
            section.append(empty);
            inspectorElement.append(section);
            return;
        }

        const summary = document.createElement("div");
        summary.className = "entity-contents-summary";
        summary.textContent = contentSummary(entity.contents);
        section.append(summary);

        const list = document.createElement("div");
        list.className = "entity-content-list";
        for (const content of entity.contents) {
            const row = document.createElement("div");
            row.className = "entity-content-row";
            const main = document.createElement("div");
            main.className = "entity-content-main";
            const name = document.createElement("div");
            name.className = "entity-content-name";
            name.textContent = humanize(content.type);
            const quantity = document.createElement("div");
            quantity.className = "entity-content-quantity";
            quantity.textContent = contentQuantity(content);
            main.append(name, quantity);
            const meta = document.createElement("div");
            meta.className = "entity-content-meta";
            const details = [`Location: ${contentLabel(content.locationId)}`];
            if (content.ownerId) details.push(`Owner: ${contentLabel(content.ownerId)}`);
            meta.textContent = details.join(" · ");
            if (content.forSale) {
                const sale = document.createElement("span");
                sale.className = "entity-content-sale";
                sale.textContent = " · For sale";
                meta.append(sale);
            }
            row.append(main, meta);
            list.append(row);
        }
        section.append(list);
        inspectorElement.append(section);
    }

    const originalRenderInspector = renderInspector;
    renderInspector = function renderInspectorWithEntityContents() {
        originalRenderInspector();
        appendEntityContents();
    };

    function currentBuildings() {
        const frame = recording?.frames?.[frameIndex];
        if (!frame) return [];
        return (frame.entities ?? [])
            .filter(entity => entity.subtype === "building")
            .sort((first, second) => (first.label ?? first.id).localeCompare(second.label ?? second.id));
    }

    function buildingMeta(entity) {
        const contents = Array.isArray(entity.contents) ? entity.contents : [];
        if (contents.length === 0) return "Building";
        const stockTypes = new Set(contents.map(content => content.type)).size;
        return `${stockTypes} stored item type${stockTypes === 1 ? "" : "s"}`;
    }

    function renderBuildings() {
        const buildings = currentBuildings();
        buildingsHeading.textContent = `Buildings (${buildings.length})`;
        if (buildings.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No buildings are visible in this simulation frame.";
            buildingsList.replaceChildren(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const building of buildings) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "game-building-card";
            card.dataset.buildingId = building.id;
            card.setAttribute("aria-pressed", String(selectedEntityId === building.id));
            card.setAttribute("aria-label", `Select ${building.label ?? building.id}`);
            const icon = document.createElement("span");
            icon.className = "game-building-icon";
            icon.innerHTML = iconMarkup.buildings;
            const text = document.createElement("span");
            const name = document.createElement("span");
            name.className = "game-building-name";
            name.textContent = building.label ?? humanize(building.id);
            const meta = document.createElement("span");
            meta.className = "game-building-meta";
            meta.textContent = buildingMeta(building);
            text.append(name, meta);
            card.append(icon, text);
            fragment.append(card);
        }
        buildingsList.replaceChildren(fragment);
    }

    function selectBuilding(id) {
        const frame = recording?.frames?.[frameIndex];
        const building = frame ? entityAtFrame(frame, id) : undefined;
        if (!building || building.subtype !== "building") return;
        selectedEntityId = building.id;
        followSelected = false;
        if (building.position) {
            camera.x = building.position.x;
            camera.y = building.position.y;
        }
        updateFollowButton();
        renderMap();
        renderInspector();
        setGamePanel(undefined);
    }

    buildingsList.addEventListener("click", event => {
        const card = event.target.closest("[data-building-id]");
        if (!card) return;
        selectBuilding(card.dataset.buildingId);
    });

    function refreshButtons() {
        const mode = document.body.dataset.viewMode ?? "game";
        gameButton.setAttribute("aria-pressed", String(mode === "game"));
        debugButton.setAttribute("aria-pressed", String(mode === "debug"));
        const currentPanel = document.body.dataset.gamePanel;
        for (const [id, button] of navButtons) {
            button.setAttribute("aria-pressed", String(mode === "game" && id === currentPanel));
        }
        refreshHudControls();
        refreshHudTime();
    }

    function refreshCanvasAfterLayout() {
        requestAnimationFrame(() => {
            resizeCanvas();
            renderMap();
        });
    }

    function setViewMode(mode) {
        document.body.dataset.viewMode = mode === "debug" ? "debug" : "game";
        if (mode === "debug") delete document.body.dataset.gamePanel;
        refreshButtons();
        refreshCanvasAfterLayout();
    }

    function setGamePanel(panel) {
        if (!navButtons.has(panel)) {
            delete document.body.dataset.gamePanel;
        } else if (document.body.dataset.gamePanel === panel) {
            delete document.body.dataset.gamePanel;
        } else {
            document.body.dataset.gamePanel = panel;
            if (panel === "buildings") renderBuildings();
        }
        refreshButtons();
    }

    modeGroup.addEventListener("click", event => {
        const button = event.target.closest("[data-view-mode]");
        if (!button) return;
        setViewMode(button.dataset.viewMode);
    });

    bottomNav.addEventListener("click", event => {
        const button = event.target.closest("[data-game-panel]");
        if (!button) return;
        setGamePanel(button.dataset.gamePanel);
    });

    peopleList?.addEventListener("click", event => {
        if (document.body.dataset.viewMode !== "game") return;
        if (!event.target.closest("[data-character-id]")) return;
        requestAnimationFrame(() => setGamePanel(undefined));
    });

    fitVillageButton.addEventListener("click", () => {
        root.querySelector("#fit-world")?.click();
        setGamePanel(undefined);
    });
    openDebugButton.addEventListener("click", () => setViewMode("debug"));

    window.addEventListener("resize", refreshCanvasAfterLayout);

    setViewMode("game");
    refreshHudTime();
    renderBuildings();

    window.VillageGameShell = Object.freeze({
        setViewMode,
        setGamePanel
    });
})();
