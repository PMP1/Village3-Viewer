(() => {
    const NORTHERN_LATITUDE_DEGREES = 54.5;
    const DAYS_PER_YEAR = 365;
    const VILLAGE_START_DAY_OF_YEAR = 244;
    const MINUTES_PER_DAY = 24 * 60;
    const TWILIGHT_MINUTES = 45;
    const MAX_NIGHT_OPACITY = 0.68;

    const timeSource = document.querySelector("#time");
    const mapWrap = document.querySelector(".map-wrap");
    const timeCard = document.querySelector(".game-time-card");
    const dayLabel = document.querySelector(".game-day-label");
    if (!timeSource || !mapWrap) return;

    const style = document.createElement("style");
    style.textContent = `
        .village-daylight-overlay {
            position: absolute;
            inset: 0;
            z-index: 12;
            pointer-events: none;
            background: transparent;
            transition: background 180ms linear;
        }

        body:not([data-view-mode="game"]) .village-daylight-overlay {
            display: none;
        }

        .game-season-label {
            margin-top: 3px;
            font-size: 10px;
            font-weight: 700;
            line-height: 1;
            letter-spacing: .04em;
            text-transform: uppercase;
            opacity: .72;
        }

        @media (max-width: 700px) {
            .game-season-label { font-size: 9px; }
        }
    `;
    document.head.append(style);

    const overlay = document.createElement("div");
    overlay.className = "village-daylight-overlay";
    overlay.setAttribute("aria-hidden", "true");
    mapWrap.append(overlay);

    const seasonLabel = document.createElement("span");
    seasonLabel.className = "game-season-label";
    if (timeCard) timeCard.append(seasonLabel);

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    function smoothstep(value) {
        const t = clamp(value, 0, 1);
        return t * t * (3 - 2 * t);
    }

    function dayOfYear(day) {
        const elapsedDays = Math.max(1, day) - 1;
        const normalised = ((VILLAGE_START_DAY_OF_YEAR - 1 + elapsedDays) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
        return normalised + 1;
    }

    function seasonForDay(day) {
        const dayNumber = dayOfYear(day);
        if (dayNumber >= 335 || dayNumber <= 59) return "Winter";
        if (dayNumber <= 151) return "Spring";
        if (dayNumber <= 243) return "Summer";
        return "Autumn";
    }

    function daylightTimes(day) {
        const dayNumber = dayOfYear(day);
        const latitude = toRadians(NORTHERN_LATITUDE_DEGREES);
        const declinationDegrees = 23.44 * Math.sin((2 * Math.PI * (284 + dayNumber)) / DAYS_PER_YEAR);
        const declination = toRadians(declinationDegrees);
        const hourAngleCosine = clamp(-Math.tan(latitude) * Math.tan(declination), -1, 1);
        const hourAngle = Math.acos(hourAngleCosine);
        const daylightHours = (24 / Math.PI) * hourAngle;
        const halfDaylightMinutes = daylightHours * 30;

        return {
            sunriseMinute: (MINUTES_PER_DAY / 2) - halfDaylightMinutes,
            sunsetMinute: (MINUTES_PER_DAY / 2) + halfDaylightMinutes,
            daylightHours
        };
    }

    function daylightState(day, minuteOfDay) {
        const times = daylightTimes(day);
        const dawnStart = times.sunriseMinute - TWILIGHT_MINUTES;
        const duskEnd = times.sunsetMinute + TWILIGHT_MINUTES;
        let lightLevel = 0;
        let phase = "night";

        if (minuteOfDay >= dawnStart && minuteOfDay < times.sunriseMinute) {
            lightLevel = smoothstep((minuteOfDay - dawnStart) / TWILIGHT_MINUTES);
            phase = "dawn";
        } else if (minuteOfDay >= times.sunriseMinute && minuteOfDay <= times.sunsetMinute) {
            lightLevel = 1;
            phase = "day";
        } else if (minuteOfDay > times.sunsetMinute && minuteOfDay <= duskEnd) {
            lightLevel = 1 - smoothstep((minuteOfDay - times.sunsetMinute) / TWILIGHT_MINUTES);
            phase = "dusk";
        }

        return {
            ...times,
            lightLevel,
            phase,
            season: seasonForDay(day)
        };
    }

    function formatMinute(minute) {
        const rounded = Math.round(minute);
        const normalised = ((rounded % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        const hour = Math.floor(normalised / 60);
        const minutes = normalised % 60;
        return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    function phaseIcon(phase) {
        if (phase === "day") return "☀";
        if (phase === "dawn" || phase === "dusk") return "◐";
        return "☾";
    }

    function parseDisplayedTime() {
        const label = timeSource.textContent?.trim() ?? "";
        const match = /^Day\s+(\d+)\s+(\d{1,2}):(\d{2})$/i.exec(label);
        if (!match) return undefined;
        const day = Number(match[1]);
        const hour = Number(match[2]);
        const minute = Number(match[3]);
        if (!Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
        return {
            day,
            minuteOfDay: hour * 60 + minute
        };
    }

    function refreshDaylight() {
        const displayedTime = parseDisplayedTime();
        if (!displayedTime) {
            overlay.style.background = "transparent";
            seasonLabel.textContent = "";
            return;
        }

        const state = daylightState(displayedTime.day, displayedTime.minuteOfDay);
        const darkness = MAX_NIGHT_OPACITY * (1 - state.lightLevel);
        const twilightWarmth = state.phase === "dawn" || state.phase === "dusk"
            ? Math.min(0.12, darkness * 0.22)
            : 0;

        if (twilightWarmth > 0) {
            overlay.style.background = `linear-gradient(180deg, rgba(96, 63, 68, ${twilightWarmth.toFixed(3)}), rgba(7, 16, 38, ${darkness.toFixed(3)}))`;
        } else {
            overlay.style.background = `rgba(7, 16, 38, ${darkness.toFixed(3)})`;
        }
        overlay.dataset.phase = state.phase;
        overlay.dataset.season = state.season.toLowerCase();

        seasonLabel.textContent = state.season;
        const desiredDayLabel = `${phaseIcon(state.phase)} Day ${displayedTime.day}`;
        if (dayLabel && dayLabel.textContent !== desiredDayLabel) dayLabel.textContent = desiredDayLabel;
        if (timeCard) {
            timeCard.title = `${state.season} · Sunrise ${formatMinute(state.sunriseMinute)} · Sunset ${formatMinute(state.sunsetMinute)} · ${state.daylightHours.toFixed(1)} hours daylight`;
        }
    }

    const timeObserver = new MutationObserver(refreshDaylight);
    timeObserver.observe(timeSource, { childList: true, characterData: true, subtree: true });
    if (dayLabel) {
        const dayLabelObserver = new MutationObserver(refreshDaylight);
        dayLabelObserver.observe(dayLabel, { childList: true, characterData: true, subtree: true });
    }
    refreshDaylight();

    window.VillageDaylight = Object.freeze({
        latitudeDegrees: NORTHERN_LATITUDE_DEGREES,
        daysPerYear: DAYS_PER_YEAR,
        startDayOfYear: VILLAGE_START_DAY_OF_YEAR,
        twilightMinutes: TWILIGHT_MINUTES,
        dayOfYear,
        seasonForDay,
        daylightTimes,
        daylightState,
        refresh: refreshDaylight
    });
})();
