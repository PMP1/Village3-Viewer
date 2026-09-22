// Renderer-only edge descriptions. Coordinates are physical boundary bases, not
// occupied tiles. No world lookup, navigation mutation, or building-id routing.
(function () {
    function horizontal(side) { return side === "north" || side === "south"; }

    function rawRun(layer, side, origin, length, doors = []) {
        const orientation = horizontal(side) ? "horizontal" : "vertical";
        const segments = [];
        for (let offset = 0; offset < length; offset++) {
            const door = doors.find(candidate => offset >= candidate.offset && offset < candidate.offset + 1);
            segments.push({
                layer, side, orientation,
                x: origin.x + (horizontal(side) ? offset : 0),
                y: origin.y + (horizontal(side) ? 0 : offset),
                length: Math.min(1, length - offset),
                ...(door ? { doorState: door.state, doorId: door.id } : {})
            });
        }
        return segments;
    }

    function classifyRun(segments) {
        return segments.map((segment, index) => {
            if (segment.doorId !== undefined || segment.doorState !== undefined) {
                const state = segment.doorState;
                const role = ["open", "closed", "locked"].includes(state) ? "door-" + state : "doorway";
                return { ...segment, role };
            }
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

    function screenRearHorizontalSide(projectOverride) {
        return screenNearHorizontalSide(projectOverride) === "south" ? "north" : "south";
    }

    // Convert a horizontal wall run into architectural modules. Input geometry
    // remains one metre per segment and doors remain exactly one metre.
    function groupHorizontalRun(segments) {
        const grouped = [];
        let index = 0;
        while (index < segments.length) {
            const segment = segments[index];
            if (segment.doorId !== undefined || segment.doorState !== undefined) {
                grouped.push(classifyRun([segment])[0]);
                index += 1;
                continue;
            }

            const start = index;
            while (index < segments.length &&
                segments[index].doorId === undefined && segments[index].doorState === undefined) index += 1;
            const solidLength = index - start;
            const bayCount = Math.floor(solidLength / 2);
            for (let bay = 0; bay < bayCount; bay++) {
                const first = segments[start + bay * 2];
                grouped.push({ ...first, length: 2, role: "wall-bay-2" });
            }
            if (solidLength % 2 === 1) {
                const filler = segments[index - 1];
                grouped.push({
                    ...filler,
                    role: "wall-filler-1",
                    // Pair from left to right. A lone span immediately after a
                    // doorway needs its post on the left; every other remainder
                    // closes the run with a post on the right.
                    variant: solidLength === 1 && start > 0 ? "left" : "right"
                });
            }
        }
        return grouped;
    }

    function extractExterior(footprint, projectOverride) {
        const { origin, width, height } = footprint;
        const doors = side => (footprint.doors ?? []).filter(door => door.side === side);
        const rear = screenRearHorizontalSide(projectOverride);
        const near = screenNearHorizontalSide(projectOverride);
        const horizontalRun = (side, runOrigin) => {
            const raw = rawRun("exterior", side, runOrigin, width, doors(side));
            const grouped = side === rear || side === near ? groupHorizontalRun(raw) : classifyRun(raw);
            const face = side === rear ? "rear" : "front";
            return grouped.map((segment, index) => ({
                ...segment,
                face,
                ...(face === "front" && segment.role === "wall-bay-2"
                    ? { variant: index % 2 === 0 ? "window" : "plain" }
                    : {})
            }));
        };
        const sideRun = (side, runOrigin) => {
            const run = classifyRun(rawRun("exterior", side, runOrigin, height, doors(side)));
            const joinIndex = rear === "north" ? 0 : run.length - 1;
            return run.map((segment, index) => index === joinIndex
                ? { ...segment, rearJoinAt: rear === "north" ? "start" : "end" }
                : segment);
        };
        return [
            ...horizontalRun("north", origin),
            ...horizontalRun("south", { x: origin.x, y: origin.y + height }),
            ...sideRun("west", origin),
            ...sideRun("east", { x: origin.x + width, y: origin.y })
        ];
    }

    function extractInterior(footprint) {
        return (footprint.partitions ?? []).flatMap(partition => {
            const raw = rawRun(
                "interior", partition.side,
                {
                    x: partition.origin.x + (partition.side === "east" ? 1 : 0),
                    y: partition.origin.y + (partition.side === "south" ? 1 : 0)
                },
                partition.length, partition.doors
            );
            return horizontal(partition.side) ? groupHorizontalRun(raw) : classifyRun(raw);
        });
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
        if (segment.role === "wall-bay-2") {
            suffix = segment.layer === "interior"
                ? "wall.horizontal2.plain"
                : segment.face === "front"
                    ? "front.wall2." + (segment.variant ?? "plain")
                    : "back.wall2.plain";
        } else if (segment.role === "wall-filler-1") {
            suffix = segment.layer === "interior"
                ? "wall.horizontal1." + segment.variant
                : segment.face === "front"
                    ? "front.wall1." + segment.variant
                    : "back.wall1." + segment.variant;
        } else if (sideWall) suffix = sideWall;
        else if (segment.role === "end") suffix = "wall.end." + segment.variant;
        else if (segment.role === "doorway") {
            suffix = segment.layer === "exterior" && segment.face === "front"
                ? "front.doorway.horizontal"
                : "doorway." + segment.orientation;
        } else if (segment.role.startsWith("door-")) {
            suffix = segment.layer === "exterior" && segment.face === "front"
                ? "front.door." + segment.role.slice(5) + ".horizontal"
                : "door." + segment.role.slice(5) + "." + segment.orientation;
        } else suffix = "wall." + segment.orientation;
        return prefix + suffix;
    }

    function painterOrder(segments, projectOverride) {
        const project = activeProjection(projectOverride);
        const paintBase = segment => segment.rearJoinAt === "end"
            ? { x: segment.x, y: segment.y + (segment.length ?? 1) }
            : segment;
        // Side walls sort before a rear bay at the same base depth, so they tuck
        // behind the bay's end post instead of covering it.
        return [...segments].sort((a, b) => {
            const yOrder = project ? project(paintBase(a)).y - project(paintBase(b)).y : a.y - b.y;
            return yOrder ||
                Number(a.orientation === "horizontal") - Number(b.orientation === "horizontal") ||
                a.x - b.x;
        });
    }

    window.VillageBuildingWalls = Object.freeze({
        extractExterior, extractInterior, classifyRun, groupHorizontalRun, spriteId, painterOrder
    });
})();
