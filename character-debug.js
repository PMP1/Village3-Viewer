(() => {
    const peopleList = root.querySelector("#people-list");
    const showAllEventsButton = root.querySelector("#show-all-events");
    const filterStatusElement = root.querySelector("#event-filter-status");
    if (!peopleList || !showAllEventsButton || !filterStatusElement) return;

    let focusedCharacterId;
    let characterMetadataInitialised = false;
    const characterMetadata = new Map();

    const statDefinitions = [
        { key: "hunger", label: "Hunger" },
        { key: "fullness", label: "Full" },
        { key: "thirst", label: "Thirst" },
        { key: "tiredness", label: "Tired" },
        { key: "socialNeed", label: "Social" }
    ];

    function compactNumber(value, decimals = 0) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return "—";
        const factor = 10 ** decimals;
        const rounded = Math.round(numeric * factor) / factor;
        return decimals === 0
            ? String(Math.round(rounded))
            : rounded.toFixed(decimals).replace(/\.0+$/, "");
    }

    function formatMoney(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? `£${compactNumber(numeric, 1)}` : "—";
    }

    // Keep simulation precision intact but present compact numbers throughout the viewer.
    formatNumber = value => compactNumber(value, 1);

    function formatEventMessage(message) {
        return String(message).replace(/-?\d+\.\d{2,}/g, value => compactNumber(Number(value), 1));
    }

    function escapeRegularExpression(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function ensureCharacterMetadata() {
        if (characterMetadataInitialised || !recording) return;

        for (const frame of recording.frames) {
            for (const entity of frame.entities ?? []) {
                if (entity.category !== "character" || characterMetadata.has(entity.id)) continue;
                characterMetadata.set(entity.id, {
                    id: entity.id,
                    label: entity.label ?? entity.id
                });
            }
        }
        characterMetadataInitialised = characterMetadata.size > 0;
    }

    function characterForId(id) {
        if (!id || !recording) return undefined;
        const current = entityAtFrame(recording.frames[frameIndex], id);
        if (current?.category === "character") return current;
        const metadata = characterMetadata.get(id);
        return metadata ? { ...metadata, category: "character" } : undefined;
    }

    function friendlyLabel(value) {
        if (!value) return undefined;
        return humanize(String(value).replace(/:/g, " · "));
    }

    function planningReason(character) {
        const type = character.properties?.currentGoalReasonType;
        const id = friendlyLabel(character.properties?.currentGoalReasonId);
        if (!type) return "No active reason";

        switch (type) {
            case "need": return id ? `${id} need` : "Physical need";
            case "activity": return id ? `Activity · ${id}` : "Activity";
            case "request": return id ? `Request · ${id}` : "Request";
            case "agenda": return id ? `Agenda · ${id}` : "Agenda";
            default: return id ? `${friendlyLabel(type)} · ${id}` : friendlyLabel(type);
        }
    }

    function detailLine(labelText, value, fallback) {
        const line = document.createElement("span");
        line.className = "person-goal";

        const label = document.createElement("span");
        label.className = "person-detail-label";
        label.textContent = labelText;

        line.append(label, document.createTextNode(` ${value ?? fallback}`));
        return line;
    }

    function initials(label) {
        const words = String(label ?? "?").trim().split(/\s+/).filter(Boolean);
        return words.slice(0, 2).map(word => word[0]?.toUpperCase() ?? "").join("") || "?";
    }

    function statRow(definition, character) {
        const rawValue = Number(character.properties?.[definition.key]);
        const value = Number.isFinite(rawValue) ? clamp(rawValue, 0, 100) : 0;

        const row = document.createElement("div");
        row.className = "person-stat";

        const label = document.createElement("span");
        label.className = "person-stat-label";
        label.textContent = definition.label;

        const track = document.createElement("span");
        track.className = "person-stat-track";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `${definition.label} ${compactNumber(rawValue)} out of 100`);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", compactNumber(value));

        const fill = document.createElement("span");
        fill.className = "person-stat-fill";
        fill.style.width = `${value}%`;
        track.append(fill);

        const number = document.createElement("span");
        number.className = "person-stat-value";
        number.textContent = compactNumber(rawValue);

        row.append(label, track, number);
        return row;
    }

    function renderPeopleRoster() {
        ensureCharacterMetadata();
        if (!recording) return;

        const frame = recording.frames[frameIndex];
        const characters = [...characterMetadata.values()]
            .map(metadata => entityAtFrame(frame, metadata.id) ?? { ...metadata, category: "character" })
            .sort((first, second) => (first.label ?? first.id).localeCompare(second.label ?? second.id));

        const fragment = document.createDocumentFragment();
        for (const character of characters) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "person-card";
            card.dataset.characterId = character.id;
            card.setAttribute("aria-pressed", String(character.id === focusedCharacterId));
            card.setAttribute("aria-label", `Focus ${character.label ?? character.id}`);

            const avatar = document.createElement("span");
            avatar.className = "person-avatar";
            avatar.textContent = initials(character.label ?? character.id);
            avatar.setAttribute("aria-hidden", "true");

            const details = document.createElement("span");
            details.className = "person-details";

            const name = document.createElement("strong");
            name.className = "person-name";
            name.textContent = character.label ?? character.id;

            const money = detailLine("Money", formatMoney(character.properties?.money), "—");
            const stats = document.createElement("span");
            stats.className = "person-stats";
            for (const definition of statDefinitions) stats.append(statRow(definition, character));

            const goal = detailLine(
                "Goal",
                friendlyLabel(character.properties?.currentGoal),
                "No active goal"
            );
            const reason = detailLine("Why", planningReason(character), "No active reason");
            const plan = detailLine(
                "Plan",
                friendlyLabel(character.properties?.currentPlan),
                "No active plan"
            );
            const subgoal = detailLine(
                "Subgoal",
                friendlyLabel(character.properties?.currentSubgoal),
                "None"
            );
            const next = detailLine(
                "Next",
                friendlyLabel(character.properties?.nextPlanStep),
                "Nothing queued"
            );
            const action = detailLine(
                "Doing",
                friendlyLabel(character.state?.action),
                "Idle / deciding"
            );
            action.className = "person-action";
            const latestDecision = latestDecisionForCharacter(character);
            const decision = detailLine(
                "Decision",
                latestDecision ? formatEventMessage(latestDecision.message) : undefined,
                "No decision yet"
            );

            details.append(name, money, stats, goal, reason, plan, subgoal, next, action, decision);
            card.append(avatar, details);
            fragment.append(card);
        }

        peopleList.replaceChildren(fragment);
    }

    function messageMentionsCharacter(message, character) {
        const label = character?.label?.trim();
        if (!label) return false;
        const pattern = new RegExp(
            `(^|[^A-Za-z0-9])${escapeRegularExpression(label)}(?=$|[^A-Za-z0-9])`,
            "i"
        );
        return pattern.test(message);
    }

    function eventMatchesCharacter(event, character) {
        if (!character) return true;
        if (event.actorIds?.includes(character.id)) return true;
        if (event.entityIds?.includes(character.id)) return true;
        return messageMentionsCharacter(event.message, character);
    }

    function latestDecisionForCharacter(character) {
        if (!recording || !character) return undefined;
        const currentTick = recording.frames[frameIndex]?.tick ?? 0;
        let latest;

        for (const event of recording.events ?? []) {
            if (event.level !== "decision" || event.tick > currentTick) continue;
            if (!eventMatchesCharacter(event, character)) continue;
            if (!latest || event.tick >= latest.tick) latest = event;
        }

        return latest;
    }

    function renderCharacterEvents() {
        ensureCharacterMetadata();
        renderPeopleRoster();
        const currentTick = recording.frames[frameIndex].tick;
        const character = characterForId(focusedCharacterId);
        const matchingEvents = recording.events.filter(event =>
            event.level === "event"
            && event.tick < currentTick
            && eventMatchesCharacter(event, character)
        );
        const visible = matchingEvents.slice(-80);

        eventsElement.replaceChildren();
        filterStatusElement.textContent = character
            ? `${character.label ?? character.id} · ${matchingEvents.length} event${matchingEvents.length === 1 ? "" : "s"} so far`
            : "All characters";
        showAllEventsButton.disabled = !character;

        if (visible.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = character
                ? `No events affecting ${character.label ?? character.id} yet.`
                : "No events yet.";
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
            message.textContent = formatEventMessage(event.message);
            row.append(time, message);
            fragment.append(row);
        }
        eventsElement.append(fragment);
        eventsElement.scrollTop = eventsElement.scrollHeight;
    }

    function focusCharacter(id) {
        ensureCharacterMetadata();
        focusedCharacterId = id || undefined;

        if (!focusedCharacterId) {
            followSelected = false;
            const current = selectedEntity();
            if (current?.category === "character") selectedEntityId = undefined;
            updateFollowButton();
            renderMap();
            renderInspector();
            renderEvents();
            return;
        }

        const entity = entityAtFrame(recording.frames[frameIndex], focusedCharacterId);
        if (!entity || entity.category !== "character") {
            renderEvents();
            return;
        }

        selectedEntityId = entity.id;
        followSelected = true;
        const limits = cameraScaleLimits();
        camera.scale = clamp(Math.max(camera.scale, FOLLOW_MIN_SCALE * 1.5), limits.min, limits.max);
        updateFollowCamera(recording.frames[frameIndex], true);
        updateFollowButton();
        renderMap();
        renderInspector();
        renderEvents();
    }

    const originalSelectAtScreenPoint = selectAtScreenPoint;
    selectAtScreenPoint = function selectAtScreenPointWithCharacterFilter(x, y) {
        originalSelectAtScreenPoint(x, y);
        const entity = selectedEntity();
        if (entity?.category !== "character") return;
        focusedCharacterId = entity.id;
        renderEvents();
    };

    const originalRenderInspector = renderInspector;
    renderInspector = function renderInspectorWithLatestDecision() {
        originalRenderInspector();
        const character = selectedEntity();
        if (character?.category !== "character") return;

        const decision = latestDecisionForCharacter(character);
        const list = inspectorElement.querySelector(".kv");
        if (!decision || !list) return;

        const decisionTerm = document.createElement("dt");
        decisionTerm.textContent = "Latest decision";
        const decisionDescription = document.createElement("dd");
        decisionDescription.textContent = formatEventMessage(decision.message);
        const timeTerm = document.createElement("dt");
        timeTerm.textContent = "Decision time";
        const timeDescription = document.createElement("dd");
        timeDescription.textContent = eventTimeLabel(decision);
        list.append(decisionTerm, decisionDescription, timeTerm, timeDescription);
    };

    renderEvents = renderCharacterEvents;

    peopleList.addEventListener("click", event => {
        const card = event.target.closest("[data-character-id]");
        if (!card) return;
        focusCharacter(card.dataset.characterId);
    });

    showAllEventsButton.addEventListener("click", () => focusCharacter(undefined));

    window.VillageCharacterDebug = Object.freeze({ focusCharacter });

    function initialiseCompactGameUi() {
        if (!document.body || !canvas || document.querySelector(".game-person-mini")) return;

        const ZOOM_LEVEL_MULTIPLIERS = [1, 1.5, 2, 3, 4, 5];
        const DEFAULT_GAME_ZOOM_MULTIPLIER = 2;
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        const defaultViewportContent = viewportMeta?.getAttribute("content") ?? "width=device-width, initial-scale=1";
        const GAME_VIEWPORT_CONTENT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

        function syncGameViewportLock() {
            if (!viewportMeta) return;
            viewportMeta.setAttribute(
                "content",
                document.body.dataset.viewMode === "game" ? GAME_VIEWPORT_CONTENT : defaultViewportContent
            );
        }

        new MutationObserver(syncGameViewportLock).observe(document.body, {
            attributes: true,
            attributeFilter: ["data-view-mode"]
        });
        syncGameViewportLock();

        function preventBrowserZoomGesture(event) {
            if (document.body.dataset.viewMode !== "game") return;
            event.preventDefault();
        }

        for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
            document.addEventListener(eventName, preventBrowserZoomGesture, { passive: false });
        }
        document.addEventListener("wheel", event => {
            if (document.body.dataset.viewMode !== "game" || !event.ctrlKey) return;
            event.preventDefault();
        }, { capture: true, passive: false });
        document.addEventListener("keydown", event => {
            if (document.body.dataset.viewMode !== "game") return;
            if (!(event.ctrlKey || event.metaKey)) return;
            if (!["+", "=", "-", "_", "0"].includes(event.key)) return;
            event.preventDefault();
        }, true);

        const styles = document.createElement("style");
        styles.textContent = `
            body[data-view-mode="game"] .game-hud {
                left: max(10px, env(safe-area-inset-left));
                right: max(10px, env(safe-area-inset-right));
                justify-content: space-between;
                align-items: flex-start;
            }

            body[data-view-mode="game"] .game-speed-controls {
                padding: 0;
                gap: 7px;
                border: 0;
                background: transparent;
                box-shadow: none;
            }

            body[data-view-mode="game"] .game-speed-button,
            body[data-view-mode="game"] .game-speed-button[data-hud-speed="5"],
            body[data-view-mode="game"] .game-speed-button[data-hud-speed="20"] {
                width: 50px;
                min-width: 50px;
                height: 50px;
                padding: 0;
                border-radius: 50%;
                font-size: 17px;
            }

            body[data-view-mode="game"] .game-time-card {
                min-width: 0;
                min-height: 50px;
                padding: 7px 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                text-align: left;
            }

            body[data-view-mode="game"] .game-day-label,
            body[data-view-mode="game"] .game-clock-label {
                margin: 0;
                font-size: 21px;
                line-height: 1;
            }

            body[data-view-mode="game"] .game-day-label {
                padding-right: 12px;
                border-right: 2px solid rgba(77, 47, 25, .44);
            }

            body[data-view-mode="game"] .game-season-label { display: none; }
            body[data-view-mode="game"] .map-controls { display: none; }

            .game-fixed-zoom-controls {
                display: none;
                position: fixed;
                right: max(12px, env(safe-area-inset-right));
                top: 42%;
                z-index: 64;
                transform: translateY(-50%);
                gap: 8px;
            }

            body[data-view-mode="game"] .game-fixed-zoom-controls {
                display: grid;
            }

            .game-fixed-zoom-button {
                width: 52px;
                min-width: 52px;
                height: 52px;
                padding: 0;
                border-radius: 11px;
                font-size: 30px;
                line-height: 1;
            }

            .game-person-mini {
                display: none;
                position: fixed;
                left: 50%;
                bottom: calc(91px + max(8px, env(safe-area-inset-bottom)));
                z-index: 64;
                width: min(720px, calc(100vw - 20px));
                min-height: 96px;
                transform: translateX(-50%);
                padding: 10px 13px;
                grid-template-columns: 58px minmax(0, 1fr) minmax(118px, .55fr);
                align-items: center;
                gap: 12px;
                color: var(--game-ink, #3b2414);
                border: 3px solid var(--game-wood-edge, #4d2f19);
                border-radius: 15px;
                background:
                    linear-gradient(90deg, rgba(255,255,255,.13), transparent 28%, rgba(90,47,20,.07) 69%, transparent),
                    repeating-linear-gradient(2deg, var(--game-wood-pale, #f1d8a9) 0 15px, #e8c990 15px 17px, var(--game-wood-pale, #f1d8a9) 17px 31px);
                box-shadow: inset 0 0 0 3px rgba(255, 244, 215, .3), 0 9px 28px rgba(27, 14, 6, .4);
                font-family: Georgia, "Times New Roman", serif;
                pointer-events: none;
            }

            body[data-view-mode="game"] .game-person-mini.is-visible { display: grid; }
            body[data-view-mode="game"][data-game-panel] .game-person-mini { display: none; }

            .game-person-mini-avatar {
                width: 56px;
                height: 56px;
                display: grid;
                place-items: center;
                border-radius: 12px;
                border: 2px solid rgba(77,47,25,.6);
                background: rgba(122, 84, 48, .28);
                box-shadow: inset 0 1px rgba(255,255,255,.4);
                font-size: 20px;
                font-weight: 800;
            }

            .game-person-mini-main { min-width: 0; }
            .game-person-mini-name {
                display: block;
                margin-bottom: 6px;
                font-size: 19px;
                line-height: 1;
                white-space: nowrap;
                overflow: clip;
                text-overflow: ellipsis;
            }

            .game-person-mini-stats { display: grid; gap: 5px; }
            .game-person-mini-stat {
                display: grid;
                grid-template-columns: 19px minmax(0, 1fr);
                gap: 6px;
                align-items: center;
            }
            .game-person-mini-stat-icon {
                font-size: 14px;
                text-align: center;
                line-height: 1;
            }
            .game-person-mini-stat-track {
                height: 9px;
                border-radius: 999px;
                overflow: clip;
                border: 1px solid rgba(77,47,25,.55);
                background: rgba(75, 46, 26, .48);
                box-shadow: inset 0 1px 2px rgba(34, 18, 8, .25);
            }
            .game-person-mini-stat-fill {
                display: block;
                height: 100%;
                border-radius: inherit;
                background: #b65b35;
            }
            .game-person-mini-stat[data-stat="thirst"] .game-person-mini-stat-fill { background: #4c83a8; }
            .game-person-mini-stat[data-stat="tiredness"] .game-person-mini-stat-fill { background: #9b7a31; }

            .game-person-mini-meta {
                min-width: 0;
                align-self: stretch;
                padding-left: 12px;
                border-left: 2px solid rgba(77,47,25,.35);
                display: grid;
                align-content: center;
                gap: 8px;
            }
            .game-person-mini-money {
                font-size: 20px;
                font-weight: 800;
                font-variant-numeric: tabular-nums;
            }
            .game-person-mini-action {
                font-size: 14px;
                font-weight: 700;
                line-height: 1.2;
                white-space: nowrap;
                overflow: clip;
                text-overflow: ellipsis;
            }

            @media (max-width: 700px) {
                body[data-view-mode="game"] .game-hud {
                    left: max(7px, env(safe-area-inset-left));
                    right: max(7px, env(safe-area-inset-right));
                }
                body[data-view-mode="game"] .game-speed-controls { gap: 4px; }
                body[data-view-mode="game"] .game-speed-button,
                body[data-view-mode="game"] .game-speed-button[data-hud-speed="5"],
                body[data-view-mode="game"] .game-speed-button[data-hud-speed="20"] {
                    width: 42px;
                    min-width: 42px;
                    height: 42px;
                    font-size: 14px;
                }
                body[data-view-mode="game"] .game-time-card {
                    min-height: 42px;
                    padding: 6px 9px;
                    gap: 8px;
                }
                body[data-view-mode="game"] .game-day-label,
                body[data-view-mode="game"] .game-clock-label { font-size: 17px; }
                body[data-view-mode="game"] .game-day-label { padding-right: 8px; }
                .game-fixed-zoom-controls { right: max(8px, env(safe-area-inset-right)); }
                .game-fixed-zoom-button { width: 46px; min-width: 46px; height: 46px; font-size: 27px; }
                .game-person-mini {
                    bottom: calc(82px + max(7px, env(safe-area-inset-bottom)));
                    min-height: 84px;
                    padding: 8px 10px;
                    grid-template-columns: 48px minmax(0, 1fr) 104px;
                    gap: 9px;
                }
                .game-person-mini-avatar { width: 46px; height: 46px; font-size: 17px; }
                .game-person-mini-name { margin-bottom: 5px; font-size: 16px; }
                .game-person-mini-stat { grid-template-columns: 16px minmax(0, 1fr); gap: 4px; }
                .game-person-mini-stat-icon { font-size: 12px; }
                .game-person-mini-stat-track { height: 7px; }
                .game-person-mini-meta { padding-left: 9px; gap: 5px; }
                .game-person-mini-money { font-size: 16px; }
                .game-person-mini-action { font-size: 12px; }
            }

            @media (max-width: 430px) {
                body[data-view-mode="game"] .game-speed-button,
                body[data-view-mode="game"] .game-speed-button[data-hud-speed="5"],
                body[data-view-mode="game"] .game-speed-button[data-hud-speed="20"] {
                    width: 38px;
                    min-width: 38px;
                    height: 38px;
                    font-size: 12px;
                }
                body[data-view-mode="game"] .game-time-card { min-height: 38px; padding-inline: 7px; }
                body[data-view-mode="game"] .game-day-label,
                body[data-view-mode="game"] .game-clock-label { font-size: 15px; }
                .game-person-mini {
                    grid-template-columns: 42px minmax(0, 1fr) 86px;
                    gap: 7px;
                    padding-inline: 8px;
                }
                .game-person-mini-avatar { width: 40px; height: 40px; font-size: 15px; }
                .game-person-mini-meta { padding-left: 7px; }
            }
        `;
        document.head.append(styles);

        const zoomControls = document.createElement("div");
        zoomControls.className = "game-fixed-zoom-controls";
        zoomControls.setAttribute("aria-label", "Fixed map zoom levels");
        const zoomIn = document.createElement("button");
        zoomIn.type = "button";
        zoomIn.className = "game-fixed-zoom-button game-wood-button";
        zoomIn.setAttribute("aria-label", "Zoom in one level");
        zoomIn.textContent = "+";
        const zoomOut = document.createElement("button");
        zoomOut.type = "button";
        zoomOut.className = "game-fixed-zoom-button game-wood-button";
        zoomOut.setAttribute("aria-label", "Zoom out one level");
        zoomOut.textContent = "−";
        zoomControls.append(zoomIn, zoomOut);
        document.body.append(zoomControls);

        const mini = document.createElement("aside");
        mini.className = "game-person-mini";
        mini.setAttribute("aria-live", "polite");
        mini.setAttribute("aria-label", "Tracked person");
        const miniAvatar = document.createElement("span");
        miniAvatar.className = "game-person-mini-avatar";
        miniAvatar.setAttribute("aria-hidden", "true");
        const miniMain = document.createElement("div");
        miniMain.className = "game-person-mini-main";
        const miniName = document.createElement("strong");
        miniName.className = "game-person-mini-name";
        const miniStats = document.createElement("div");
        miniStats.className = "game-person-mini-stats";
        const miniMeta = document.createElement("div");
        miniMeta.className = "game-person-mini-meta";
        const miniMoney = document.createElement("div");
        miniMoney.className = "game-person-mini-money";
        const miniAction = document.createElement("div");
        miniAction.className = "game-person-mini-action";
        miniMeta.append(miniMoney, miniAction);
        miniMain.append(miniName, miniStats);
        mini.append(miniAvatar, miniMain, miniMeta);
        document.body.append(mini);

        const miniStatDefinitions = [
            { key: "hunger", icon: "●", label: "Hunger" },
            { key: "thirst", icon: "◆", label: "Thirst" },
            { key: "tiredness", icon: "☾", label: "Tiredness" }
        ];
        const miniStatFills = new Map();
        for (const definition of miniStatDefinitions) {
            const row = document.createElement("div");
            row.className = "game-person-mini-stat";
            row.dataset.stat = definition.key;
            const icon = document.createElement("span");
            icon.className = "game-person-mini-stat-icon";
            icon.textContent = definition.icon;
            icon.setAttribute("aria-hidden", "true");
            const track = document.createElement("span");
            track.className = "game-person-mini-stat-track";
            track.setAttribute("role", "progressbar");
            track.setAttribute("aria-label", definition.label);
            track.setAttribute("aria-valuemin", "0");
            track.setAttribute("aria-valuemax", "100");
            const fill = document.createElement("span");
            fill.className = "game-person-mini-stat-fill";
            track.append(fill);
            row.append(icon, track);
            miniStats.append(row);
            miniStatFills.set(definition.key, { track, fill });
        }

        function trackedCharacter() {
            const entity = selectedEntity();
            return entity?.category === "character" ? entity : undefined;
        }

        function updateMiniStat(key, character) {
            const parts = miniStatFills.get(key);
            if (!parts) return;
            const raw = Number(character.properties?.[key]);
            const value = Number.isFinite(raw) ? clamp(raw, 0, 100) : 0;
            parts.fill.style.width = `${value}%`;
            parts.track.setAttribute("aria-valuenow", compactNumber(value));
        }

        function refreshMiniPerson() {
            const character = trackedCharacter();
            if (!character) {
                mini.classList.remove("is-visible");
                return;
            }
            miniAvatar.textContent = initials(character.label ?? character.id);
            miniName.textContent = character.label ?? character.id;
            miniMoney.textContent = formatMoney(character.properties?.money);
            miniAction.textContent = friendlyLabel(
                character.state?.action ?? character.properties?.currentGoal
            ) ?? "Idle / deciding";
            miniAction.title = miniAction.textContent;
            for (const definition of miniStatDefinitions) updateMiniStat(definition.key, character);
            mini.classList.add("is-visible");
        }

        function nearestZoomLevelIndex() {
            const fit = Math.max(0.0001, fittedScale());
            const ratio = camera.scale / fit;
            let bestIndex = 0;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let index = 0; index < ZOOM_LEVEL_MULTIPLIERS.length; index++) {
                const distance = Math.abs(ZOOM_LEVEL_MULTIPLIERS[index] - ratio);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = index;
                }
            }
            return bestIndex;
        }

        function updateFixedZoomButtons() {
            const index = nearestZoomLevelIndex();
            zoomOut.disabled = index <= 0;
            zoomIn.disabled = index >= ZOOM_LEVEL_MULTIPLIERS.length - 1;
        }

        function setFixedZoomLevel(index) {
            if (!cameraInitialised) return;
            const targetIndex = clamp(index, 0, ZOOM_LEVEL_MULTIPLIERS.length - 1);
            const wasFollowing = followSelected;
            setCameraScale(fittedScale() * ZOOM_LEVEL_MULTIPLIERS[targetIndex]);
            followSelected = wasFollowing;
            if (followSelected && recording?.frames?.[frameIndex]) {
                updateFollowCamera(recording.frames[frameIndex], true);
            }
            updateFollowButton();
            renderMap();
            updateFixedZoomButtons();
        }

        zoomIn.addEventListener("click", () => setFixedZoomLevel(nearestZoomLevelIndex() + 1));
        zoomOut.addEventListener("click", () => setFixedZoomLevel(nearestZoomLevelIndex() - 1));

        const originalFitWorld = fitWorld;
        fitWorld = function fitWorldAtGameDefaultZoom() {
            originalFitWorld();
            if (document.body.dataset.viewMode === "game" && cameraInitialised) {
                setCameraScale(fittedScale() * DEFAULT_GAME_ZOOM_MULTIPLIER);
            }
            updateFixedZoomButtons();
        };

        const settingsResetButton = [...document.querySelectorAll(".game-settings-action")]
            .find(button => button.textContent?.trim() === "Fit village to screen");
        if (settingsResetButton) settingsResetButton.textContent = "Reset game zoom";

        const previousRenderMap = renderMap;
        renderMap = function renderMapWithTrackedPersonSummary() {
            previousRenderMap();
            refreshMiniPerson();
        };

        function groundOnly(entity) {
            return entity?.category === "map-feature" && (
                entity.subtype === "road" ||
                entity.subtype === "market-square" ||
                entity.subtype === "cart-pitch"
            );
        }

        function selectableEntityAtPoint(x, y) {
            let nearest;
            let nearestDistance = 20;
            for (const item of projectedEntities) {
                if (groundOnly(item.entity)) continue;
                const insideBounds = item.bounds &&
                    x >= item.bounds.left && x <= item.bounds.right &&
                    y >= item.bounds.top && y <= item.bounds.bottom;
                const distance = insideBounds ? 0 : Math.hypot(item.point.x - x, item.point.y - y);
                if (distance < nearestDistance) {
                    nearest = item.entity;
                    nearestDistance = distance;
                }
            }
            return nearest;
        }

        const previousSelectAtScreenPoint = selectAtScreenPoint;
        selectAtScreenPoint = function selectAtScreenPointWithGameTracking(x, y) {
            if (document.body.dataset.viewMode !== "game") {
                previousSelectAtScreenPoint(x, y);
                return;
            }

            const hit = selectableEntityAtPoint(x, y);
            if (!hit) {
                selectedEntityId = undefined;
                followSelected = false;
                window.VillageCharacterDebug?.focusCharacter(undefined);
                updateFollowButton();
                renderMap();
                renderInspector();
                return;
            }

            previousSelectAtScreenPoint(x, y);
            const entity = selectedEntity();
            if (entity?.category === "character") {
                followSelected = true;
                updateFollowCamera(recording.frames[frameIndex], true);
                updateFollowButton();
                renderMap();
                renderInspector();
                return;
            }

            window.VillageCharacterDebug?.focusCharacter(undefined);
            refreshMiniPerson();
        };

        const previousPointerDown = handlePointerDown;
        const previousPointerMove = handlePointerMove;
        canvas.removeEventListener("pointerdown", previousPointerDown);
        canvas.removeEventListener("pointermove", previousPointerMove);

        handlePointerDown = function handlePointerDownWithoutGamePinch(event) {
            if (document.body.dataset.viewMode !== "game") {
                previousPointerDown(event);
                return;
            }
            if (activePointers.size > 0) {
                event.preventDefault();
                return;
            }
            const point = pointerPosition(event);
            activePointers.set(event.pointerId, point);
            canvas.setPointerCapture(event.pointerId);
            panStart = { screen: point, camera: { x: camera.x, y: camera.y } };
            pinchStart = undefined;
            pointerDragged = false;
        };

        handlePointerMove = function handlePointerMoveWithoutGamePinch(event) {
            if (document.body.dataset.viewMode !== "game") {
                previousPointerMove(event);
                return;
            }
            if (!activePointers.has(event.pointerId) || !panStart) return;
            const point = pointerPosition(event);
            activePointers.set(event.pointerId, point);
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

        canvas.addEventListener("pointerdown", handlePointerDown);
        canvas.addEventListener("pointermove", handlePointerMove);
        canvas.addEventListener("wheel", event => {
            if (document.body.dataset.viewMode !== "game") return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, { capture: true, passive: false });
        canvas.addEventListener("dblclick", event => {
            if (document.body.dataset.viewMode !== "game") return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);

        canvas.setAttribute(
            "aria-label",
            "Simulation map. Select a person to track them. Drag to pan and use the fixed zoom buttons to change zoom."
        );

        function applyInitialGameZoom() {
            if (!cameraInitialised || !recording?.frames?.length) {
                requestAnimationFrame(applyInitialGameZoom);
                return;
            }
            if (document.body.dataset.viewMode === "game") {
                setCameraScale(fittedScale() * DEFAULT_GAME_ZOOM_MULTIPLIER);
                renderMap();
            }
            updateFixedZoomButtons();
        }
        requestAnimationFrame(applyInitialGameZoom);
    }

    setTimeout(initialiseCompactGameUi, 0);
})();