// Renderer-only edge descriptions. Coordinates are physical boundary bases, not
// occupied tiles. No world lookup, navigation mutation, or building-id routing.
(function () {
    function horizontal(side) { return side === "north" || side === "south"; }

    function extractRun(layer, side, origin, length, doors = [], corners = {}) {
        const orientation = horizontal(side) ? "horizontal" : "vertical";
        const segments = [];
        for (let offset = 0; offset < length; offset++) {
            const door = doors.find(candidate => offset >= candidate.offset && offset < candidate.offset + 1);
            segments.push({
                layer, side, orientation,
                x: origin.x + (horizontal(side) ? offset : 0),
                y: origin.y + (horizontal(side) ? 0 : offset),
                length: Math.min(1, length - offset),
                ...(door ? { doorState: door.state, doorId: door.id } : {}),
                ...(corners[offset] ? { corner: corners[offset] } : {})
            });
        }
        return classifyRun(segments);
    }

    function classifyRun(segments) {
        return segments.map((segment, index) => {
            if (segment.doorId !== undefined || segment.doorState !== undefined) {
                const state = segment.doorState;
                const role = ["open", "closed", "locked"].includes(state) ? "door-" + state : "doorway";
                return { ...segment, role };
            }
            if (segment.corner) return { ...segment, role: "corner", variant: segment.corner };
            const continuing = neighbour => neighbour && neighbour.doorId === undefined && neighbour.doorState === undefined;
            const before = continuing(segments[index - 1]);
            const after = continuing(segments[index + 1]);
            if (before && after) return { ...segment, role: "straight" };
            return {
                ...segment, role: "end", isolated: !before && !after,
                variant: segment.orientation === "horizontal"
                    ? (before ? "east" : "west")
                    : (before ? "south" : "north")
            };
        });
    }

    function extractExterior(footprint) {
        const { origin, width, height } = footprint;
        const doors = side => (footprint.doors ?? []).filter(door => door.side === side);
        return [
            ...extractRun("exterior", "north", origin, width, doors("north"),
                { 0: "nw", [Math.ceil(width) - 1]: "ne" }),
            ...extractRun("exterior", "south", { x: origin.x, y: origin.y + height }, width, doors("south"),
                { 0: "sw", [Math.ceil(width) - 1]: "se" }),
            ...extractRun("exterior", "west", origin, height, doors("west")),
            ...extractRun("exterior", "east", { x: origin.x + width, y: origin.y }, height, doors("east"))
        ];
    }

    function extractInterior(footprint) {
        return (footprint.partitions ?? []).flatMap(partition => extractRun(
            "interior", partition.side,
            {
                x: partition.origin.x + (partition.side === "east" ? 1 : 0),
                y: partition.origin.y + (partition.side === "south" ? 1 : 0)
            },
            partition.length, partition.doors
        ));
    }

    function activeProjection(projectOverride) {
        if (projectOverride) return projectOverride;
        return typeof projection === "function" ? projection() : undefined;
    }

    function worldYMovesDownScreen(projectOverride) {
        const project = activeProjection(projectOverride);
        if (!project) return true;
        const origin = project({ x: 0, y: 0 });
        const positiveY = project({ x: 0, y: 1 });
        return positiveY.y >= origin.y;
    }

    function screenNearHorizontalSide(projectOverride) {
        return worldYMovesDownScreen(projectOverride) ? "south" : "north";
    }

    function projectedCornerVariant(variant, projectOverride) {
        if (!variant || worldYMovesDownScreen(projectOverride)) return variant;
        if (variant[0] === "n") return "s" + variant.slice(1);
        if (variant[0] === "s") return "n" + variant.slice(1);
        return variant;
    }

    function projectedSideWallSuffix(segment) {
        if (segment.orientation !== "vertical") return undefined;
        if (segment.side !== "west" && segment.side !== "east") return undefined;
        if (segment.role !== "straight" && segment.role !== "end") return undefined;
        return "wall.vertical." + segment.side;
    }

    function spriteId(segment, projectOverride) {
        const prefix = "building." + segment.layer + ".";
        let suffix;
        const sideWall = projectedSideWallSuffix(segment);
        if (segment.role === "corner") suffix = "wall.corner." + projectedCornerVariant(segment.variant, projectOverride);
        else if (sideWall) suffix = sideWall;
        else if (segment.role === "end") suffix = "wall.end." + segment.variant;
        else if (segment.role === "doorway") suffix = "doorway." + segment.orientation;
        else if (segment.role.startsWith("door-")) suffix = "door." + segment.role.slice(5) + "." + segment.orientation;
        else suffix = "wall." + segment.orientation;
        // The cutaway is a visual screen-front rule, not a simulation-cardinal rule.
        // Derive it from the active projector so a Y-up or Y-down camera cannot put
        // the low wall at the back of the building.
        const low = segment.layer === "exterior" &&
            segment.side === screenNearHorizontalSide(projectOverride) &&
            !segment.role.startsWith("door");
        return prefix + suffix + (low ? ".cutaway" : "");
    }

    function painterOrder(segments, projectOverride) {
        const project = activeProjection(projectOverride);
        // Paint smaller screen Y first (back/top), then larger screen Y (front/bottom).
        // Fall back to the current north-up world ordering in non-viewer test harnesses.
        return [...segments].sort((a, b) => {
            const yOrder = project ? project(a).y - project(b).y : a.y - b.y;
            return yOrder ||
                Number(a.orientation === "horizontal") - Number(b.orientation === "horizontal") ||
                a.x - b.x;
        });
    }

    window.VillageBuildingWalls = Object.freeze({
        extractExterior, extractInterior, classifyRun, spriteId, painterOrder
    });
})();
