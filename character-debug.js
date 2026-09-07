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
        characterMetadataInitialised = true;
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

            const stats = document.createElement("span");
            stats.className = "person-stats";
            for (const definition of statDefinitions) stats.append(statRow(definition, character));

            const goal = document.createElement("span");
            goal.className = "person-goal";
            goal.innerHTML = `<span class="person-detail-label">Goal</span> ${friendlyLabel(character.properties?.currentGoal) ?? "No active goal"}`;

            const action = document.createElement("span");
            action.className = "person-action";
            action.innerHTML = `<span class="person-detail-label">Doing</span> ${friendlyLabel(character.state?.action) ?? "Idle / deciding"}`;

            details.append(name, stats, goal, action);
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

    renderEvents = renderCharacterEvents;

    peopleList.addEventListener("click", event => {
        const card = event.target.closest("[data-character-id]");
        if (!card) return;
        focusCharacter(card.dataset.characterId);
    });

    showAllEventsButton.addEventListener("click", () => focusCharacter(undefined));
})();
