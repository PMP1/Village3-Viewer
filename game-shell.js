(() => {
    const toolbar = root.querySelector(".toolbar");
    const worldPanel = canvas.closest("section.panel");
    const peoplePanel = root.querySelector(".people-panel");
    const inspectorPanel = root.querySelector(".inspector-panel");
    const eventsPanel = root.querySelector(".events-panel");
    const peopleList = root.querySelector("#people-list");
    if (!toolbar || !worldPanel || !peoplePanel || !inspectorPanel || !eventsPanel) return;

    worldPanel.classList.add("world-panel");

    const styles = document.createElement("style");
    styles.textContent = `
        .view-mode-group { display: flex; gap: 6px; margin-left: auto; }
        .view-mode-group button { min-height: 40px; }
        .mobile-game-nav { display: none; }

        body[data-view-mode="game"] .timeline-row,
        body[data-view-mode="game"] #restart,
        body[data-view-mode="game"] #back,
        body[data-view-mode="game"] #forward,
        body[data-view-mode="game"] #status,
        body[data-view-mode="game"] .map-note {
            display: none;
        }

        body[data-view-mode="game"] .toolbar {
            padding: 10px 12px;
            border: 1px solid #30363d;
            border-radius: 10px;
            background: #161b22;
        }

        @media (max-width: 820px) {
            body[data-view-mode="game"] {
                overflow: hidden;
                overscroll-behavior: none;
            }

            body[data-view-mode="game"] .shell {
                width: 100%;
                max-width: none;
                height: 100dvh;
                margin: 0;
                padding: 0 0 64px;
                overflow: hidden;
            }

            body[data-view-mode="game"] .toolbar {
                min-height: 56px;
                margin: 0;
                padding: 8px;
                gap: 6px;
                flex-wrap: nowrap;
                border: 0;
                border-bottom: 1px solid #30363d;
                border-radius: 0;
                position: relative;
                z-index: 30;
            }

            body[data-view-mode="game"] .time {
                flex: 1 1 auto;
                width: auto;
                min-width: 0;
                font-size: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            body[data-view-mode="game"] .spacer { display: none; }
            body[data-view-mode="game"] .speed-group { gap: 3px; }
            body[data-view-mode="game"] .speed-group button,
            body[data-view-mode="game"] .view-mode-group button,
            body[data-view-mode="game"] #play {
                min-height: 40px;
                padding: 0 9px;
            }

            body[data-view-mode="game"] .layout {
                display: block;
                height: calc(100dvh - 120px);
            }

            body[data-view-mode="game"] .world-panel {
                display: block;
                height: 100%;
                border: 0;
                border-radius: 0;
            }

            body[data-view-mode="game"] .world-panel > .panel-heading { display: none; }
            body[data-view-mode="game"] .world-panel .map-wrap,
            body[data-view-mode="game"] #map {
                width: 100%;
                height: 100%;
                min-height: 0;
            }

            body[data-view-mode="game"] .people-panel,
            body[data-view-mode="game"] .inspector-panel,
            body[data-view-mode="game"] .events-panel {
                display: none;
                position: fixed;
                left: 8px;
                right: 8px;
                bottom: 72px;
                z-index: 25;
                max-height: min(56dvh, 560px);
                margin: 0;
                border-radius: 12px;
                box-shadow: 0 14px 48px rgba(0, 0, 0, 0.55);
                background: #0d1117;
            }

            body[data-view-mode="game"][data-mobile-panel="people"] .people-panel,
            body[data-view-mode="game"][data-mobile-panel="details"] .inspector-panel,
            body[data-view-mode="game"][data-mobile-panel="events"] .events-panel {
                display: block;
            }

            body[data-view-mode="game"] .people-list,
            body[data-view-mode="game"] .events,
            body[data-view-mode="game"] .inspector {
                max-height: calc(min(56dvh, 560px) - 44px);
                overflow: auto;
                overscroll-behavior: contain;
            }

            body[data-view-mode="game"] .mobile-game-nav {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 40;
                height: 64px;
                padding: 5px max(6px, env(safe-area-inset-right)) max(5px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left));
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 5px;
                border-top: 1px solid #30363d;
                background: rgba(13, 17, 23, 0.97);
                backdrop-filter: blur(8px);
            }

            body[data-view-mode="game"] .mobile-game-nav button {
                min-width: 0;
                min-height: 48px;
                padding: 0 6px;
                font-size: 12px;
            }

            body[data-view-mode="game"] .map-controls {
                top: 8px;
                left: 8px;
            }

            body[data-view-mode="game"] .map-controls button {
                min-width: 42px;
                min-height: 42px;
                padding: 0 8px;
            }
        }

        @media (max-width: 520px) {
            body[data-view-mode="game"] .speed-group button[data-speed="5"] { display: none; }
            body[data-view-mode="game"] .view-mode-group button { padding: 0 7px; font-size: 12px; }
        }
    `;
    document.head.append(styles);

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

    const mobileNav = document.createElement("nav");
    mobileNav.className = "mobile-game-nav";
    mobileNav.setAttribute("aria-label", "Game panels");

    const panels = [
        { id: "world", label: "Village", controls: "map" },
        { id: "people", label: "People", controls: "people-list" },
        { id: "details", label: "Details", controls: "inspector" },
        { id: "events", label: "Events", controls: "events" }
    ];

    const panelButtons = new Map();
    for (const panel of panels) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = panel.label;
        button.dataset.mobilePanel = panel.id;
        button.setAttribute("aria-controls", panel.controls);
        button.setAttribute("aria-pressed", "false");
        panelButtons.set(panel.id, button);
        mobileNav.append(button);
    }
    document.body.append(mobileNav);

    function refreshButtons() {
        const mode = document.body.dataset.viewMode ?? "game";
        gameButton.setAttribute("aria-pressed", String(mode === "game"));
        debugButton.setAttribute("aria-pressed", String(mode === "debug"));
        const currentPanel = document.body.dataset.mobilePanel ?? "world";
        for (const [id, button] of panelButtons) {
            button.setAttribute("aria-pressed", String(mode === "game" && id === currentPanel));
        }
    }

    function refreshCanvasAfterLayout() {
        requestAnimationFrame(() => {
            resizeCanvas();
            renderMap();
        });
    }

    function setViewMode(mode) {
        document.body.dataset.viewMode = mode === "debug" ? "debug" : "game";
        if (!document.body.dataset.mobilePanel) document.body.dataset.mobilePanel = "world";
        refreshButtons();
        refreshCanvasAfterLayout();
    }

    function setMobilePanel(panel) {
        if (!panelButtons.has(panel)) panel = "world";
        document.body.dataset.mobilePanel = panel;
        refreshButtons();
        refreshCanvasAfterLayout();
    }

    modeGroup.addEventListener("click", event => {
        const button = event.target.closest("[data-view-mode]");
        if (!button) return;
        setViewMode(button.dataset.viewMode);
    });

    mobileNav.addEventListener("click", event => {
        const button = event.target.closest("[data-mobile-panel]");
        if (!button) return;
        setMobilePanel(button.dataset.mobilePanel);
    });

    peopleList?.addEventListener("click", event => {
        if (window.innerWidth > 820 || document.body.dataset.viewMode !== "game") return;
        if (!event.target.closest("[data-character-id]")) return;
        requestAnimationFrame(() => setMobilePanel("world"));
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 820 && document.body.dataset.mobilePanel !== "world") {
            document.body.dataset.mobilePanel = "world";
            refreshButtons();
        }
    });

    setViewMode("game");
    setMobilePanel("world");

    window.VillageGameShell = Object.freeze({
        setViewMode,
        setMobilePanel
    });
})();
