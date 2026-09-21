"use strict";
(() => {
  // src/debug/SimulationDebugRecorder.ts
  var SIMULATION_DEBUG_SCHEMA_VERSION = 1;
  var MINUTES_PER_DAY = 24 * 60;
  var DEFAULT_SNAPSHOT_INTERVAL = 25;
  var SimulationDebugRecorder = class {
    constructor(options = {}) {
      this.snapshots = [];
      this.snapshotInterval = options.snapshotInterval ?? DEFAULT_SNAPSHOT_INTERVAL;
      if (!Number.isInteger(this.snapshotInterval) || this.snapshotInterval <= 0) {
        throw new Error("Debug snapshot interval must be a positive integer.");
      }
    }
    start(world2) {
      if (this.snapshots.length > 0) {
        throw new Error("Debug recorder has already been started.");
      }
      this.capture(world2);
    }
    afterTick(world2) {
      if (world2.time % this.snapshotInterval === 0) {
        this.capture(world2);
      }
    }
    finish(world2, events, description) {
      if (this.snapshots.length === 0) this.capture(world2);
      if (this.snapshots[this.snapshots.length - 1]?.tick !== world2.time) {
        this.capture(world2);
      }
      return {
        metadata: {
          schemaVersion: SIMULATION_DEBUG_SCHEMA_VERSION,
          title: description.title,
          scenario: description.scenario,
          duration: description.duration,
          sourceCommit: description.sourceCommit ?? null,
          packageVersion: description.packageVersion ?? null,
          seed: description.seed ?? null,
          config: {
            startMinuteOfDay: world2.startMinuteOfDay,
            snapshotInterval: this.snapshotInterval
          }
        },
        events: events.map((event) => this.clone(event)),
        snapshots: this.snapshots.map((snapshot) => this.clone(snapshot))
      };
    }
    capture(world2) {
      this.snapshots.push({
        schemaVersion: SIMULATION_DEBUG_SCHEMA_VERSION,
        tick: world2.time,
        time: this.time(world2),
        characters: world2.characters.map((character) => this.characterSnapshot(character, world2)),
        actionPoints: world2.getActionPoints().map((point) => ({
          id: point.id,
          position: { ...point.position },
          capacity: point.capacity,
          occupancyMode: point.occupancyMode,
          occupantIds: world2.characters.filter((character) => world2.resourceUsage.isClaimedBy(point.id, character.id)).map((character) => character.id)
        }))
      });
    }
    characterSnapshot(character, world2) {
      const room6 = world2.getRoomAtPosition(character.position);
      const intent = character.currentIntent;
      const action = character.currentAction;
      return {
        id: character.id,
        name: character.name,
        position: { ...character.position },
        ...room6 ? { roomId: room6.id, placeId: room6.placeId } : {},
        needs: {
          hunger: character.hunger,
          fullness: character.fullness,
          thirst: character.thirst,
          tiredness: character.tiredness,
          socialNeed: character.socialNeed,
          digestion: character.digestionSummary ?? null,
          digestionStacks: character.digestionStackCount
        },
        currentIntent: intent ? {
          id: intent.id,
          source: this.clone(intent.source),
          goal: this.goalSnapshot(intent.goal),
          priority: intent.priority
        } : null,
        currentPlan: character.currentPlan ? this.planSnapshot(character.currentPlan) : null,
        currentAction: action ? {
          id: action.id,
          type: action.type,
          startedAt: action.startedAt,
          expectedDuration: action.expectedDuration,
          expectedAt: action.expectedAt,
          tolerance: action.tolerance,
          expiresAt: action.expiresAt,
          status: action.status,
          interruptionPolicy: action.interruptionPolicy ?? null,
          completionDisposition: action.completionDisposition ?? null
        } : null,
        movementTarget: character.movementTarget ? { ...character.movementTarget } : null,
        socialInstruction: character.socialInstruction ? this.clone(character.socialInstruction) : null,
        inventory: character.physical.getAll().map((possession) => ({
          item: this.clone(possession.item),
          location: this.clone(possession.location)
        })),
        money: character.money,
        knowledgeRevision: character.knowledgeRevision,
        knowledge: character.knowledge.map((knowledge) => this.clone(knowledge)),
        occupiedActionPointIds: world2.getOccupiedActionPointIds(character.id)
      };
    }
    planSnapshot(plan) {
      return {
        planId: plan.definition?.id ?? null,
        planName: plan.definition?.name ?? null,
        planKind: plan.definition?.kind ?? "achievement",
        ...plan.goal ? { goal: this.goalSnapshot(plan.goal) } : {},
        satisfied: plan.satisfied,
        completed: plan.completed,
        failed: plan.failed,
        totalDuration: plan.totalDuration,
        totalCost: plan.totalCost,
        totalRisk: plan.totalRisk,
        ...plan.target ? { target: this.clone(plan.target) } : {},
        prerequisites: plan.prerequisites.map((prerequisite) => this.planSnapshot(prerequisite))
      };
    }
    goalSnapshot(goal) {
      return {
        type: goal.type,
        ...goal.parameters ? { parameters: this.clone(goal.parameters) } : {}
      };
    }
    time(world2) {
      const absoluteMinute = world2.startMinuteOfDay + world2.time;
      const day = Math.floor(absoluteMinute / MINUTES_PER_DAY) + 1;
      const minuteOfDay = absoluteMinute % MINUTES_PER_DAY;
      return {
        day,
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
        minuteOfDay
      };
    }
    clone(value) {
      return structuredClone(value);
    }
  };

  // src/logging/SimulationLog.ts
  var LEVEL_PRIORITY = {
    event: 0,
    decision: 1,
    debug: 2,
    trace: 3
  };
  var currentLevel = "event";
  var consoleOutputEnabled = true;
  var listeners = /* @__PURE__ */ new Set();
  function setSimulationConsoleOutputEnabled(enabled) {
    consoleOutputEnabled = enabled;
  }
  function subscribeSimulationLog(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function isSimulationLogEnabled(level) {
    return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[currentLevel];
  }
  function formatSimulationTimestamp(world2) {
    const absoluteMinute = world2.startMinuteOfDay + world2.time;
    const day = Math.floor(absoluteMinute / (24 * 60)) + 1;
    const minuteOfDay = absoluteMinute % (24 * 60);
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    return `[Day ${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} | tick ${world2.time}]`;
  }
  function logSimulation(world2, level, message, context = {}) {
    const entry = {
      tick: world2.time,
      level,
      message,
      ...context.actorIds?.length ? { actorIds: [...context.actorIds] } : {},
      ...context.entityIds?.length ? { entityIds: [...context.entityIds] } : {},
      ...context.type ? { type: context.type } : {}
    };
    for (const listener of listeners) {
      listener(entry);
    }
    if (!consoleOutputEnabled || !isSimulationLogEnabled(level)) return;
    console.log(`${formatSimulationTimestamp(world2)} ${message}`);
  }

  // src/activities/CommercialPlaceInspectionActivity.ts
  var DEFAULT_INSPECTION_PRIORITY = 5;
  var DEFAULT_NEARBY_INSPECTION_RANGE_METRES = 30;
  var CommercialPlaceInspectionActivity = class {
    constructor(priority = DEFAULT_INSPECTION_PRIORITY, nearbyRangeMetres = DEFAULT_NEARBY_INSPECTION_RANGE_METRES) {
      this.priority = priority;
      this.nearbyRangeMetres = nearbyRangeMetres;
      this.id = "inspect-nearby-commercial-place";
      this.name = "Inspect Nearby Business";
    }
    getIntents({ character }) {
      const candidate = character.memory.getByType("place-observed").map((memory) => {
        const placeId = memory.context?.knownPlaceId;
        const position = memory.context?.position;
        if (typeof placeId !== "string" || memory.context?.hasAdvertisedServiceOfferings !== true || typeof position?.x !== "number" || typeof position?.y !== "number") return void 0;
        const alreadyInspected = character.knowledge.some(
          (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === placeId && knowledge.polarity === "positive" && knowledge.context?.offering !== void 0
        );
        if (alreadyInspected) return void 0;
        const distance10 = Math.hypot(
          position.x - character.position.x,
          position.y - character.position.y
        );
        if (distance10 > this.nearbyRangeMetres) return void 0;
        return {
          placeId,
          position: { x: position.x, y: position.y },
          distance: distance10
        };
      }).filter(
        (entry) => entry !== void 0
      ).sort((first, second) => first.distance - second.distance)[0];
      if (!candidate) return [];
      return [{
        id: `${character.id}:activity:${this.id}:${candidate.placeId}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "atLocation",
          parameters: {
            subjectId: `inspect-commercial-place:${candidate.placeId}`,
            position: { ...candidate.position }
          }
        },
        priority: this.priority
      }];
    }
  };

  // src/characters/CharacterAppearance.ts
  var DEFAULT_CHARACTER_APPEARANCE = Object.freeze({
    bodyType: "male",
    hairStyle: "none",
    hairColor: "brown",
    lowerBody: "pants",
    lowerBodyColor: "charcoal",
    torso: "shirt",
    torsoColor: "cream",
    outerwear: "none",
    outerwearColor: "brown",
    footwear: "boots",
    footwearColor: "dark-brown"
  });
  var characterAppearances = /* @__PURE__ */ new WeakMap();
  function setCharacterAppearance(character, appearance) {
    characterAppearances.set(character, Object.freeze({
      ...DEFAULT_CHARACTER_APPEARANCE,
      ...appearance
    }));
  }
  function getCharacterAppearance(character) {
    return characterAppearances.get(character) ?? DEFAULT_CHARACTER_APPEARANCE;
  }

  // src/world/VillageLayout.ts
  var marketBoundary = [
    { x: 86, y: 94 },
    { x: 92, y: 87 },
    { x: 108, y: 87 },
    { x: 114, y: 94 },
    { x: 114, y: 106 },
    { x: 108, y: 113 },
    { x: 92, y: 113 },
    { x: 86, y: 106 }
  ];
  var cartPitches = [
    { id: "market-pitch-north-west", position: { x: 91, y: 93 }, width: 3, height: 5 },
    { id: "market-pitch-north-east", position: { x: 109, y: 93 }, width: 3, height: 5 },
    { id: "market-pitch-west", position: { x: 90, y: 104 }, width: 3, height: 5 },
    { id: "market-pitch-dave", position: { x: 110, y: 103 }, width: 3, height: 5 },
    { id: "market-pitch-south-west", position: { x: 94, y: 109 }, width: 3, height: 5 },
    { id: "market-pitch-south-east", position: { x: 106, y: 109 }, width: 3, height: 5 }
  ];
  var southernOpenFields = [
    {
      id: "south-field-west",
      kind: "field",
      label: "West Open Field",
      position: { x: 60, y: 191 },
      agriculture: { initialRotation: "winter-crop", stripOrientation: "north-south" },
      geometry: {
        type: "polygon",
        points: [
          { x: 38, y: 151 },
          { x: 59, y: 145 },
          { x: 82, y: 149 },
          { x: 86, y: 171 },
          { x: 83, y: 202 },
          { x: 76, y: 232 },
          { x: 51, y: 237 },
          { x: 36, y: 221 },
          { x: 33, y: 188 }
        ]
      }
    },
    {
      id: "south-field-middle",
      kind: "field",
      label: "Middle Open Field",
      position: { x: 109, y: 194 },
      agriculture: { initialRotation: "spring-crop", stripOrientation: "north-south" },
      geometry: {
        type: "polygon",
        points: [
          { x: 91, y: 151 },
          { x: 111, y: 147 },
          { x: 128, y: 154 },
          { x: 131, y: 180 },
          { x: 128, y: 211 },
          { x: 120, y: 238 },
          { x: 101, y: 241 },
          { x: 90, y: 223 },
          { x: 87, y: 190 }
        ]
      }
    },
    {
      id: "south-field-east",
      kind: "field",
      label: "East Open Field",
      position: { x: 158, y: 191 },
      agriculture: { initialRotation: "fallow", stripOrientation: "north-south" },
      geometry: {
        type: "polygon",
        points: [
          { x: 136, y: 150 },
          { x: 159, y: 144 },
          { x: 180, y: 151 },
          { x: 185, y: 176 },
          { x: 182, y: 205 },
          { x: 172, y: 233 },
          { x: 147, y: 237 },
          { x: 134, y: 220 },
          { x: 132, y: 184 }
        ]
      }
    }
  ];
  var roads = [
    {
      id: "north-road",
      kind: "road",
      label: "North Forest Road",
      position: { x: 98, y: 65 },
      geometry: {
        type: "polyline",
        width: 4,
        points: [
          { x: 100, y: 87 },
          { x: 99, y: 78 },
          { x: 102, y: 68 },
          { x: 98, y: 58 },
          { x: 94, y: 48 },
          { x: 92, y: 38 }
        ]
      }
    },
    {
      id: "east-road",
      kind: "road",
      label: "East Road",
      position: { x: 132, y: 100 },
      geometry: {
        type: "polyline",
        width: 4,
        points: [
          { x: 114, y: 100 },
          { x: 125, y: 99 },
          { x: 136, y: 102 },
          { x: 150, y: 100 }
        ]
      }
    },
    {
      id: "south-road",
      kind: "road",
      label: "South Road",
      position: { x: 100, y: 132 },
      geometry: {
        type: "polyline",
        width: 4,
        points: [
          { x: 101, y: 113 },
          { x: 102, y: 124 },
          { x: 98, y: 136 },
          { x: 100, y: 150 }
        ]
      }
    },
    {
      id: "west-road",
      kind: "road",
      label: "West Road",
      position: { x: 68, y: 101 },
      geometry: {
        type: "polyline",
        width: 4,
        points: [
          { x: 86, y: 101 },
          { x: 75, y: 103 },
          { x: 64, y: 100 },
          { x: 50, y: 102 }
        ]
      }
    }
  ];
  var mapFeatures = [
    {
      id: "north-heavy-forest",
      kind: "forest",
      label: "Heavy Forest",
      position: { x: 98, y: 41 },
      geometry: {
        type: "polygon",
        points: [
          { x: 55, y: 24 },
          { x: 140, y: 24 },
          { x: 140, y: 55 },
          { x: 128, y: 59 },
          { x: 112, y: 58 },
          { x: 100, y: 61 },
          { x: 84, y: 58 },
          { x: 68, y: 61 },
          { x: 55, y: 56 }
        ]
      }
    },
    ...southernOpenFields,
    ...roads,
    {
      id: "village-market-square",
      kind: "market-square",
      label: "Village Green",
      position: { x: 100, y: 100 },
      geometry: { type: "polygon", points: marketBoundary }
    },
    ...cartPitches.map((pitch) => ({
      id: pitch.id,
      kind: "cart-pitch",
      label: pitch.id === "market-pitch-dave" ? "Dave's Cart Pitch" : "Market Cart Pitch",
      position: { ...pitch.position },
      geometry: {
        type: "centered-rectangle",
        width: pitch.width,
        height: pitch.height
      }
    }))
  ];
  var defaultVillageLayout = {
    centre: { x: 100, y: 100 },
    fountainPosition: { x: 100, y: 100 },
    startingPositions: {
      alice: { x: 62, y: 101 },
      bob: { x: 64, y: 101 },
      charlie: { x: 80, y: 103 }
    },
    homes: {
      bob: { position: { x: 78, y: 78 }, frontDoorSide: "east" },
      charlie: { position: { x: 77, y: 122 }, frontDoorSide: "north" },
      dave: { position: { x: 124, y: 121 }, frontDoorSide: "north" },
      george: { position: { x: 132, y: 82 }, frontDoorSide: "south" },
      helen: { position: { x: 88, y: 122 }, frontDoorSide: "north" },
      isaac: { position: { x: 54, y: 132 }, frontDoorSide: "east" }
    },
    tavern: {
      position: { x: 103, y: 81 },
      frontDoorSide: "south",
      barProviderPosition: { x: 103, y: 84 },
      barCustomerPosition: { x: 103, y: 85 },
      seatPositions: [
        { x: 101, y: 82 },
        { x: 105, y: 82 },
        { x: 101, y: 84 }
      ]
    },
    daveCartPosition: { x: 110, y: 103 },
    daveSellingPosition: { x: 112, y: 103 },
    bakerySite: {
      position: { x: 80, y: 96 },
      frontDoorSide: "east",
      shopProviderPosition: { x: 82, y: 96 },
      shopCustomerPosition: { x: 83, y: 96 },
      workPosition: { x: 78, y: 94 },
      livingPosition: { x: 78, y: 98 }
    },
    millSite: {
      position: { x: 68, y: 78 },
      frontDoorSide: "east",
      serviceProviderPosition: { x: 69, y: 76 },
      serviceCustomerPosition: { x: 70, y: 76 },
      workPosition: { x: 66, y: 78 }
    },
    merchantWarehouseSite: {
      position: { x: 126, y: 94 },
      frontDoorSide: "east",
      serviceProviderPosition: { x: 128, y: 94 },
      serviceCustomerPosition: { x: 129, y: 94 },
      storagePosition: { x: 124, y: 94 }
    },
    butcherSite: {
      position: { x: 121, y: 104 },
      frontDoorSide: "east",
      shopProviderPosition: { x: 123, y: 104 },
      shopCustomerPosition: { x: 124, y: 104 },
      workPosition: { x: 119, y: 102 },
      livingPosition: { x: 119, y: 106 }
    },
    hookcrestHabitats: [
      { id: "west-field-hookcrest-habitat", position: { x: 79, y: 146 } },
      { id: "east-field-hookcrest-habitat", position: { x: 133, y: 146 } }
    ],
    cartPitches,
    mapFeatures
  };

  // src/agriculture/CropCatalog.ts
  var MINUTES_PER_DAY2 = 24 * 60;
  var DEFAULT_CROP_DEFINITIONS = [
    {
      kind: "wheat",
      preferredRotation: "winter-crop",
      growthMinutes: 65 * MINUTES_PER_DAY2,
      seedItemType: "wheat-seed",
      harvestedItemType: "wheat-grain",
      yieldPerTile: 1
    },
    {
      kind: "rye",
      preferredRotation: "winter-crop",
      growthMinutes: 60 * MINUTES_PER_DAY2,
      seedItemType: "rye-seed",
      harvestedItemType: "rye-grain",
      yieldPerTile: 1
    },
    {
      kind: "barley",
      preferredRotation: "spring-crop",
      growthMinutes: 40 * MINUTES_PER_DAY2,
      seedItemType: "barley-seed",
      harvestedItemType: "barley-grain",
      yieldPerTile: 1
    },
    {
      kind: "oats",
      preferredRotation: "spring-crop",
      growthMinutes: 42 * MINUTES_PER_DAY2,
      seedItemType: "oat-seed",
      harvestedItemType: "oat-grain",
      yieldPerTile: 1
    },
    {
      kind: "peas",
      preferredRotation: "spring-crop",
      growthMinutes: 35 * MINUTES_PER_DAY2,
      seedItemType: "pea-seed",
      harvestedItemType: "peas",
      harvestedFoodKind: "vegetable",
      yieldPerTile: 1
    },
    {
      kind: "beans",
      preferredRotation: "spring-crop",
      growthMinutes: 38 * MINUTES_PER_DAY2,
      seedItemType: "bean-seed",
      harvestedItemType: "beans",
      harvestedFoodKind: "vegetable",
      yieldPerTile: 1
    },
    {
      kind: "carrot",
      preferredRotation: "spring-crop",
      growthMinutes: 32 * MINUTES_PER_DAY2,
      seedItemType: "carrot-seed",
      harvestedItemType: "carrot",
      harvestedFoodKind: "vegetable",
      yieldPerTile: 1
    }
  ];
  function defaultCropDefinition(kind) {
    const definition = DEFAULT_CROP_DEFINITIONS.find((candidate) => candidate.kind === kind);
    if (!definition) throw new Error(`No default crop definition exists for ${kind}.`);
    return definition;
  }

  // src/scenarios/DefaultAgriculturalYear.ts
  var MINUTES_PER_DAY3 = 24 * 60;
  var DEFAULT_AGRICULTURAL_START_SEASON = "autumn";
  var WINTER_CROP_SEQUENCE = ["wheat", "rye"];
  var SPRING_CROP_SEQUENCE = ["barley", "oats", "peas", "beans", "carrot"];
  function plannedCropForStrip(rotation, stripIndex) {
    const sequence = rotation === "winter-crop" ? WINTER_CROP_SEQUENCE : SPRING_CROP_SEQUENCE;
    return sequence[(stripIndex % sequence.length + sequence.length) % sequence.length];
  }
  function configureDefaultAgriculturalYear(world2, fieldIds) {
    const fields = fieldIds.map((fieldId) => world2.agriculture.getField(fieldId)).filter((field) => field !== void 0);
    if (fields.length !== 3) {
      throw new Error("Default agricultural year requires the three registered open fields.");
    }
    const winterField = fields.find((field) => field.rotation === "winter-crop");
    const springField = fields.find((field) => field.rotation === "spring-crop");
    const fallowField = fields.find((field) => field.rotation === "fallow");
    if (!winterField || !springField || !fallowField) {
      throw new Error("Default agricultural year requires winter, spring and fallow rotations.");
    }
    for (const strip of world2.agriculture.getStripsForField(winterField.id)) {
      if (strip.index % 4 !== 0) continue;
      for (const tile of world2.agriculture.tilesForStrip(strip.id)) {
        if (world2.agriculture.canPloughTile(tile.x, tile.y)) {
          world2.agriculture.ploughTile(tile.x, tile.y, world2.time - MINUTES_PER_DAY3);
        }
      }
    }
    for (const strip of world2.agriculture.getStripsForField(springField.id)) {
      const crop = plannedCropForStrip("spring-crop", strip.index);
      const definition = defaultCropDefinition(crop);
      const ripe = strip.index % 3 !== 2;
      const plantedAt = ripe ? world2.time - definition.growthMinutes - MINUTES_PER_DAY3 : world2.time - Math.floor(definition.growthMinutes * 0.9);
      const growth = Math.min(1, Math.max(0, (world2.time - plantedAt) / definition.growthMinutes));
      const state2 = growth >= 1 ? "ripe" : "growing";
      for (const tile of world2.agriculture.tilesForStrip(strip.id)) {
        tile.state = state2;
        tile.crop = crop;
        tile.growth = growth;
        tile.weedLevel = 0.15;
        tile.plantedAt = plantedAt;
        tile.lastWorkedAt = world2.time - 5 * MINUTES_PER_DAY3;
      }
    }
    return {
      startSeason: DEFAULT_AGRICULTURAL_START_SEASON,
      winterFieldId: winterField.id,
      springFieldId: springField.id,
      fallowFieldId: fallowField.id
    };
  }

  // src/memory/RoomResourceMemory.ts
  function getRememberedRoomLiquidResource(character, resourceId) {
    const memory = character.memory.getByType("room-resource-observed").filter((candidate) => candidate.subjectId === resourceId).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
    if (!memory) return void 0;
    const roomId = memory.context?.roomId;
    const liquidType = memory.context?.liquidType;
    const amount = memory.context?.amount;
    const capacity = memory.context?.capacity;
    if (typeof roomId !== "string" || typeof liquidType !== "string" || typeof amount !== "number" || !Number.isFinite(amount) || typeof capacity !== "number" || !Number.isFinite(capacity)) return void 0;
    return {
      id: resourceId,
      roomId,
      liquidType,
      amount,
      capacity,
      observedAt: memory.lastObservedAt
    };
  }
  function rememberRoomLiquidResource(character, resource, time) {
    const existing = character.memory.getByType("room-resource-observed").find((memory) => memory.subjectId === resource.id);
    character.memory.remember({
      id: `${character.id}:room-resource:${resource.id}`,
      type: "room-resource-observed",
      subjectId: resource.id,
      persistence: 10080,
      confidence: 1,
      createdAt: existing?.createdAt ?? time,
      lastObservedAt: time,
      importance: 0.8,
      context: {
        roomId: resource.roomId,
        resourceType: "liquid",
        liquidType: resource.liquidType,
        amount: resource.amount,
        capacity: resource.capacity
      }
    });
  }

  // src/physical/LiquidContainer.ts
  function isLiquidContainerItem(item) {
    return item.liquidContainer !== void 0 && item.liquidContainer.capacity > 0;
  }
  function isCarriedPossession(possession) {
    return possession.location.type === "hand" || possession.location.type === "equipped";
  }
  function getLiquidAmount(item, liquidType) {
    const contents = item.liquidContainer?.contents;
    return contents?.type === liquidType ? contents.amount : 0;
  }
  function totalCarriedLiquid(possessions, liquidType) {
    return possessions.filter(isCarriedPossession).reduce((total, possession) => total + getLiquidAmount(possession.item, liquidType), 0);
  }
  function totalLiquidCapacity(possessions, liquidType) {
    return possessions.reduce((total, possession) => {
      const container = possession.item.liquidContainer;
      if (!container) return total;
      if (container.contents && container.contents.type !== liquidType) return total;
      return total + container.capacity;
    }, 0);
  }
  function totalCarriedLiquidCapacity(possessions, liquidType) {
    return totalLiquidCapacity(possessions.filter(isCarriedPossession), liquidType);
  }
  function findContainerWithLiquid(possessions, liquidType, minimumAmount = 1) {
    return possessions.map((possession) => possession.item).find((item) => getLiquidAmount(item, liquidType) >= minimumAmount);
  }
  function findCarriedContainerWithLiquid(possessions, liquidType, minimumAmount = 1) {
    return findContainerWithLiquid(possessions.filter(isCarriedPossession), liquidType, minimumAmount);
  }
  function findFillableLiquidContainer(possessions, liquidType) {
    return possessions.map((possession) => possession.item).find((item) => {
      const container = item.liquidContainer;
      if (!container) return false;
      if (container.contents && container.contents.type !== liquidType) return false;
      return (container.contents?.amount ?? 0) < container.capacity;
    });
  }
  function findCarriedFillableLiquidContainer(possessions, liquidType) {
    return findFillableLiquidContainer(possessions.filter(isCarriedPossession), liquidType);
  }
  function fillLiquidContainer(item, liquidType) {
    const container = item.liquidContainer;
    if (!container) return 0;
    if (container.contents && container.contents.type !== liquidType) return 0;
    const previousAmount = container.contents?.amount ?? 0;
    if (previousAmount >= container.capacity) return 0;
    container.contents = {
      type: liquidType,
      amount: container.capacity
    };
    return container.capacity - previousAmount;
  }
  function transferLiquid(source, target, liquidType, amount) {
    if (source.id === target.id || !Number.isFinite(amount) || amount <= 0) return 0;
    const sourceContainer = source.liquidContainer;
    const targetContainer = target.liquidContainer;
    const sourceContents = sourceContainer?.contents;
    if (!sourceContainer || !targetContainer || !sourceContents || sourceContents.type !== liquidType) return 0;
    if (targetContainer.contents && targetContainer.contents.type !== liquidType) return 0;
    const targetAmount = targetContainer.contents?.amount ?? 0;
    const capacityRemaining = Math.max(0, targetContainer.capacity - targetAmount);
    const transferred = Math.min(amount, sourceContents.amount, capacityRemaining);
    if (transferred <= 0) return 0;
    sourceContents.amount -= transferred;
    if (sourceContents.amount <= 0) sourceContainer.contents = void 0;
    targetContainer.contents = {
      type: liquidType,
      amount: targetAmount + transferred
    };
    return transferred;
  }
  function consumeLiquid(item, liquidType, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const container = item.liquidContainer;
    const contents = container?.contents;
    if (!container || !contents || contents.type !== liquidType || contents.amount <= 0) return 0;
    const consumed = Math.min(amount, contents.amount);
    contents.amount -= consumed;
    if (contents.amount <= 0) {
      container.contents = void 0;
    }
    return consumed;
  }

  // src/activities/PersonalWaterReserveActivity.ts
  var WATER_TYPE = "water";
  var PersonalWaterReserveActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Refill Personal Water Reserve";
    }
    getIntents({ character }) {
      const portable = character.physical.get(this.options.portableItemId);
      if (!portable?.item.liquidContainer || !isCarriedPossession(portable)) return [];
      const carriedAmount = getLiquidAmount(portable.item, WATER_TYPE);
      if (carriedAmount >= this.options.targetAmount) return [];
      const rememberedSource = getRememberedRoomLiquidResource(
        character,
        this.options.sourceRoomResourceId
      );
      if (rememberedSource && (rememberedSource.roomId !== this.options.roomId || rememberedSource.liquidType !== WATER_TYPE || rememberedSource.amount <= 0)) return [];
      const urgent = character.thirst >= 70 && carriedAmount < 1;
      return [{
        id: `${character.id}:activity:${this.id}:refill`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "refillPersonalWaterReserve",
          parameters: {
            sourceRoomResourceId: this.options.sourceRoomResourceId,
            roomId: this.options.roomId,
            roomPosition: { ...this.options.roomPosition },
            portableItemId: this.options.portableItemId,
            targetAmount: this.options.targetAmount
          }
        },
        priority: urgent ? this.options.urgentPriority ?? 80 : this.options.priority ?? 50
      }];
    }
  };

  // src/needs/NeedForecast.ts
  var URGENT_THRESHOLD = 70;
  var NeedForecaster = class {
    forecast(character, need, minutesAhead) {
      if (!Number.isFinite(minutesAhead) || minutesAhead < 0) {
        throw new Error("Need forecast minutesAhead must be a non-negative number.");
      }
      const currentValue = this.currentValue(character, need);
      const rate = this.ratePerMinute(character, need);
      const projectedValue = Math.min(100, currentValue + rate * minutesAhead);
      return {
        need,
        currentValue,
        projectedValue,
        urgentThreshold: URGENT_THRESHOLD,
        becomesUrgent: projectedValue >= URGENT_THRESHOLD
      };
    }
    currentValue(character, need) {
      switch (need) {
        case "eat":
          return character.hunger;
        case "drink":
          return character.thirst;
        case "sleep":
          return character.tiredness;
      }
    }
    ratePerMinute(character, need) {
      switch (need) {
        case "eat":
          return character.hungerRatePerMinute;
        case "drink":
          return character.thirstRatePerMinute;
        case "sleep":
          return character.tirednessRatePerMinute;
      }
    }
  };

  // src/physical/Item.ts
  var BREAD_PORTION_DISH_ID = "bread-portion";
  var BREAD_AND_DRIED_MEAT_DISH_ID = "bread-and-dried-meat";
  var FOOD_KINDS = [
    "bread",
    "fruit",
    "vegetable",
    "meat",
    "dried-meat",
    "prepared-meal",
    // Compatibility with the current generic cart stock. New concrete food should
    // prefer one of the explicit kinds above; this can disappear when Dave's stock
    // is migrated to a real food source.
    "portable"
  ];
  function isFoodKind(value) {
    return typeof value === "string" && FOOD_KINDS.includes(value);
  }
  var ITEM_STORAGE_VOLUME = {
    small: 1,
    medium: 3,
    large: 6
  };
  function getItemStorageVolume(item) {
    if (item.food?.kind === "bread" && item.food.dishId !== BREAD_PORTION_DISH_ID) return ITEM_STORAGE_VOLUME.medium;
    return ITEM_STORAGE_VOLUME[item.size];
  }
  var LEGACY_DIRECTLY_EDIBLE_KINDS = /* @__PURE__ */ new Set([
    "bread",
    "prepared-meal",
    "portable"
  ]);
  var DEFAULT_FOOD_SERVINGS = {
    bread: 4
  };
  function getFoodServingTotal(item) {
    const state2 = item.food?.servings;
    if (state2 && Number.isInteger(state2.total) && state2.total > 0) return state2.total;
    if (!item.food) return 0;
    if (item.food.kind === "bread" && item.food.dishId === BREAD_PORTION_DISH_ID) return 1;
    return DEFAULT_FOOD_SERVINGS[item.food.kind] ?? 1;
  }
  function getFoodServingsRemaining(item) {
    const food = item.food;
    if (!food) return 0;
    const state2 = food.servings;
    if (!state2) return getFoodServingTotal(item);
    if (!Number.isInteger(state2.total) || state2.total <= 0 || !Number.isInteger(state2.remaining) || state2.remaining < 0 || state2.remaining > state2.total) return 0;
    return state2.remaining;
  }
  function isWholeBreadLoaf(item) {
    return item.food?.kind === "bread" && item.food.dishId !== BREAD_PORTION_DISH_ID && getFoodServingTotal(item) > 1 && getFoodServingsRemaining(item) > 0;
  }
  function isBreadAndDriedMeatPackedMeal(item) {
    return item.food?.kind === "prepared-meal" && item.food.dishId === BREAD_AND_DRIED_MEAT_DISH_ID;
  }
  function consumeFoodServing(item) {
    const food = item.food;
    if (!food) return 0;
    const current = getFoodServingsRemaining(item);
    if (current <= 0) return 0;
    const total = getFoodServingTotal(item);
    const remaining = current - 1;
    if (total > 1 || food.servings !== void 0) {
      food.servings = { total, remaining };
    }
    return remaining;
  }
  var LEGACY_FOOD_STOMACH_VOLUME = {
    bread: 35,
    fruit: 18,
    vegetable: 15,
    meat: 50,
    "dried-meat": 20,
    "prepared-meal": 55,
    portable: 30
  };
  function getDirectFoodHungerRelief(item) {
    if (getFoodServingsRemaining(item) <= 0) return void 0;
    const explicit = item.food?.directlyEdible?.hungerRelief;
    if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
      return explicit;
    }
    const legacy = item.food?.hungerRelief;
    if (item.food && LEGACY_DIRECTLY_EDIBLE_KINDS.has(item.food.kind) && typeof legacy === "number" && Number.isFinite(legacy) && legacy > 0) {
      return legacy;
    }
    return void 0;
  }
  function getDirectFoodHydrationRelief(item) {
    if (getDirectFoodHungerRelief(item) === void 0) return void 0;
    const hydration = item.food?.directlyEdible?.hydrationRelief;
    if (hydration === void 0) return 0;
    return typeof hydration === "number" && Number.isFinite(hydration) && hydration >= 0 ? hydration : void 0;
  }
  function getFoodStomachVolume(item) {
    const explicit = item.food?.stomachVolume;
    if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
      return explicit;
    }
    return item.food ? LEGACY_FOOD_STOMACH_VOLUME[item.food.kind] : void 0;
  }
  function isDirectlyEdibleFood(item) {
    return getDirectFoodHungerRelief(item) !== void 0;
  }

  // src/physical/ItemCategory.ts
  var ITEM_CATEGORIES = [
    "food",
    "vegetable",
    "fruit",
    "meat",
    "grain",
    "flour",
    "pulse"
  ];
  var TYPE_CATEGORIES = {
    grain: ["grain"],
    "wheat-grain": ["grain"],
    "rye-grain": ["grain"],
    "barley-grain": ["grain"],
    "oat-grain": ["grain"],
    flour: ["flour"],
    carrot: ["food", "vegetable"],
    peas: ["food", "vegetable", "pulse"],
    beans: ["food", "vegetable", "pulse"]
  };
  var FOOD_KIND_CATEGORIES = {
    bread: ["food"],
    fruit: ["food", "fruit"],
    vegetable: ["food", "vegetable"],
    meat: ["food", "meat"],
    "dried-meat": ["food", "meat"],
    "prepared-meal": ["food"],
    portable: ["food"]
  };
  function isItemCategory(value) {
    return typeof value === "string" && ITEM_CATEGORIES.includes(value);
  }
  function getItemCategories(item) {
    const categories = new Set(TYPE_CATEGORIES[item.type] ?? []);
    if (item.food) {
      for (const category of FOOD_KIND_CATEGORIES[item.food.kind]) categories.add(category);
    }
    return [...categories];
  }
  function itemMatchesCategory(item, category) {
    return getItemCategories(item).includes(category);
  }
  function itemMatchesSelector(item, selector2) {
    if (selector2.itemType === void 0 && selector2.itemCategory === void 0) return false;
    const legacyGenericFoodMatch = selector2.itemType === "food" && selector2.foodKind !== void 0 && item.food?.kind === selector2.foodKind;
    if (selector2.itemType !== void 0 && item.type !== selector2.itemType && !legacyGenericFoodMatch) return false;
    if (selector2.itemCategory !== void 0 && !itemMatchesCategory(item, selector2.itemCategory)) return false;
    return selector2.foodKind === void 0 || item.food?.kind === selector2.foodKind;
  }

  // src/world/ActionPoint.ts
  function createActionPoint(id, position, capacity = 1, occupancyMode = "use") {
    if (!id) throw new Error("Action point id is required.");
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("Action point capacity must be a positive integer.");
    }
    return {
      id,
      position: { ...position },
      capacity,
      occupancyMode
    };
  }
  function isAtActionPoint(position, actionPoint, tolerance = 0.1) {
    return Math.hypot(
      position.x - actionPoint.position.x,
      position.y - actionPoint.position.y
    ) <= tolerance;
  }

  // src/services/Service.ts
  var DEFAULT_ROOM_DAY_PRICE = 6;
  function serviceProviderActionPointId(servicePointId) {
    return `${servicePointId}:provider`;
  }
  function serviceCustomerActionPointId(servicePointId) {
    return `${servicePointId}:customer`;
  }
  function serviceProviderActionPoint(servicePointId, servicePoint) {
    return createActionPoint(
      serviceProviderActionPointId(servicePointId),
      servicePoint.providerPosition,
      1,
      "presence"
    );
  }
  function serviceCustomerActionPoint(servicePointId, servicePoint) {
    return createActionPoint(
      serviceCustomerActionPointId(servicePointId),
      servicePoint.customerPosition,
      1,
      "presence"
    );
  }
  function isServiceType(value) {
    return value === "food" || value === "drink" || value === "accommodation" || value === "milling" || value === "trade";
  }
  function isServiceOfferingType(value) {
    return value === "portable-food" || value === "prepared-meal" || value === "served-drink" || value === "room-day" || value === "grain-milling" || value === "grain";
  }
  function serviceContextMatches(actual, expected) {
    if (!expected) return true;
    if (!actual || actual.service !== expected.service) return false;
    if (expected.placeId !== void 0 && actual.placeId !== expected.placeId) return false;
    if (expected.offering !== void 0 && actual.offering !== expected.offering) return false;
    if (expected.itemType !== void 0 && actual.itemType !== expected.itemType && !(expected.itemType === "food" && actual.itemType === void 0 && actual.service === "food")) return false;
    if (expected.itemCategory !== void 0 && actual.itemCategory !== expected.itemCategory) return false;
    return expected.foodKind === void 0 || actual.foodKind === expected.foodKind;
  }
  function serviceContextEquals(first, second) {
    if (!first || !second) return first === second;
    return first.service === second.service && first.placeId === second.placeId && first.offering === second.offering && first.itemType === second.itemType && first.itemCategory === second.itemCategory && first.foodKind === second.foodKind;
  }

  // src/knowledge/KnowledgeQuery.ts
  var knowledgeTypes = [
    "service-place",
    "service-provider",
    "service-hours",
    "person-location",
    "person-identity",
    "water-source",
    "home-location"
  ];
  function knowledgeQueryParameters(query) {
    return {
      knowledgeType: query.type,
      subjectId: query.subjectId,
      ...query.context ? { knowledgeContext: { ...query.context } } : {}
    };
  }
  function knowledgeQueryFromParameters(parameters) {
    const type = parameters?.knowledgeType;
    const subjectId = parameters?.subjectId;
    if (typeof type !== "string" || typeof subjectId !== "string") return void 0;
    if (!knowledgeTypes.includes(type)) return void 0;
    const rawContext = parameters?.knowledgeContext;
    if (rawContext === void 0) {
      return { type, subjectId };
    }
    if (!rawContext || typeof rawContext !== "object") return void 0;
    const candidate = rawContext;
    if (!isServiceType(candidate.service)) return void 0;
    if (candidate.placeId !== void 0 && typeof candidate.placeId !== "string") return void 0;
    if (candidate.offering !== void 0 && !isServiceOfferingType(candidate.offering)) return void 0;
    if (candidate.itemType !== void 0 && (typeof candidate.itemType !== "string" || candidate.itemType.length === 0)) {
      return void 0;
    }
    if (candidate.itemCategory !== void 0 && !isItemCategory(candidate.itemCategory)) return void 0;
    if (candidate.foodKind !== void 0 && !isFoodKind(candidate.foodKind)) return void 0;
    return {
      type,
      subjectId,
      context: {
        service: candidate.service,
        ...candidate.placeId !== void 0 ? { placeId: candidate.placeId } : {},
        ...candidate.offering !== void 0 ? { offering: candidate.offering } : {},
        ...candidate.itemType !== void 0 ? { itemType: candidate.itemType } : {},
        ...isItemCategory(candidate.itemCategory) ? { itemCategory: candidate.itemCategory } : {},
        ...isFoodKind(candidate.foodKind) ? { foodKind: candidate.foodKind } : {}
      }
    };
  }

  // src/planning/PlanningTargets.ts
  var ACTIONABLE_ANONYMOUS_OBSERVATION_MAX_AGE_MINUTES = 15;
  function isPlanningPosition(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  }
  function getObservedPersonLocation(personId, context) {
    const memories = context.character.memory.getByType("person-observed").filter((memory) => memory.context?.identifiedPersonId === personId).sort((first, second) => second.lastObservedAt - first.lastObservedAt);
    for (const memory of memories) {
      const position = memory.context?.position;
      if (isPlanningPosition(position)) {
        return {
          position: { x: position.x, y: position.y },
          observedAt: memory.lastObservedAt
        };
      }
    }
    return void 0;
  }
  function getBestKnownPersonLocation(personId, context) {
    const observed = getObservedPersonLocation(personId, context);
    const knowledge = context.character.knowledge.find(
      (item) => item.type === "person-location" && item.subjectId === personId && item.polarity === "positive" && item.position !== void 0
    );
    if (observed && (!knowledge || observed.observedAt >= knowledge.learnedAt)) {
      return { ...observed.position };
    }
    return knowledge?.position ? { ...knowledge.position } : void 0;
  }
  function createKnownPersonTarget(personId, context) {
    const location = getBestKnownPersonLocation(personId, context);
    if (!location) return void 0;
    return {
      type: "person",
      personId,
      knowledge: "known",
      position: { ...location },
      distance: Math.hypot(
        location.x - context.character.position.x,
        location.y - context.character.position.y
      )
    };
  }
  function createObservedPersonTarget(memory, context) {
    if (context.time - memory.lastObservedAt > ACTIONABLE_ANONYMOUS_OBSERVATION_MAX_AGE_MINUTES) {
      return void 0;
    }
    const position = memory.context?.position;
    if (!isPlanningPosition(position)) return void 0;
    return {
      type: "person",
      observationId: memory.subjectId,
      knowledge: "observed",
      position: { x: position.x, y: position.y },
      distance: Math.hypot(
        position.x - context.character.position.x,
        position.y - context.character.position.y
      )
    };
  }
  function getKnowledgeLocationTargets(goal, context) {
    const query = knowledgeQueryFromParameters(goal.parameters);
    if (!query) return [];
    const matches = context.character.knowledge.filter(
      (knowledge) => knowledge.type === query.type && (query.subjectId === "*" || knowledge.subjectId === query.subjectId) && knowledge.polarity === "positive" && knowledge.position !== void 0 && serviceContextMatches(knowledge.context, query.context)
    ).sort((first, second) => second.learnedAt - first.learnedAt);
    const seenSubjects = /* @__PURE__ */ new Set();
    const targets = [];
    for (const knowledge of matches) {
      if (seenSubjects.has(knowledge.subjectId)) continue;
      seenSubjects.add(knowledge.subjectId);
      targets.push({
        type: "location",
        subjectId: knowledge.subjectId,
        position: { ...knowledge.position }
      });
    }
    return targets;
  }
  function getWaterSourceLocationTarget(context) {
    const targets = context.character.knowledge.filter(
      (knowledge) => knowledge.type === "water-source" && knowledge.polarity === "positive" && knowledge.position !== void 0
    ).map((knowledge) => ({
      type: "location",
      subjectId: knowledge.subjectId,
      position: { ...knowledge.position }
    }));
    if (targets.length === 0) return void 0;
    return targets.reduce((closest, target) => {
      const closestDistance = Math.hypot(
        closest.position.x - context.character.position.x,
        closest.position.y - context.character.position.y
      );
      const targetDistance = Math.hypot(
        target.position.x - context.character.position.x,
        target.position.y - context.character.position.y
      );
      return targetDistance < closestDistance ? target : closest;
    });
  }
  function getHomeLocationTarget(context) {
    const homeId = context.character.homeId;
    if (!homeId) return void 0;
    const knowledge = context.character.knowledge.find(
      (item) => item.type === "home-location" && item.subjectId === homeId && item.polarity === "positive" && item.position !== void 0
    );
    return knowledge?.position ? { type: "location", subjectId: homeId, position: { ...knowledge.position } } : void 0;
  }
  function getGoalLocationTarget(goal) {
    const position = goal.parameters?.position;
    if (!isPlanningPosition(position)) return void 0;
    const subjectId = typeof goal.parameters?.subjectId === "string" ? goal.parameters.subjectId : void 0;
    return {
      type: "location",
      subjectId,
      position: { x: position.x, y: position.y }
    };
  }
  function getKnownPersonGoalTarget(goal, context) {
    const personId = goal.parameters?.personId;
    return typeof personId === "string" ? createKnownPersonTarget(personId, context) : void 0;
  }
  function inheritFirstPlanTarget(prerequisiteTargets) {
    return prerequisiteTargets.find((target) => target !== void 0);
  }
  function inheritFirstLocationTarget(prerequisiteTargets) {
    return prerequisiteTargets.find(
      (target) => target?.type === "location"
    );
  }

  // src/activities/WaterPreparationActivity.ts
  var WATER_TYPE2 = "water";
  var URGENT_THIRST = 70;
  var CASUAL_CARRIED_DRINK_THRESHOLD = 40;
  var OPPORTUNISTIC_SOURCE_DRINK_THRESHOLD = 30;
  var FORECAST_HORIZON_MINUTES = 120;
  var MAX_EARLY_WATER_DETOUR_METRES = 12;
  var WaterPreparationActivity = class {
    constructor(id = "water-preparation", name = "Prepare For Thirst") {
      this.forecaster = new NeedForecaster();
      this.id = id;
      this.name = name;
    }
    getIntents({ character, time }) {
      if (character.thirst >= URGENT_THIRST) return [];
      const carriedWater = findCarriedContainerWithLiquid(
        character.physical.getAll(),
        WATER_TYPE2,
        1
      );
      const knownSource = getWaterSourceLocationTarget({ character, time });
      const sourceDistance = knownSource === void 0 ? void 0 : Math.hypot(
        knownSource.position.x - character.position.x,
        knownSource.position.y - character.position.y
      );
      const atKnownSource = sourceDistance !== void 0 && sourceDistance <= 0.1;
      const cheapForecastSolution = carriedWater !== void 0 || sourceDistance !== void 0 && sourceDistance <= MAX_EARLY_WATER_DETOUR_METRES;
      let priority;
      if (atKnownSource && character.thirst >= OPPORTUNISTIC_SOURCE_DRINK_THRESHOLD) {
        priority = 58;
      } else if (cheapForecastSolution && this.forecaster.forecast(character, "drink", FORECAST_HORIZON_MINUTES).becomesUrgent) {
        priority = 56;
      } else if (carriedWater && character.thirst >= CASUAL_CARRIED_DRINK_THRESHOLD) {
        priority = 40;
      }
      if (priority === void 0) return [];
      return [{
        id: `${character.id}:activity:${this.id}:drink`,
        source: { type: "activity", id: this.id },
        goal: { type: "drinkWater" },
        priority
      }];
    }
  };

  // src/activities/WorkplaceLiquidReserveActivity.ts
  var MINUTES_PER_DAY4 = 24 * 60;
  var WorkplaceLiquidReserveActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Refill Workplace Liquid Reserve";
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY4;
      if (!isActive(minuteOfDay, this.options.activeFrom, this.options.activeUntil)) return [];
      const bucket = character.physical.get(this.options.bucketItemId)?.item;
      if (!bucket?.liquidContainer) return [];
      const rememberedReserve = getRememberedRoomLiquidResource(character, this.options.reserveId);
      if (rememberedReserve && rememberedReserve.roomId === this.options.roomId && rememberedReserve.liquidType === this.options.liquidType && rememberedReserve.amount >= this.options.targetAmount) return [];
      const source = character.knowledge.filter(
        (knowledge) => knowledge.type === "water-source" && knowledge.subjectId === this.options.sourceId && knowledge.polarity === "positive" && knowledge.position !== void 0
      ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
      if (!source?.position) return [];
      return [{
        id: `${character.id}:activity:${this.id}:haul`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "refillWorkplaceLiquidReserve",
          parameters: {
            reserveId: this.options.reserveId,
            roomId: this.options.roomId,
            roomPosition: { ...this.options.roomPosition },
            bucketItemId: this.options.bucketItemId,
            sourceId: this.options.sourceId,
            sourcePosition: { ...source.position },
            liquidType: this.options.liquidType,
            targetAmount: this.options.targetAmount
          }
        },
        priority: this.options.priority ?? 55
      }];
    }
  };
  function isActive(minuteOfDay, start2, end) {
    if (start2 === end) return true;
    if (start2 < end) return minuteOfDay >= start2 && minuteOfDay < end;
    return minuteOfDay >= start2 || minuteOfDay < end;
  }

  // src/activities/StagedWorkplaceProductionActivity.ts
  var MINUTES_PER_DAY5 = 24 * 60;
  var StagedWorkplaceProductionActivity = class {
    constructor(options) {
      this.options = options;
      if (!options.inputItemType && !options.inputItemCategory) {
        throw new Error("Staged production requires an input item type or category.");
      }
      const hasSecondaryInput = options.secondaryInputItemType !== void 0 || options.secondaryInputItemCategory !== void 0 || options.secondaryInputFoodKind !== void 0 || options.secondaryInputCountPerBatch !== void 0;
      if (hasSecondaryInput) {
        if (!options.secondaryInputItemType && !options.secondaryInputItemCategory) {
          throw new Error("Staged production secondary input requires an item type or category.");
        }
        if (!Number.isInteger(options.secondaryInputCountPerBatch) || (options.secondaryInputCountPerBatch ?? 0) <= 0) {
          throw new Error("Staged production secondaryInputCountPerBatch must be a positive integer.");
        }
      }
      if (options.stages.length === 0) throw new Error("Staged production requires at least one stage.");
      if (!Number.isInteger(options.maxConcurrentBatches) || options.maxConcurrentBatches <= 0) {
        throw new Error("Staged production maxConcurrentBatches must be a positive integer.");
      }
      if (options.outputDishId !== void 0 && options.outputDishId.length === 0) {
        throw new Error("Staged production outputDishId cannot be empty when provided.");
      }
      if (options.outputHydrationRelief !== void 0 && (!Number.isFinite(options.outputHydrationRelief) || options.outputHydrationRelief < 0)) {
        throw new Error("Staged production outputHydrationRelief must be non-negative when provided.");
      }
      if (options.outputStomachVolume !== void 0 && (!Number.isFinite(options.outputStomachVolume) || options.outputStomachVolume <= 0)) {
        throw new Error("Staged production outputStomachVolume must be positive when provided.");
      }
      if (options.outputShelfLifeMinutes !== void 0 && (!Number.isFinite(options.outputShelfLifeMinutes) || options.outputShelfLifeMinutes <= 0)) {
        throw new Error("Staged production outputShelfLifeMinutes must be positive when provided.");
      }
      for (const stage of options.stages) {
        if (!Number.isFinite(stage.activeMinutes) || stage.activeMinutes <= 0) {
          throw new Error(`Production stage ${stage.id} activeMinutes must be positive.`);
        }
        if (!Number.isFinite(stage.passiveMinutesAfter) || stage.passiveMinutesAfter < 0) {
          throw new Error(`Production stage ${stage.id} passiveMinutesAfter must be non-negative.`);
        }
      }
      this.id = options.id;
      this.name = options.name ?? "Produce Workplace Stock";
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY5;
      if (!isActive2(minuteOfDay, this.options.activeFrom, this.options.activeUntil)) return [];
      const remainingWorkMinutes = minutesUntilEnd(
        minuteOfDay,
        this.options.activeFrom,
        this.options.activeUntil
      );
      const finishBy = time + remainingWorkMinutes;
      const possessions = character.physical.getAll();
      const outputStock = possessions.filter(
        (possession) => possession.location.type === "container" && possession.location.containerId === this.options.outputContainerId && possession.item.type === this.options.outputType && (this.options.outputFoodKind === void 0 || possession.item.food?.kind === this.options.outputFoodKind) && (this.options.outputDishId === void 0 || possession.item.food?.dishId === this.options.outputDishId)
      ).length;
      const workInProgress = possessions.filter(
        (possession) => possession.location.type === "container" && possession.location.containerId === this.options.outputContainerId && possession.item.productionWorkInProgress?.recipeId === this.options.recipeId
      ).sort(
        (first, second) => first.item.productionWorkInProgress.readyAt - second.item.productionWorkInProgress.readyAt
      );
      const ready = workInProgress.find(
        (possession) => possession.item.productionWorkInProgress.readyAt <= time
      );
      if (ready) {
        const state2 = ready.item.productionWorkInProgress;
        const stage = this.options.stages[state2.stageIndex];
        if (stage && time + stage.activeMinutes <= finishBy) {
          return [this.intent(character.id, "advance", finishBy, {
            jobItemId: ready.item.id,
            stageIndex: state2.stageIndex,
            stage
          }, (this.options.priority ?? 55) + 10)];
        }
      }
      const projectedStock = outputStock + workInProgress.length * this.options.outputCountPerBatch;
      if (projectedStock < this.options.targetStock && workInProgress.length < this.options.maxConcurrentBatches && remainingWorkMinutes >= minimumLeadTime(this.options.stages)) {
        const inputCount = possessions.filter(
          (possession) => itemMatchesSelector(possession.item, {
            ...this.options.inputItemType !== void 0 ? { itemType: this.options.inputItemType } : {},
            ...this.options.inputItemCategory !== void 0 ? { itemCategory: this.options.inputItemCategory } : {},
            ...this.options.inputFoodKind !== void 0 ? { foodKind: this.options.inputFoodKind } : {}
          })
        ).length;
        const secondaryInputCount = this.hasSecondaryInput() ? possessions.filter(
          (possession) => itemMatchesSelector(possession.item, {
            ...this.options.secondaryInputItemType !== void 0 ? { itemType: this.options.secondaryInputItemType } : {},
            ...this.options.secondaryInputItemCategory !== void 0 ? { itemCategory: this.options.secondaryInputItemCategory } : {},
            ...this.options.secondaryInputFoodKind !== void 0 ? { foodKind: this.options.secondaryInputFoodKind } : {}
          })
        ).length : 0;
        const rememberedLiquid = getRememberedRoomLiquidResource(
          character,
          this.options.liquidRoomResourceId
        );
        if (inputCount >= this.options.inputCountPerBatch && (!this.hasSecondaryInput() || secondaryInputCount >= this.options.secondaryInputCountPerBatch) && rememberedLiquid?.liquidType === this.options.liquidType && rememberedLiquid.amount >= this.options.liquidAmountPerBatch) {
          return [this.intent(character.id, "start", finishBy, {
            stageIndex: 0,
            stage: this.options.stages[0]
          }, (this.options.priority ?? 55) + 5)];
        }
      }
      const waiting = workInProgress[0];
      if (waiting) {
        const state2 = waiting.item.productionWorkInProgress;
        const stage = this.options.stages[state2.stageIndex];
        if (stage && state2.readyAt <= finishBy) {
          return [this.intent(character.id, "wait", finishBy, {
            jobItemId: waiting.item.id,
            stageIndex: state2.stageIndex,
            stage,
            readyAt: state2.readyAt
          }, this.options.waitingPriority ?? this.options.priority ?? 55)];
        }
      }
      return [];
    }
    hasSecondaryInput() {
      return this.options.secondaryInputItemType !== void 0 || this.options.secondaryInputItemCategory !== void 0;
    }
    intent(characterId, operation, finishBy, stageState, priority) {
      const suffix = stageState.jobItemId ?? `new-${stageState.stageIndex}`;
      return {
        id: `${characterId}:activity:${this.id}:${operation}:${suffix}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "manageStagedWorkplaceProduction",
          parameters: {
            operation,
            recipeId: this.options.recipeId,
            workActionPointId: this.options.workActionPointId,
            workPosition: { ...this.options.workPosition },
            outputContainerId: this.options.outputContainerId,
            outputType: this.options.outputType,
            ...this.options.outputFoodKind !== void 0 ? { outputFoodKind: this.options.outputFoodKind } : {},
            ...this.options.outputDishId !== void 0 ? { outputDishId: this.options.outputDishId } : {},
            ...this.options.outputHungerRelief !== void 0 ? { outputHungerRelief: this.options.outputHungerRelief } : {},
            ...this.options.outputHydrationRelief !== void 0 ? { outputHydrationRelief: this.options.outputHydrationRelief } : {},
            ...this.options.outputStomachVolume !== void 0 ? { outputStomachVolume: this.options.outputStomachVolume } : {},
            ...this.options.outputShelfLifeMinutes !== void 0 ? { outputShelfLifeMinutes: this.options.outputShelfLifeMinutes } : {},
            targetStock: this.options.targetStock,
            outputCountPerBatch: this.options.outputCountPerBatch,
            ...this.options.inputItemType !== void 0 ? { inputItemType: this.options.inputItemType } : {},
            ...this.options.inputItemCategory !== void 0 ? { inputItemCategory: this.options.inputItemCategory } : {},
            ...this.options.inputFoodKind !== void 0 ? { inputFoodKind: this.options.inputFoodKind } : {},
            inputCountPerBatch: this.options.inputCountPerBatch,
            ...this.options.secondaryInputItemType !== void 0 ? { secondaryInputItemType: this.options.secondaryInputItemType } : {},
            ...this.options.secondaryInputItemCategory !== void 0 ? { secondaryInputItemCategory: this.options.secondaryInputItemCategory } : {},
            ...this.options.secondaryInputFoodKind !== void 0 ? { secondaryInputFoodKind: this.options.secondaryInputFoodKind } : {},
            ...this.options.secondaryInputCountPerBatch !== void 0 ? { secondaryInputCountPerBatch: this.options.secondaryInputCountPerBatch } : {},
            liquidRoomResourceId: this.options.liquidRoomResourceId,
            liquidType: this.options.liquidType,
            liquidAmountPerBatch: this.options.liquidAmountPerBatch,
            stages: this.options.stages.map((stage) => ({ ...stage })),
            finishBy,
            stageIndex: stageState.stageIndex,
            stageId: stageState.stage.id,
            stageActiveMinutes: stageState.stage.activeMinutes,
            passiveMinutesAfter: stageState.stage.passiveMinutesAfter,
            ...stageState.jobItemId ? { jobItemId: stageState.jobItemId } : {},
            ...stageState.readyAt !== void 0 ? { readyAt: stageState.readyAt } : {}
          }
        },
        priority
      };
    }
  };
  function minimumLeadTime(stages) {
    return stages.reduce(
      (total, stage) => total + stage.activeMinutes + stage.passiveMinutesAfter,
      0
    );
  }
  function isActive2(minuteOfDay, start2, end) {
    if (start2 === end) return true;
    if (start2 < end) return minuteOfDay >= start2 && minuteOfDay < end;
    return minuteOfDay >= start2 || minuteOfDay < end;
  }
  function minutesUntilEnd(minuteOfDay, start2, end) {
    if (!isActive2(minuteOfDay, start2, end)) return 0;
    if (start2 === end) return MINUTES_PER_DAY5;
    if (start2 < end) return end - minuteOfDay;
    return minuteOfDay >= start2 ? MINUTES_PER_DAY5 - minuteOfDay + end : end - minuteOfDay;
  }

  // src/activities/DoorScheduleActivity.ts
  var MINUTES_PER_DAY6 = 24 * 60;
  var DEFAULT_RETRY_MINUTES = 5;
  var DEFAULT_DOOR_ROUTINE_PRIORITY = 75;
  var DoorScheduleActivity = class {
    constructor(options) {
      this.options = options;
      this.name = "Operate Door Schedule";
      this.id = options.id;
      for (const [name, value] of [
        ["opensAt", options.opensAt],
        ["closesAt", options.closesAt],
        ["startMinuteOfDay", options.startMinuteOfDay]
      ]) {
        if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY6) {
          throw new Error(`${name} must be an integer minute from 0 to 1439.`);
        }
      }
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY6;
      const desiredState = this.isOpenTime(minuteOfDay) ? "open" : "barred";
      const operation = character.memory.getByType("door-operation").find((memory) => memory.subjectId === this.options.doorId);
      const rememberedState = operation?.context?.state;
      const rememberedDesiredState = operation?.context?.desiredState;
      const retryAfter = operation?.context?.retryAfter;
      if (!operation && desiredState === this.options.initialState) return [];
      if (rememberedState === desiredState) return [];
      if (rememberedState === "deferred" && rememberedDesiredState === desiredState && typeof retryAfter === "number" && time < retryAfter) return [];
      return [{
        id: `${character.id}:activity:${this.id}:${desiredState}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "setDoorSecurity",
          parameters: {
            doorId: this.options.doorId,
            desiredState,
            position: { ...this.options.insidePosition },
            ...this.options.placeId ? { placeId: this.options.placeId } : {},
            ...desiredState === "barred" ? { reopenAt: this.nextOpeningTime(time, minuteOfDay) } : {},
            retryMinutes: DEFAULT_RETRY_MINUTES
          }
        },
        priority: this.options.priority ?? DEFAULT_DOOR_ROUTINE_PRIORITY
      }];
    }
    isOpenTime(minuteOfDay) {
      if (this.options.opensAt === this.options.closesAt) return true;
      if (this.options.opensAt < this.options.closesAt) {
        return minuteOfDay >= this.options.opensAt && minuteOfDay < this.options.closesAt;
      }
      return minuteOfDay >= this.options.opensAt || minuteOfDay < this.options.closesAt;
    }
    nextOpeningTime(time, minuteOfDay) {
      let untilOpening = (this.options.opensAt - minuteOfDay + MINUTES_PER_DAY6) % MINUTES_PER_DAY6;
      if (untilOpening === 0) untilOpening = MINUTES_PER_DAY6;
      return time + untilOpening;
    }
  };

  // src/activities/SellFoodActivity.ts
  var SellFoodActivity = class {
    constructor() {
      this.id = "sell-food";
      this.name = "Sell Food";
    }
    getIntents({ character, time }) {
      const requests = character.requests.getIncoming(time).filter((request2) => this.isFoodPurchase(request2)).filter((request2) => request2.status === "pending" || request2.status === "accepted").sort((first, second) => {
        if (first.status === "accepted" && second.status !== "accepted") return -1;
        if (second.status === "accepted" && first.status !== "accepted") return 1;
        return first.createdAt - second.createdAt;
      });
      const request = requests[0];
      if (!request) return [];
      return [{
        id: `${character.id}:activity:${this.id}:request:${request.id}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "servePurchaseRequest",
          parameters: { requestId: request.id }
        },
        // A pending customer is still worth serving outside work hours, but a
        // schedule can make that work substantially more important. Once Dave
        // accepts the request it becomes a strong commitment in its own right.
        priority: request.status === "accepted" ? 80 : 30
      }];
    }
    isFoodPurchase(request) {
      return request.type === "purchase" && (request.parameters?.itemType === "food" || isItemCategory(request.parameters?.itemCategory));
    }
  };

  // src/activities/ServicePointOperationActivity.ts
  var MINUTES_PER_DAY7 = 24 * 60;
  var DEFAULT_OPERATION_PRIORITY = 75;
  var DEFAULT_STAFFING_PRIORITY = 55;
  var ServicePointOperationActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Operate Service Point";
      for (const [name, value] of [
        ["opensAt", options.opensAt],
        ["closesAt", options.closesAt],
        ["startMinuteOfDay", options.startMinuteOfDay]
      ]) {
        if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY7) {
          throw new Error(`${name} must be an integer minute from 0 to 1439.`);
        }
      }
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY7;
      const operation = character.memory.getByType("service-point-operation").find((memory) => memory.subjectId === this.options.servicePointId);
      const soldOut = this.isSoldOutBlockingOpening(character, time, operation);
      const desiredState = this.isOpenTime(minuteOfDay) && !soldOut ? "open" : "closed";
      const rememberedState = operation?.context?.state;
      const intents = [];
      if (rememberedState !== desiredState && !(operation === void 0 && desiredState === this.options.initialState)) {
        intents.push({
          id: `${character.id}:activity:${this.id}:state:${desiredState}`,
          source: { type: "activity", id: this.id },
          goal: {
            type: "setServicePointState",
            parameters: {
              servicePointId: this.options.servicePointId,
              desiredState,
              position: { ...this.options.providerPosition }
            }
          },
          priority: this.options.operationPriority ?? DEFAULT_OPERATION_PRIORITY
        });
      }
      if (desiredState === "open" && (this.options.staffingMode ?? "continuous") === "continuous") {
        intents.push({
          id: `${character.id}:activity:${this.id}:staff`,
          source: { type: "activity", id: this.id },
          goal: {
            type: "atLocation",
            parameters: {
              subjectId: serviceProviderActionPointId(this.options.servicePointId),
              position: { ...this.options.providerPosition }
            }
          },
          priority: this.options.staffingPriority ?? DEFAULT_STAFFING_PRIORITY
        });
      }
      return intents;
    }
    isSoldOutBlockingOpening(character, time, operation) {
      const itemType = operation?.context?.soldOutItemType;
      const soldOutAt = operation?.context?.soldOutAt;
      if (typeof itemType !== "string" || typeof soldOutAt !== "number") return false;
      if (time < this.nextOpeningAfter(soldOutAt)) return true;
      return !character.physical.getAll().some((possession) => possession.item.type === itemType);
    }
    nextOpeningAfter(time) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY7;
      const delta = (this.options.opensAt - minuteOfDay + MINUTES_PER_DAY7) % MINUTES_PER_DAY7;
      return time + (delta === 0 ? MINUTES_PER_DAY7 : delta);
    }
    isOpenTime(minuteOfDay) {
      if (this.options.opensAt === this.options.closesAt) return true;
      if (this.options.opensAt < this.options.closesAt) {
        return minuteOfDay >= this.options.opensAt && minuteOfDay < this.options.closesAt;
      }
      return minuteOfDay >= this.options.opensAt || minuteOfDay < this.options.closesAt;
    }
  };

  // src/memory/MemoryStore.ts
  var MemoryStore = class {
    constructor() {
      this.memories = /* @__PURE__ */ new Map();
      this.lastDecayAt = /* @__PURE__ */ new Map();
    }
    remember(memory) {
      const key = `${memory.type}:${memory.subjectId}`;
      const existing = this.memories.get(key);
      if (!existing) {
        this.memories.set(key, memory);
        this.lastDecayAt.set(key, memory.lastObservedAt);
        return;
      }
      existing.confidence = Math.max(
        existing.confidence,
        memory.confidence
      );
      existing.lastObservedAt = memory.lastObservedAt;
      if (existing.context && memory.context) {
        Object.assign(existing.context, memory.context);
      }
    }
    getAll() {
      return Array.from(this.memories.values());
    }
    getByType(type) {
      return this.getAll().filter((memory) => memory.type === type);
    }
    decay(currentTime) {
      for (const [key, memory] of this.memories) {
        const lastDecay = this.lastDecayAt.get(key) ?? memory.createdAt;
        const elapsed = Math.max(
          0,
          currentTime - lastDecay
        );
        if (elapsed === 0) {
          continue;
        }
        const decay = Math.exp(
          -elapsed / Math.max(memory.persistence, 1)
        );
        memory.confidence *= decay;
        this.lastDecayAt.set(key, currentTime);
        if (memory.confidence < 0.01) {
          this.memories.delete(key);
          this.lastDecayAt.delete(key);
        }
      }
    }
  };

  // src/physical/PhysicalPossession.ts
  var PhysicalPossession = class {
    constructor() {
      this.possessions = /* @__PURE__ */ new Map();
    }
    add(item, location) {
      if (this.possessions.has(item.id)) {
        throw new Error(`Item ${item.id} is already possessed.`);
      }
      this.assertValidDestination(item, location);
      this.possessions.set(item.id, { item, location });
      this.snapshot = void 0;
    }
    has(itemId) {
      return this.possessions.has(itemId);
    }
    get(itemId) {
      return this.possessions.get(itemId);
    }
    move(itemId, location) {
      const possession = this.possessions.get(itemId);
      if (!possession) {
        throw new Error(`Item ${itemId} is not possessed.`);
      }
      this.assertValidDestination(possession.item, location, itemId);
      possession.location = location;
    }
    remove(itemId) {
      const possession = this.possessions.get(itemId);
      if (!possession) {
        throw new Error(`Item ${itemId} is not possessed.`);
      }
      if (this.getContents(itemId).length > 0) {
        throw new Error(`Cannot remove non-empty container ${itemId}.`);
      }
      this.possessions.delete(itemId);
      this.snapshot = void 0;
      return possession.item;
    }
    getAll() {
      this.snapshot ?? (this.snapshot = [...this.possessions.values()]);
      return this.snapshot;
    }
    /** Direct contents of either a fixed external container or a possessed portable one. */
    getContents(containerId) {
      return this.getAll().filter(
        (possession) => possession.location.type === "container" && possession.location.containerId === containerId
      );
    }
    /** Capacity already occupied inside a possessed solid container. */
    getSolidContainerUsedCapacity(containerId) {
      const container = this.possessions.get(containerId)?.item.solidContainer;
      if (!container) return void 0;
      return this.getContents(containerId).reduce((total, possession) => total + getItemStorageVolume(possession.item), 0);
    }
    /** Remaining capacity inside a possessed solid container. */
    getSolidContainerRemainingCapacity(containerId) {
      const container = this.possessions.get(containerId)?.item.solidContainer;
      const used = this.getSolidContainerUsedCapacity(containerId);
      return container && used !== void 0 ? Math.max(0, container.capacity - used) : void 0;
    }
    assertValidDestination(item, location, movingItemId) {
      if (location.type !== "container") return;
      if (location.containerId === item.id) {
        throw new Error(`Item ${item.id} cannot contain itself.`);
      }
      const parent = this.possessions.get(location.containerId);
      if (!parent) return;
      if (!parent.item.solidContainer) {
        throw new Error(`Item ${parent.item.id} is not a solid container.`);
      }
      if (!Number.isFinite(parent.item.solidContainer.capacity) || parent.item.solidContainer.capacity <= 0) {
        throw new Error(`Container ${parent.item.id} has invalid capacity.`);
      }
      const visited = /* @__PURE__ */ new Set([item.id]);
      let ancestor = parent;
      while (ancestor) {
        if (visited.has(ancestor.item.id)) {
          throw new Error(`Moving ${item.id} would create a container cycle.`);
        }
        visited.add(ancestor.item.id);
        if (ancestor.location.type !== "container") break;
        ancestor = this.possessions.get(ancestor.location.containerId);
      }
      const used = this.getContents(parent.item.id).filter((possession) => possession.item.id !== movingItemId).reduce((total, possession) => total + getItemStorageVolume(possession.item), 0);
      const required = getItemStorageVolume(item);
      if (used + required > parent.item.solidContainer.capacity) {
        throw new Error(
          `Container ${parent.item.id} lacks capacity for ${item.id} (${used + required}/${parent.item.solidContainer.capacity}).`
        );
      }
    }
  };

  // src/requests/RequestMailbox.ts
  var RequestMailbox = class {
    constructor(ownerId) {
      this.ownerId = ownerId;
      this.incoming = [];
      this.outgoing = [];
    }
    receive(request) {
      if (request.toCharacterId !== this.ownerId) {
        throw new Error(`Request ${request.id} is addressed to ${request.toCharacterId}, not ${this.ownerId}.`);
      }
      this.assertUnique(request.id, this.incoming);
      this.incoming.push(this.clone(request));
    }
    recordOutgoing(request) {
      if (request.fromCharacterId !== this.ownerId) {
        throw new Error(`Request ${request.id} was sent by ${request.fromCharacterId}, not ${this.ownerId}.`);
      }
      this.assertUnique(request.id, this.outgoing);
      this.outgoing.push(this.clone(request));
    }
    getIncoming(time) {
      this.expire(this.incoming, time);
      return this.incoming.map((request) => this.clone(request));
    }
    getOutgoing(time) {
      this.expire(this.outgoing, time);
      return this.outgoing.map((request) => this.clone(request));
    }
    getPending(time) {
      return this.getIncoming(time).filter((request) => request.status === "pending");
    }
    getIncomingById(requestId, time) {
      this.expire(this.incoming, time);
      const request = this.incoming.find((candidate) => candidate.id === requestId);
      return request ? this.clone(request) : void 0;
    }
    getOutgoingById(requestId, time) {
      this.expire(this.outgoing, time);
      const request = this.outgoing.find((candidate) => candidate.id === requestId);
      return request ? this.clone(request) : void 0;
    }
    updateIncomingStatus(requestId, status) {
      this.updateStatusIn(this.incoming, requestId, status, "incoming");
    }
    updateOutgoingStatus(requestId, status) {
      this.updateStatusIn(this.outgoing, requestId, status, "outgoing");
    }
    updateIncomingFulfilment(requestId, fulfilment) {
      this.updateFulfilmentIn(this.incoming, requestId, fulfilment, "incoming");
    }
    updateOutgoingFulfilment(requestId, fulfilment) {
      this.updateFulfilmentIn(this.outgoing, requestId, fulfilment, "outgoing");
    }
    /** Backward-compatible alias for incoming request updates. */
    updateStatus(requestId, status) {
      this.updateIncomingStatus(requestId, status);
    }
    expire(requests, time) {
      if (time === void 0) return;
      for (const request of requests) {
        const canExpire = request.status === "pending" || request.status === "accepted" && request.fulfilment === void 0;
        if (canExpire && request.expiresAt !== void 0 && time >= request.expiresAt) {
          request.status = "expired";
        }
      }
    }
    updateStatusIn(requests, requestId, status, direction) {
      const request = requests.find((candidate) => candidate.id === requestId);
      if (!request) {
        throw new Error(`Unknown ${direction} request ${requestId} for ${this.ownerId}.`);
      }
      request.status = status;
    }
    updateFulfilmentIn(requests, requestId, fulfilment, direction) {
      const request = requests.find((candidate) => candidate.id === requestId);
      if (!request) {
        throw new Error(`Unknown ${direction} request ${requestId} for ${this.ownerId}.`);
      }
      request.fulfilment = this.cloneFulfilment(fulfilment);
    }
    assertUnique(requestId, requests) {
      if (requests.some((existing) => existing.id === requestId)) {
        throw new Error(`Request ${requestId} has already been recorded by ${this.ownerId}.`);
      }
    }
    clone(request) {
      return {
        ...request,
        parameters: request.parameters ? { ...request.parameters } : void 0,
        fulfilment: request.fulfilment ? this.cloneFulfilment(request.fulfilment) : void 0
      };
    }
    cloneFulfilment(fulfilment) {
      return {
        ...fulfilment,
        resourcePosition: fulfilment.resourcePosition ? { ...fulfilment.resourcePosition } : void 0,
        itemIds: fulfilment.itemIds ? [...fulfilment.itemIds] : void 0
      };
    }
  };

  // src/personality/Personality.ts
  var NEUTRAL_PERSONALITY = {
    frugality: 0.5,
    caution: 0.5,
    patience: 0.5,
    conscientiousness: 0.5,
    sociability: 0.5,
    helpfulness: 0.5,
    curiosity: 0.5,
    assertiveness: 0.5,
    integrity: 0.5,
    emotionalStability: 0.5
  };
  function createPersonality(overrides = {}) {
    const personality = {
      ...NEUTRAL_PERSONALITY,
      ...overrides
    };
    for (const [trait, value] of Object.entries(personality)) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`Personality trait ${trait} must be between 0 and 1.`);
      }
    }
    return personality;
  }

  // src/relationships/Relationship.ts
  var DEFAULT_RELATIONSHIP_TRUST = 0.5;
  var DEFAULT_RELATIONSHIP_AFFINITY = 0.5;

  // src/relationships/RelationshipStore.ts
  var RelationshipStore = class {
    constructor(ownerId) {
      this.ownerId = ownerId;
      this.relationships = /* @__PURE__ */ new Map();
    }
    get(personId) {
      return this.relationships.get(personId);
    }
    getAll() {
      return Array.from(this.relationships.values());
    }
    adjust(personId, change, time) {
      if (personId === this.ownerId) {
        throw new Error("A character cannot have a relationship with themselves.");
      }
      if (!Number.isFinite(time) || time < 0) {
        throw new Error("Relationship interaction time must be a non-negative number.");
      }
      const existing = this.relationships.get(personId) ?? {
        personId,
        familiarity: 0,
        trust: DEFAULT_RELATIONSHIP_TRUST,
        affinity: DEFAULT_RELATIONSHIP_AFFINITY
      };
      const updated = {
        personId,
        familiarity: this.clamp(existing.familiarity + (change.familiarity ?? 0)),
        trust: this.clamp(existing.trust + (change.trust ?? 0)),
        affinity: this.clamp(existing.affinity + (change.affinity ?? 0)),
        lastInteractionAt: time
      };
      this.relationships.set(personId, updated);
      return updated;
    }
    clamp(value) {
      if (!Number.isFinite(value)) {
        throw new Error("Relationship values must be finite numbers.");
      }
      return Math.max(0, Math.min(1, value));
    }
  };

  // src/navigation/NavigationGrid.ts
  var DIRECTION_OFFSETS = {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 }
  };
  var DIRECT_LINE_SAMPLE_METRES = 0.25;
  var PHYSICAL_CHANNELS = ["movement", "vision", "interaction"];
  var NavigationGrid = class {
    constructor() {
      this.blockedCells = /* @__PURE__ */ new Set();
      this.barriers = /* @__PURE__ */ new Map();
      this.doorEdges = /* @__PURE__ */ new Map();
      this._revision = 0;
    }
    get hasConstraints() {
      return this.blockedCells.size > 0 || this.barriers.size > 0;
    }
    /** Changes whenever physical constraints are edited. */
    get revision() {
      return this._revision;
    }
    worldToCell(position) {
      return {
        x: Math.floor(position.x),
        y: Math.floor(position.y)
      };
    }
    cellCentre(cell) {
      return {
        x: cell.x + 0.5,
        y: cell.y + 0.5
      };
    }
    neighbour(cell, direction) {
      const offset = DIRECTION_OFFSETS[direction];
      return {
        x: cell.x + offset.x,
        y: cell.y + offset.y
      };
    }
    setBlocked(cell, blocked = true) {
      const key = this.cellKey(cell);
      const changed = blocked ? !this.blockedCells.has(key) : this.blockedCells.has(key);
      if (!changed) return;
      if (blocked) {
        this.blockedCells.add(key);
      } else {
        this.blockedCells.delete(key);
      }
      this._revision++;
    }
    isBlocked(cell) {
      return this.blockedCells.has(this.cellKey(cell));
    }
    getBlockedCells() {
      return Array.from(this.blockedCells, (key) => this.parseCellKey(key));
    }
    setWall(cell, direction, present = true) {
      const neighbour = this.neighbour(cell, direction);
      const key = this.edgeKey(cell, neighbour);
      const existing = this.barriers.get(key);
      if (present && existing?.type === "wall") return;
      if (!present && existing?.type !== "wall") return;
      if (existing?.type === "door") {
        this.doorEdges.delete(existing.doorId);
      }
      if (present) {
        this.barriers.set(key, { type: "wall" });
      } else {
        this.barriers.delete(key);
      }
      this._revision++;
    }
    /**
     * Installs a boundary that blocks only selected channels. Existing structural
     * walls/doors win rather than being weakened by a later decorative fixture.
     */
    setChannelBarrier(first, second, blockedChannels) {
      if (!this.areCardinalNeighbours(first, second)) {
        throw new Error("Channel barriers must separate cardinal neighbour cells.");
      }
      const channels = this.normalizeChannels(blockedChannels);
      if (channels.length === 0) return false;
      const key = this.edgeKey(first, second);
      const existing = this.barriers.get(key);
      if (existing && existing.type !== "channel") return false;
      if (existing?.type === "channel" && this.sameChannels(existing.blockedChannels, channels)) {
        return true;
      }
      this.barriers.set(key, { type: "channel", blockedChannels: channels });
      this._revision++;
      return true;
    }
    setDoor(cell, direction, doorId, state2 = "open", barredFrom, security) {
      const neighbour = this.neighbour(cell, direction);
      const key = this.edgeKey(cell, neighbour);
      const previousKey = this.doorEdges.get(doorId);
      const existing = this.barriers.get(key);
      const resolvedSecurity = security ?? (state2 === "locked" ? "barred" : barredFrom ? "unsecured" : void 0);
      if (previousKey === key && existing?.type === "door" && existing.doorId === doorId && existing.state === state2 && existing.security === resolvedSecurity && this.sameOptionalCell(existing.barredFrom, barredFrom)) {
        return;
      }
      if (previousKey && previousKey !== key) {
        this.barriers.delete(previousKey);
      }
      if (existing?.type === "door" && existing.doorId !== doorId) {
        this.doorEdges.delete(existing.doorId);
      }
      this.barriers.set(key, {
        type: "door",
        doorId,
        state: state2,
        ...resolvedSecurity ? { security: resolvedSecurity } : {},
        ...barredFrom ? { barredFrom: { ...barredFrom } } : {}
      });
      this.doorEdges.set(doorId, key);
      this._revision++;
    }
    /** Compatibility state setter. New code should prefer open/close/bar/unbar methods. */
    setDoorState(doorId, state2) {
      const barrier = this.getDoorBarrier(doorId);
      if (!barrier) return false;
      const security = state2 === "locked" ? "barred" : barrier.barredFrom ? "unsecured" : void 0;
      if (barrier.state === state2 && barrier.security === security) return true;
      this.replaceDoorBarrier(doorId, {
        ...barrier,
        state: state2,
        ...security ? { security } : {},
        ...!security ? { security: void 0 } : {}
      });
      return true;
    }
    closeDoor(doorId) {
      const barrier = this.getDoorBarrier(doorId);
      if (!barrier) return false;
      if (barrier.state === "closed") return true;
      this.replaceDoorBarrier(doorId, { ...barrier, state: "closed" });
      return true;
    }
    openDoor(doorId) {
      const barrier = this.getDoorBarrier(doorId);
      if (!barrier || this.doorSecurity(barrier) === "barred") return false;
      if (barrier.state === "open") return true;
      this.replaceDoorBarrier(doorId, { ...barrier, state: "open" });
      return true;
    }
    /** Applies a medieval inside bar. The door must be shut and the actor must be on the bar side. */
    barDoor(doorId, actorPosition) {
      const barrier = this.getDoorBarrier(doorId);
      if (!barrier?.barredFrom || barrier.state === "open") return false;
      if (!this.sameCell(this.worldToCell(actorPosition), barrier.barredFrom)) return false;
      if (this.doorSecurity(barrier) === "barred") return true;
      this.replaceDoorBarrier(doorId, { ...barrier, security: "barred" });
      return true;
    }
    /** Removes an inside bar. Someone outside cannot unbar the door. */
    unbarDoor(doorId, actorPosition) {
      const barrier = this.getDoorBarrier(doorId);
      if (!barrier?.barredFrom) return false;
      if (!this.sameCell(this.worldToCell(actorPosition), barrier.barredFrom)) return false;
      if (this.doorSecurity(barrier) === "unsecured") return true;
      this.replaceDoorBarrier(doorId, {
        ...barrier,
        security: "unsecured",
        state: barrier.state === "locked" ? "closed" : barrier.state
      });
      return true;
    }
    getDoor(doorId) {
      const barrier = this.getDoorBarrier(doorId);
      return barrier ? this.cloneDoorBarrier(barrier) : void 0;
    }
    getBarrier(first, second) {
      if (!this.areCardinalNeighbours(first, second)) return void 0;
      return this.barriers.get(this.edgeKey(first, second));
    }
    getBarrierEdges() {
      return Array.from(this.barriers.entries(), ([key, barrier]) => {
        const [firstKey, secondKey] = key.split("|");
        return {
          first: this.parseCellKey(firstKey),
          second: this.parseCellKey(secondKey),
          barrier: this.cloneBarrier(barrier)
        };
      });
    }
    /** Traversal across one cardinal cell boundary. */
    canTraverse(first, second) {
      return this.canCross(first, second, "movement");
    }
    /**
     * Movement to an adjacent cardinal or diagonal cell. Diagonal movement is
     * only legal when both routes around the shared corner are open, preventing
     * characters from squeezing through wall corners.
     */
    canTraverseAdjacent(first, second) {
      return this.canCrossAdjacent(first, second, "movement");
    }
    /** Whether one cardinal boundary permits the requested physical channel. */
    canCross(first, second, channel) {
      if (!this.areCardinalNeighbours(first, second)) return false;
      if (this.isBlocked(first) || this.isBlocked(second)) return false;
      const barrier = this.getBarrier(first, second);
      if (!barrier) return true;
      return this.barrierAllows(barrier, channel);
    }
    /**
     * Whether adjacent cells can be crossed for a physical channel. Diagonal
     * checks are deliberately conservative at corners for movement, vision and
     * direct interaction alike.
     */
    canCrossAdjacent(first, second, channel) {
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX > 1 || absY > 1 || absX === 0 && absY === 0) return false;
      if (absX + absY === 1) return this.canCross(first, second, channel);
      if (this.isBlocked(first) || this.isBlocked(second)) return false;
      const horizontal = { x: first.x + dx, y: first.y };
      const vertical = { x: first.x, y: first.y + dy };
      return this.canCross(first, horizontal, channel) && this.canCross(first, vertical, channel) && this.canCross(horizontal, second, channel) && this.canCross(vertical, second, channel);
    }
    /**
     * Tests a continuous world-space segment against the sparse physical grid.
     * This is intentionally a cheap local query rather than route finding.
     */
    isLineClear(from, to, channel) {
      const distance10 = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance10 === 0) return !this.isBlocked(this.worldToCell(from));
      const steps = Math.max(1, Math.ceil(distance10 / DIRECT_LINE_SAMPLE_METRES));
      let previousCell = this.worldToCell(from);
      if (this.isBlocked(previousCell)) return false;
      for (let step2 = 1; step2 <= steps; step2++) {
        const ratio = step2 / steps;
        const cell = this.worldToCell({
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio
        });
        if (this.sameCell(cell, previousCell)) continue;
        if (!this.canCrossAdjacent(previousCell, cell, channel)) return false;
        previousCell = cell;
      }
      return true;
    }
    barrierAllows(barrier, channel) {
      if (barrier.type === "wall") return false;
      if (barrier.type === "channel") return !barrier.blockedChannels.includes(channel);
      return barrier.state === "open" && this.doorSecurity(barrier) === "unsecured";
    }
    doorSecurity(barrier) {
      return barrier.security ?? (barrier.state === "locked" ? "barred" : "unsecured");
    }
    getDoorBarrier(doorId) {
      const key = this.doorEdges.get(doorId);
      if (!key) return void 0;
      const barrier = this.barriers.get(key);
      return barrier?.type === "door" ? barrier : void 0;
    }
    replaceDoorBarrier(doorId, barrier) {
      const key = this.doorEdges.get(doorId);
      if (!key) return;
      const next = this.cloneDoorBarrier(barrier);
      if (next.security === void 0) delete next.security;
      this.barriers.set(key, next);
      this._revision++;
    }
    cloneBarrier(barrier) {
      if (barrier.type === "wall") return { type: "wall" };
      if (barrier.type === "channel") {
        return { type: "channel", blockedChannels: [...barrier.blockedChannels] };
      }
      return this.cloneDoorBarrier(barrier);
    }
    cloneDoorBarrier(barrier) {
      return {
        ...barrier,
        ...barrier.barredFrom ? { barredFrom: { ...barrier.barredFrom } } : {}
      };
    }
    normalizeChannels(channels) {
      const invalid = channels.find((channel) => !PHYSICAL_CHANNELS.includes(channel));
      if (invalid) throw new Error(`Unknown physical channel ${invalid}.`);
      return PHYSICAL_CHANNELS.filter((channel) => channels.includes(channel));
    }
    sameChannels(first, second) {
      if (first.length !== second.length) return false;
      return first.every((channel, index) => channel === second[index]);
    }
    areCardinalNeighbours(first, second) {
      return Math.abs(first.x - second.x) + Math.abs(first.y - second.y) === 1;
    }
    sameCell(first, second) {
      return first.x === second.x && first.y === second.y;
    }
    sameOptionalCell(first, second) {
      if (!first || !second) return first === second;
      return this.sameCell(first, second);
    }
    cellKey(cell) {
      return `${cell.x},${cell.y}`;
    }
    parseCellKey(key) {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    }
    edgeKey(first, second) {
      const firstKey = this.cellKey(first);
      const secondKey = this.cellKey(second);
      return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
    }
  };

  // src/navigation/NavigationKnowledge.ts
  var NavigationKnowledge = class {
    constructor() {
      this.grid = new NavigationGrid();
      this.barriers = /* @__PURE__ */ new Map();
      this.blockedCells = /* @__PURE__ */ new Map();
    }
    observeBarrier(first, second, barrier, sourceType, learnedAt, confidence = 1) {
      const direction = this.directionBetween(first, second);
      if (!direction) {
        throw new Error("Navigation knowledge barriers must separate cardinal neighbour cells.");
      }
      this.validateConfidence(confidence);
      const key = this.edgeKey(first, second);
      const existing = this.barriers.get(key);
      if (existing && existing.learnedAt > learnedAt) return;
      const rememberedBarrier = this.cloneBarrier(barrier);
      this.barriers.set(key, {
        first: { ...first },
        second: { ...second },
        barrier: rememberedBarrier,
        sourceType,
        learnedAt,
        confidence
      });
      if (rememberedBarrier.type === "wall") {
        this.grid.setWall(first, direction);
      } else if (rememberedBarrier.type === "channel") {
        this.grid.setChannelBarrier(first, second, rememberedBarrier.blockedChannels);
      } else {
        this.grid.setDoor(
          first,
          direction,
          rememberedBarrier.doorId,
          rememberedBarrier.state,
          rememberedBarrier.barredFrom,
          rememberedBarrier.security
        );
      }
    }
    observeBlockedCell(cell, sourceType, learnedAt, confidence = 1) {
      this.validateConfidence(confidence);
      const key = this.cellKey(cell);
      const existing = this.blockedCells.get(key);
      if (existing && existing.learnedAt > learnedAt) return;
      this.blockedCells.set(key, {
        cell: { ...cell },
        sourceType,
        learnedAt,
        confidence
      });
      this.grid.setBlocked(cell, true);
    }
    getBarrier(first, second) {
      const knowledge = this.barriers.get(this.edgeKey(first, second));
      return knowledge ? this.cloneKnowledge(knowledge) : void 0;
    }
    getAllBarriers() {
      return Array.from(this.barriers.values(), (knowledge) => this.cloneKnowledge(knowledge));
    }
    getBlockedCell(cell) {
      const knowledge = this.blockedCells.get(this.cellKey(cell));
      return knowledge ? this.cloneBlockedCellKnowledge(knowledge) : void 0;
    }
    getAllBlockedCells() {
      return Array.from(
        this.blockedCells.values(),
        (knowledge) => this.cloneBlockedCellKnowledge(knowledge)
      );
    }
    cloneKnowledge(knowledge) {
      return {
        ...knowledge,
        first: { ...knowledge.first },
        second: { ...knowledge.second },
        barrier: this.cloneBarrier(knowledge.barrier)
      };
    }
    cloneBlockedCellKnowledge(knowledge) {
      return {
        ...knowledge,
        cell: { ...knowledge.cell }
      };
    }
    cloneBarrier(barrier) {
      if (barrier.type === "wall") return { type: "wall" };
      if (barrier.type === "channel") {
        return { type: "channel", blockedChannels: [...barrier.blockedChannels] };
      }
      return {
        ...barrier,
        ...barrier.barredFrom ? { barredFrom: { ...barrier.barredFrom } } : {}
      };
    }
    validateConfidence(confidence) {
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error("Navigation knowledge confidence must be between 0 and 1.");
      }
    }
    directionBetween(first, second) {
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      if (dx === 1 && dy === 0) return "east";
      if (dx === -1 && dy === 0) return "west";
      if (dx === 0 && dy === 1) return "south";
      if (dx === 0 && dy === -1) return "north";
      return void 0;
    }
    cellKey(cell) {
      return `${cell.x},${cell.y}`;
    }
    edgeKey(first, second) {
      const firstKey = this.cellKey(first);
      const secondKey = this.cellKey(second);
      return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
    }
  };

  // src/needs/FoodDigestion.ts
  var MAX_STOMACH_FULLNESS = 100;
  var LIQUID_ABSORPTION_STACKS = 3;
  var LIQUID_ABSORPTION_MINUTES_PER_STACK = 5;
  var WATER_STOMACH_VOLUME_PER_UNIT = 20;
  var DEFAULT_FOOD_DIGESTION_PROFILES = {
    bread: { stackCount: 6, stackDurationMinutes: 30 },
    fruit: { stackCount: 3, stackDurationMinutes: 15 },
    vegetable: { stackCount: 2, stackDurationMinutes: 20 },
    meat: { stackCount: 8, stackDurationMinutes: 30 },
    "dried-meat": { stackCount: 8, stackDurationMinutes: 35 },
    "prepared-meal": { stackCount: 10, stackDurationMinutes: 30 },
    portable: { stackCount: 5, stackDurationMinutes: 25 }
  };
  function canFitStomachPortion(currentFullness, stomachVolume) {
    return Number.isFinite(stomachVolume) && stomachVolume > 0 && currentFullness + stomachVolume <= MAX_STOMACH_FULLNESS;
  }
  function canFitFoodPortion(currentFullness, item) {
    const stomachVolume = getFoodStomachVolume(item);
    return getDirectFoodHungerRelief(item) !== void 0 && stomachVolume !== void 0 && canFitStomachPortion(currentFullness, stomachVolume);
  }
  var FoodDigestionState = class {
    constructor() {
      this.effects = [];
    }
    /** Whether this exact physical food portion can currently fit in the stomach. */
    canAddFood(item) {
      return canFitFoodPortion(this.fullness, item);
    }
    /** Whether an arbitrary liquid/meal volume can currently fit in the shared stomach. */
    canAddLiquid(stomachVolume) {
      return canFitStomachPortion(this.fullness, stomachVolume);
    }
    addFood(item) {
      const food = item.food;
      const totalHungerRelief = getDirectFoodHungerRelief(item);
      const totalHydrationRelief = getDirectFoodHydrationRelief(item);
      const stomachVolume = getFoodStomachVolume(item);
      if (!food || totalHungerRelief === void 0 || totalHydrationRelief === void 0 || stomachVolume === void 0 || !this.canAddFood(item)) return false;
      const profile = DEFAULT_FOOD_DIGESTION_PROFILES[food.kind];
      this.addEffect({
        sourceItemId: item.id,
        label: food.kind,
        foodKind: food.kind,
        stackCount: profile.stackCount,
        stackDurationMinutes: profile.stackDurationMinutes,
        stomachVolume,
        hungerRelief: totalHungerRelief,
        hydrationRelief: totalHydrationRelief
      });
      return true;
    }
    /** Adds one consumed liquid portion to the same stomach used by food. */
    addLiquid(sourceItemId, label, stomachVolume, hydrationRelief) {
      if (!Number.isFinite(hydrationRelief) || hydrationRelief < 0 || !this.canAddLiquid(stomachVolume)) return false;
      this.addEffect({
        sourceItemId,
        label,
        stackCount: LIQUID_ABSORPTION_STACKS,
        stackDurationMinutes: LIQUID_ABSORPTION_MINUTES_PER_STACK,
        stomachVolume,
        hungerRelief: 0,
        hydrationRelief
      });
      return true;
    }
    /**
     * Advances digestion and returns need relief absorbed during this step. The
     * caller converts those amounts from temporary contributions into lasting relief.
     */
    advance(minutes) {
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new Error("Digestion advancement must be a non-negative number of minutes.");
      }
      const absorbed = { hungerRelief: 0, hydrationRelief: 0 };
      if (minutes === 0 || this.effects.length === 0) return absorbed;
      for (const effect of this.effects) {
        effect.minutesUntilNextStackExpires -= minutes;
        while (effect.remainingStacks > 0 && effect.minutesUntilNextStackExpires <= 0) {
          effect.remainingStacks -= 1;
          absorbed.hungerRelief += effect.hungerReliefPerStack;
          absorbed.hydrationRelief += effect.hydrationReliefPerStack;
          if (effect.remainingStacks > 0) {
            effect.minutesUntilNextStackExpires += effect.stackDurationMinutes;
          }
        }
      }
      this.effects = this.effects.filter((effect) => effect.remainingStacks > 0);
      return absorbed;
    }
    get hungerRelief() {
      return this.effects.reduce(
        (total, effect) => total + effect.remainingStacks * effect.hungerReliefPerStack,
        0
      );
    }
    get hydrationRelief() {
      return this.effects.reduce(
        (total, effect) => total + effect.remainingStacks * effect.hydrationReliefPerStack,
        0
      );
    }
    get fullness() {
      const value = this.effects.reduce(
        (total, effect) => total + effect.remainingStacks * effect.fullnessPerStack,
        0
      );
      return Math.max(0, Math.min(MAX_STOMACH_FULLNESS, value));
    }
    get activeEffectCount() {
      return this.effects.length;
    }
    get remainingStackCount() {
      return this.effects.reduce((total, effect) => total + effect.remainingStacks, 0);
    }
    summary() {
      if (this.effects.length === 0) return void 0;
      const byLabel = /* @__PURE__ */ new Map();
      for (const effect of this.effects) {
        const current = byLabel.get(effect.label) ?? { remaining: 0, initial: 0 };
        current.remaining += effect.remainingStacks;
        current.initial += effect.initialStacks;
        byLabel.set(effect.label, current);
      }
      return [...byLabel.entries()].map(([label, stacks]) => `${label} ${stacks.remaining}/${stacks.initial}`).join(", ");
    }
    addEffect(input) {
      this.effects.push({
        sourceItemId: input.sourceItemId,
        label: input.label,
        ...input.foodKind !== void 0 ? { foodKind: input.foodKind } : {},
        initialStacks: input.stackCount,
        remainingStacks: input.stackCount,
        hungerReliefPerStack: input.hungerRelief / input.stackCount,
        hydrationReliefPerStack: input.hydrationRelief / input.stackCount,
        fullnessPerStack: input.stomachVolume / input.stackCount,
        stackDurationMinutes: input.stackDurationMinutes,
        minutesUntilNextStackExpires: input.stackDurationMinutes
      });
    }
  };

  // src/characters/Character.ts
  var KnownPeopleView = class {
    constructor(character) {
      this.character = character;
    }
    get size() {
      return this.ids().length;
    }
    has(personId) {
      return this.character.hasKnowledge("person-identity", personId);
    }
    /**
     * Retained for scenario/test setup compatibility. Runtime interactions should
     * add identity knowledge with explicit provenance before using this view.
     */
    add(personId) {
      if (!this.has(personId)) {
        this.character.addKnowledge({
          type: "person-identity",
          subjectId: personId,
          polarity: "positive",
          sourceType: "world-initiation",
          learnedAt: 0,
          confidence: 1
        });
      }
      return this;
    }
    [Symbol.iterator]() {
      return this.ids()[Symbol.iterator]();
    }
    ids() {
      return this.character.knowledge.filter((knowledge) => knowledge.type === "person-identity" && knowledge.polarity === "positive").map((knowledge) => knowledge.subjectId);
    }
  };
  var Character = class {
    constructor(id, name, position, personality = createPersonality()) {
      this.id = id;
      this.name = name;
      this.position = position;
      this.personality = personality;
      this.memory = new MemoryStore();
      this.knowledge = [];
      this.navigationKnowledge = new NavigationKnowledge();
      this.physical = new PhysicalPossession();
      this.activities = [];
      this.activitySchedules = [];
      this.routineTemplates = [];
      this.routineReviews = [];
      /** Positive metabolic need pressures. Visible hunger/thirst are reduced by active digestion effects. */
      this.hungerPressure = 0;
      this.thirstPressure = 0;
      this.foodDigestion = new FoodDigestionState();
      this.tiredness = 0;
      /** Desire for social contact. Unlike physical needs this is never life-threatening. */
      this.socialNeed = 0;
      this.hungerRatePerMinute = 0.1;
      this.thirstRatePerMinute = 0.15;
      this.tirednessRatePerMinute = 0.05;
      this.socialNeedRatePerMinute = 0.08;
      this.sleepRecoveryPerMinute = 0.12;
      this.movementSpeed = 1;
      this.movementTarget = void 0;
      this.socialInstruction = void 0;
      this.homeId = void 0;
      /** Increments only when a belief changes in a way that can affect planning. */
      this.knowledgeRevision = 0;
      this.foodCount = 0;
      this.moneyBalance = 0;
      this.dailyAgenda = void 0;
      this.currentIntent = void 0;
      this.currentPlan = void 0;
      /** Knowledge revision against which the Brain selected currentPlan. */
      this.currentPlanKnowledgeRevision = void 0;
      this.currentAction = void 0;
      this.requests = new RequestMailbox(id);
      this.knownPeople = new KnownPeopleView(this);
      this.relationships = new RelationshipStore(id);
    }
    /** Current hunger is a derived bodily output, not an independently ticking bar. */
    get hunger() {
      return Math.max(0, Math.min(100, this.hungerPressure - this.foodDigestion.hungerRelief));
    }
    /**
     * Compatibility setter for scenario/test setup and explicit state interventions.
     * It adjusts metabolic pressure so the requested visible hunger is preserved even
     * if the character currently has active food satiety stacks.
     */
    set hunger(value) {
      this.hungerPressure = value + this.foodDigestion.hungerRelief;
    }
    /** Current thirst is derived against hydration still being absorbed from stomach contents. */
    get thirst() {
      return Math.max(0, Math.min(100, this.thirstPressure - this.foodDigestion.hydrationRelief));
    }
    /** Compatibility setter preserving the requested visible thirst while hydration is active. */
    set thirst(value) {
      this.thirstPressure = value + this.foodDigestion.hydrationRelief;
    }
    /** Fullness is shared by all food and liquid still represented by active digestion stacks. */
    get fullness() {
      return this.foodDigestion.fullness;
    }
    get digestionSummary() {
      return this.foodDigestion.summary();
    }
    get digestionEffectCount() {
      return this.foodDigestion.activeEffectCount;
    }
    get digestionStackCount() {
      return this.foodDigestion.remainingStackCount;
    }
    /** Adds one compact digestion record whose conceptual stacks are active immediately. */
    beginDigestingFood(item) {
      return this.foodDigestion.addFood(item);
    }
    /** Whether the requested amount of water can physically fit in the shared stomach. */
    canDrinkWater(amount = 1) {
      return this.foodDigestion.canAddLiquid(amount * WATER_STOMACH_VOLUME_PER_UNIT);
    }
    /**
     * Adds consumed water to the shared stomach. Hydration is sized so one ordinary
     * drink preserves the legacy behaviour of immediately reducing visible thirst to 20.
     */
    beginDigestingWater(sourceId, amount = 1) {
      if (!Number.isFinite(amount) || amount <= 0) return false;
      const hydrationRelief = Math.max(0, this.thirst - 20);
      return this.foodDigestion.addLiquid(
        sourceId,
        "water",
        amount * WATER_STOMACH_VOLUME_PER_UNIT,
        hydrationRelief
      );
    }
    get food() {
      return this.physical.getAll().filter(
        (possession) => possession.item.type === "food"
      ).length;
    }
    set food(value) {
      if (value < 0) throw new Error("Food cannot be negative.");
      let currentFood = this.physical.getAll().filter(
        (possession) => possession.item.type === "food"
      );
      if (value < currentFood.length) {
        while (currentFood.length > value) {
          const food = currentFood.pop();
          if (food) this.physical.remove(food.item.id);
        }
      } else if (value > currentFood.length && this.foodCount === currentFood.length) {
        while (currentFood.length < value) {
          const food = {
            id: `${this.id}-food-${this.foodCount + 1}-${currentFood.length}`,
            type: "food",
            size: "small",
            physical: { carryHands: 1, useHands: 1 }
          };
          this.physical.add(food, { type: "container", containerId: `${this.id}-food-storage` });
          currentFood = this.physical.getAll().filter((possession) => possession.item.type === "food");
        }
      }
      this.foodCount = this.physical.getAll().filter((possession) => possession.item.type === "food").length;
    }
    /**
     * Abstract currency balance. Money is intentionally not represented as world
     * inventory: denominations can be derived for presentation when a payment is
     * narrated without making every coin a simulated object.
     */
    get money() {
      return this.moneyBalance;
    }
    set money(value) {
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("Money must be a non-negative integer value.");
      }
      this.moneyBalance = value;
    }
    addActivity(activity) {
      if (this.activities.some((existing) => existing.id === activity.id)) {
        throw new Error(`Activity ${activity.id} is already active for ${this.id}.`);
      }
      this.activities.push(activity);
    }
    removeActivity(activityId) {
      const index = this.activities.findIndex((existing) => existing.id === activityId);
      if (index >= 0) this.activities.splice(index, 1);
    }
    addActivitySchedule(activitySchedule) {
      if (this.activitySchedules.some((existing) => existing.id === activitySchedule.id)) {
        throw new Error(`Activity schedule ${activitySchedule.id} already exists for ${this.id}.`);
      }
      if (!Number.isFinite(activitySchedule.priorityBoost) || activitySchedule.priorityBoost < 0) {
        throw new Error("Activity schedule priority boost must be a non-negative number.");
      }
      if (activitySchedule.commitment && (!Number.isFinite(activitySchedule.commitment.priority) || activitySchedule.commitment.priority < 0)) {
        throw new Error("Scheduled commitment priority must be a non-negative number.");
      }
      this.activitySchedules.push(activitySchedule);
    }
    getActivitySchedulePriorityBoost(activityId, minuteOfDay) {
      return this.activitySchedules.filter((activitySchedule) => activitySchedule.activityId === activityId).filter((activitySchedule) => activitySchedule.schedule.isActive(minuteOfDay)).reduce((highest, activitySchedule) => Math.max(highest, activitySchedule.priorityBoost), 0);
    }
    addRoutineTemplate(template) {
      if (this.routineTemplates.some((existing) => existing.id === template.id)) {
        throw new Error(`Routine template ${template.id} already exists for ${this.id}.`);
      }
      if (!Number.isFinite(template.planningHorizonMinutes) || template.planningHorizonMinutes < 0) {
        throw new Error("Routine planning horizon must be a non-negative number.");
      }
      if (!Number.isFinite(template.arrivalBufferMinutes) || template.arrivalBufferMinutes < 0) {
        throw new Error("Routine arrival buffer must be a non-negative number.");
      }
      this.routineTemplates.push(template);
    }
    advanceNeeds(minutes) {
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new Error("Need advancement must be a non-negative number of minutes.");
      }
      const metabolicMultiplier = this.currentAction?.type === "sleep" ? 0.5 : 1;
      const absorbed = this.foodDigestion.advance(minutes);
      this.hungerPressure = Math.max(0, this.hungerPressure - absorbed.hungerRelief);
      this.thirstPressure = Math.max(0, this.thirstPressure - absorbed.hydrationRelief);
      const hungerAfterDigestion = this.hunger;
      const nextHunger = Math.min(
        100,
        hungerAfterDigestion + this.hungerRatePerMinute * minutes * metabolicMultiplier
      );
      this.hungerPressure = nextHunger + this.foodDigestion.hungerRelief;
      const thirstAfterDigestion = this.thirst;
      const nextThirst = Math.min(
        100,
        thirstAfterDigestion + this.thirstRatePerMinute * minutes * metabolicMultiplier
      );
      this.thirstPressure = nextThirst + this.foodDigestion.hydrationRelief;
      this.socialNeed = Math.min(100, this.socialNeed + this.socialNeedRatePerMinute * minutes);
      if (this.currentAction?.type !== "sleep") {
        this.tiredness = Math.min(100, this.tiredness + this.tirednessRatePerMinute * minutes);
      }
    }
    addKnowledge(knowledge) {
      const existing = this.knowledge.find(
        (item) => item.type === knowledge.type && item.subjectId === knowledge.subjectId && serviceContextEquals(item.context, knowledge.context)
      );
      if (existing) {
        const planningChanged = this.hasPlanningRelevantKnowledgeChange(existing, knowledge);
        existing.polarity = knowledge.polarity;
        existing.position = knowledge.position;
        existing.context = knowledge.context ? { ...knowledge.context } : void 0;
        existing.sourceType = knowledge.sourceType;
        existing.sourceId = knowledge.sourceId;
        existing.learnedAt = knowledge.learnedAt;
        existing.confidence = knowledge.confidence;
        if (planningChanged) this.knowledgeRevision += 1;
        return;
      }
      this.knowledge.push({
        ...knowledge,
        context: knowledge.context ? { ...knowledge.context } : void 0
      });
      this.knowledgeRevision += 1;
    }
    hasKnowledge(type, subjectId, polarity = "positive") {
      return this.knowledge.some(
        (knowledge) => knowledge.type === type && knowledge.subjectId === subjectId && knowledge.polarity === polarity
      );
    }
    update(world2, executor, movement) {
      if (this.currentAction) {
        this.updateAction(world2, movement);
        return;
      }
      if (!this.currentPlan || this.currentPlan.completed || this.currentPlan.failed) return;
      executor.execute(this.currentPlan, this, world2);
    }
    interruptCurrentAction(world2, reason) {
      const action = this.currentAction;
      if (!action || action.interruptionPolicy !== "interruptible") return false;
      action.status = "interrupted";
      action.onInterrupt?.();
      this.currentAction = void 0;
      this.currentPlan = void 0;
      this.currentPlanKnowledgeRevision = void 0;
      this.currentIntent = void 0;
      logSimulation(world2, "event", `${this.name} interrupts ${action.type}: ${reason}`);
      return true;
    }
    updateAction(world2, movement) {
      const action = this.currentAction;
      if (!action) return;
      const previousPosition = { ...this.position };
      const movementTarget = this.movementTarget ? { ...this.movementTarget } : void 0;
      movement.update(this, world2, 1);
      if (previousPosition.x !== this.position.x || previousPosition.y !== this.position.y) {
        const targetLabel4 = movementTarget ? `(${movementTarget.x.toFixed(2)},${movementTarget.y.toFixed(2)})` : "none";
        logSimulation(
          world2,
          "trace",
          `${this.name} moves pos=(${this.position.x.toFixed(2)},${this.position.y.toFixed(2)}) target=${targetLabel4} action=${action.type}`
        );
      }
      action.onTick?.(1);
      if (action.isComplete?.()) {
        action.status = "completed";
        this.currentAction = void 0;
        if (action.completionDisposition === "reconsider-plan") {
          this.currentPlan = void 0;
          this.currentPlanKnowledgeRevision = void 0;
          this.currentIntent = void 0;
          logSimulation(
            world2,
            "event",
            action.completionMessage ?? `${this.name} finishes waiting and will reconsider what to do next`
          );
          return;
        }
        logSimulation(world2, "event", action.completionMessage ?? `${this.name} completes ${action.type}`);
        return;
      }
      if (world2.time >= action.expiresAt) {
        action.status = "expired";
        this.currentAction = void 0;
        if (this.currentPlan) this.currentPlan.failed = true;
        logSimulation(world2, "event", `${this.name}'s ${action.type} expires after ${action.expectedDuration} minutes plus ${action.tolerance} minutes tolerance; plan will be reconsidered`);
        return;
      }
      if (world2.time >= action.expectedAt) {
        logSimulation(world2, "decision", `${this.name}'s ${action.type} has exceeded its expected duration; reconsideration opportunity`);
      }
    }
    hasPlanningRelevantKnowledgeChange(existing, incoming) {
      return existing.polarity !== incoming.polarity || !this.positionsEqual(existing.position, incoming.position) || !this.serviceContextsEqual(existing.context, incoming.context) || existing.confidence !== incoming.confidence;
    }
    positionsEqual(first, second) {
      if (!first || !second) return first === second;
      return first.x === second.x && first.y === second.y;
    }
    serviceContextsEqual(first, second) {
      if (!first || !second) return first === second;
      if (!serviceContextEquals(first, second)) return false;
      return first.terms?.price === second.terms?.price && first.terms?.expectedDuration === second.terms?.expectedDuration && first.terms?.effects?.hungerRelief === second.terms?.effects?.hungerRelief && first.terms?.effects?.thirstRelief === second.terms?.effects?.thirstRelief;
    }
    think(brain, world2) {
      brain.think(this, world2);
    }
  };

  // src/scheduling/Schedule.ts
  var MINUTES_PER_DAY8 = 24 * 60;
  var DailySchedule = class {
    constructor(startMinute, endMinute) {
      this.startMinute = startMinute;
      this.endMinute = endMinute;
      this.assertMinute(startMinute, "startMinute");
      this.assertMinute(endMinute, "endMinute");
      if (startMinute === endMinute) {
        throw new Error("Daily schedule start and end must be different.");
      }
    }
    get durationMinutes() {
      return this.startMinute < this.endMinute ? this.endMinute - this.startMinute : MINUTES_PER_DAY8 - this.startMinute + this.endMinute;
    }
    isActive(minuteOfDay) {
      this.assertMinute(minuteOfDay, "minuteOfDay");
      if (this.startMinute < this.endMinute) {
        return minuteOfDay >= this.startMinute && minuteOfDay < this.endMinute;
      }
      return minuteOfDay >= this.startMinute || minuteOfDay < this.endMinute;
    }
    minutesUntilStart(minuteOfDay) {
      this.assertMinute(minuteOfDay, "minuteOfDay");
      if (this.isActive(minuteOfDay)) return 0;
      return (this.startMinute - minuteOfDay + MINUTES_PER_DAY8) % MINUTES_PER_DAY8;
    }
    minutesUntilEnd(minuteOfDay) {
      this.assertMinute(minuteOfDay, "minuteOfDay");
      if (this.isActive(minuteOfDay)) {
        return (this.endMinute - minuteOfDay + MINUTES_PER_DAY8) % MINUTES_PER_DAY8;
      }
      return this.minutesUntilStart(minuteOfDay) + this.durationMinutes;
    }
    assertMinute(value, name) {
      if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY8) {
        throw new Error(`${name} must be an integer from 0 to 1439.`);
      }
    }
  };

  // src/world/Room.ts
  function isPositionInRoom(position, room6) {
    const { origin, width, height } = room6.area;
    return position.x >= origin.x && position.x < origin.x + width && position.y >= origin.y && position.y < origin.y + height;
  }
  function roomCentre(room6) {
    return {
      x: room6.area.origin.x + room6.area.width / 2,
      y: room6.area.origin.y + room6.area.height / 2
    };
  }

  // src/navigation/FixtureObstruction.ts
  var VISIBILITY_OFFSET_METRES = 0.01;
  function fixtureObstructionCells(obstruction) {
    validateFixtureObstruction(obstruction);
    const cells = [];
    for (let x = obstruction.origin.x; x < obstruction.origin.x + obstruction.width; x++) {
      for (let y = obstruction.origin.y; y < obstruction.origin.y + obstruction.height; y++) {
        cells.push({ x, y });
      }
    }
    return cells;
  }
  function applyFixtureObstruction(grid, obstruction) {
    for (const cell of fixtureObstructionCells(obstruction)) grid.setBlocked(cell, true);
  }
  function isPositionInFixtureObstruction(position, obstruction) {
    validateFixtureObstruction(obstruction);
    return position.x >= obstruction.origin.x && position.x < obstruction.origin.x + obstruction.width && position.y >= obstruction.origin.y && position.y < obstruction.origin.y + obstruction.height;
  }
  function fixtureVisibleSidePoint(observer, obstruction) {
    validateFixtureObstruction(obstruction);
    const minX = obstruction.origin.x;
    const minY = obstruction.origin.y;
    const maxX = minX + obstruction.width;
    const maxY = minY + obstruction.height;
    const nearest = {
      x: Math.max(minX, Math.min(maxX, observer.x)),
      y: Math.max(minY, Math.min(maxY, observer.y))
    };
    const centre = {
      x: minX + obstruction.width / 2,
      y: minY + obstruction.height / 2
    };
    let dx = observer.x - nearest.x;
    let dy = observer.y - nearest.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
      dx = observer.x - centre.x;
      dy = observer.y - centre.y;
    }
    const distance10 = Math.hypot(dx, dy);
    if (distance10 < 1e-9) return { ...observer };
    return {
      x: nearest.x + dx / distance10 * VISIBILITY_OFFSET_METRES,
      y: nearest.y + dy / distance10 * VISIBILITY_OFFSET_METRES
    };
  }
  function worldObjectFixtureObstruction(object) {
    if (object.physicalObstruction) return object.physicalObstruction;
    if (object.kind !== "cart" || !object.servicePoint) return void 0;
    return {
      origin: {
        x: Math.floor(object.position.x) - 1,
        y: Math.floor(object.position.y)
      },
      width: 1,
      height: 1
    };
  }
  function validateFixtureObstruction(obstruction) {
    if (!Number.isInteger(obstruction.origin.x) || !Number.isInteger(obstruction.origin.y)) {
      throw new Error("Fixture obstruction origin must use integer grid coordinates.");
    }
    if (!Number.isInteger(obstruction.width) || obstruction.width <= 0 || !Number.isInteger(obstruction.height) || obstruction.height <= 0) {
      throw new Error("Fixture obstruction dimensions must be positive whole metres.");
    }
  }

  // src/world/Facility.ts
  function facilityActionPointId(facilityId) {
    return `${facilityId}:work`;
  }
  function createFacility(options) {
    const actionPointPosition = options.actionPointPosition ?? options.position;
    if (options.physicalObstruction && isPositionInFixtureObstruction(actionPointPosition, options.physicalObstruction)) {
      throw new Error(`Facility ${options.id} action point cannot be inside its physical obstruction.`);
    }
    return {
      id: options.id,
      kind: "other",
      position: { ...options.position },
      ...options.physicalObstruction ? {
        physicalObstruction: {
          origin: { ...options.physicalObstruction.origin },
          width: options.physicalObstruction.width,
          height: options.physicalObstruction.height
        }
      } : {},
      facility: {
        type: options.type,
        placeId: options.placeId,
        ...options.roomId ? { roomId: options.roomId } : {},
        actionPoint: createActionPoint(
          facilityActionPointId(options.id),
          actionPointPosition,
          1,
          "presence"
        )
      }
    };
  }

  // src/world/UsableResource.ts
  function usableResourceActionPoint(resourceId, position, resource) {
    return createActionPoint(resourceId, position, resource.capacity, "use");
  }
  function bedObstructionWestOfActionPoint(position) {
    const actionCell = {
      x: Math.floor(position.x),
      y: Math.floor(position.y)
    };
    return {
      origin: {
        x: actionCell.x - 1,
        y: actionCell.y - 1
      },
      width: 1,
      height: 2
    };
  }
  function createUsableResource(options) {
    const capacity = options.capacity ?? 1;
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("Usable resource capacity must be a positive integer.");
    }
    if (options.physicalObstruction && isPositionInFixtureObstruction(options.position, options.physicalObstruction)) {
      throw new Error(`Usable resource ${options.id} action point cannot be inside its physical obstruction.`);
    }
    return {
      id: options.id,
      kind: "other",
      position: { ...options.position },
      ...options.physicalObstruction ? {
        physicalObstruction: {
          origin: { ...options.physicalObstruction.origin },
          width: options.physicalObstruction.width,
          height: options.physicalObstruction.height
        }
      } : {},
      usableResource: {
        type: options.type,
        placeId: options.placeId,
        capacity,
        ...options.roomId ? { roomId: options.roomId } : {}
      }
    };
  }

  // src/world/Bakery.ts
  var DEFAULT_BAKERY_WIDTH_METRES = 8;
  var DEFAULT_BAKERY_HEIGHT_METRES = 8;
  function bakeryRoomIds(bakeryId) {
    return {
      shop: `${bakeryId}-shop`,
      workroom: `${bakeryId}-workroom`,
      living: `${bakeryId}-living`
    };
  }
  function bakeryBedId(bakeryId) {
    return `${bakeryId}-living-bed`;
  }
  function bakeryOvenId(bakeryId) {
    return `${bakeryId}-oven`;
  }
  function bakeryWorkStorageId(bakeryId) {
    return `${bakeryId}-work-storage`;
  }
  function createBakery(options) {
    const origin = {
      x: Math.floor(options.position.x) - Math.floor(DEFAULT_BAKERY_WIDTH_METRES / 2),
      y: Math.floor(options.position.y) - Math.floor(DEFAULT_BAKERY_HEIGHT_METRES / 2)
    };
    const ids = bakeryRoomIds(options.id);
    const frontDoorId = `${options.id}-front-door`;
    const workroomDoorId = `${options.id}-workroom-door`;
    const livingDoorId = `${options.id}-living-door`;
    const shop = room(ids.shop, options.id, {
      x: origin.x + 4,
      y: origin.y
    }, 4, 8, "public");
    const workroom = room(ids.workroom, options.id, origin, 4, 4, "private");
    const living = room(ids.living, options.id, {
      x: origin.x,
      y: origin.y + 4
    }, 4, 4, "private", options.ownerId);
    const internalPartitions = [
      {
        origin: { x: origin.x + 3, y: origin.y },
        side: "east",
        length: 8,
        doors: [
          { id: workroomDoorId, offset: 2, state: "open" },
          { id: livingDoorId, offset: 6, state: "open" }
        ]
      },
      {
        origin: { x: origin.x, y: origin.y + 3 },
        side: "south",
        length: 4
      }
    ];
    const livingCentre = roomCentre(living);
    const workCentre = roomCentre(workroom);
    const ovenObstructionOrigin = {
      x: Math.floor(workCentre.x) - 1,
      y: Math.floor(workCentre.y)
    };
    return {
      id: options.id,
      kind: "building",
      visualSize: "medium",
      recognisablePlaceType: "bakery",
      recognisableServices: ["food"],
      advertisedServiceOfferings: [{
        service: "food",
        offering: "portable-food",
        itemType: "food",
        foodKind: "bread"
      }],
      advertisedServiceHours: options.advertisedServiceHours?.map((descriptor) => ({
        service: descriptor.service,
        windows: descriptor.windows.map((window) => ({ ...window }))
      })),
      position: { ...options.position },
      ownerId: options.ownerId,
      physicalFootprint: {
        origin,
        width: DEFAULT_BAKERY_WIDTH_METRES,
        height: DEFAULT_BAKERY_HEIGHT_METRES,
        doors: [{
          id: frontDoorId,
          side: "east",
          offset: 4,
          state: "open",
          barredFromInside: true
        }]
      },
      physicalRooms: [shop, workroom, living],
      internalPartitions,
      fixtures: [
        createUsableResource({
          id: bakeryBedId(options.id),
          type: "bed",
          placeId: options.id,
          roomId: living.id,
          position: livingCentre,
          physicalObstruction: bedObstructionWestOfActionPoint(livingCentre)
        }),
        createFacility({
          id: bakeryOvenId(options.id),
          type: "oven",
          placeId: options.id,
          roomId: workroom.id,
          position: workCentre,
          actionPointPosition: workCentre,
          physicalObstruction: {
            origin: ovenObstructionOrigin,
            width: 1,
            height: 1
          }
        }),
        {
          id: bakeryWorkStorageId(options.id),
          kind: "other",
          position: workCentre,
          ownerId: options.ownerId,
          containerId: bakeryWorkStorageId(options.id)
        }
      ]
    };
  }
  function room(id, placeId, origin, width, height, access, residentId) {
    return {
      id,
      placeId,
      access,
      ...residentId ? { residentId } : {},
      area: {
        origin: { ...origin },
        width,
        height
      }
    };
  }

  // src/world/DoorPosition.ts
  function getDoorInsidePosition(footprint, doorId) {
    const door = footprint.doors?.find((candidate) => candidate.id === doorId);
    if (!door) return void 0;
    const { origin, width, height } = footprint;
    const cell = (() => {
      switch (door.side) {
        case "north":
          return { x: origin.x + door.offset, y: origin.y };
        case "south":
          return { x: origin.x + door.offset, y: origin.y + height - 1 };
        case "west":
          return { x: origin.x, y: origin.y + door.offset };
        case "east":
          return { x: origin.x + width - 1, y: origin.y + door.offset };
      }
    })();
    return { x: cell.x + 0.5, y: cell.y + 0.5 };
  }

  // src/navigation/PhysicalEdgeBarrier.ts
  function applyPhysicalEdgeBarrier(grid, barrier) {
    return grid.setChannelBarrier(barrier.first, barrier.second, barrier.blockedChannels);
  }
  function movementBarrierBetweenPositions(firstPosition, secondPosition) {
    const first = worldToCell(firstPosition);
    const second = worldToCell(secondPosition);
    const distance10 = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
    if (distance10 !== 1) return void 0;
    return {
      first,
      second,
      blockedChannels: ["movement"]
    };
  }
  function worldToCell(position) {
    return {
      x: Math.floor(position.x),
      y: Math.floor(position.y)
    };
  }

  // src/world/ServicePoint.ts
  function createServicePoint(options) {
    const counterBarrier = movementBarrierBetweenPositions(
      options.providerPosition,
      options.customerPosition
    );
    return {
      id: options.id,
      kind: "other",
      visualSize: "small",
      position: {
        x: (options.providerPosition.x + options.customerPosition.x) / 2,
        y: (options.providerPosition.y + options.customerPosition.y) / 2
      },
      ...options.containerId ? { containerId: options.containerId } : {},
      ...options.ownerId ? { ownerId: options.ownerId } : {},
      ...counterBarrier ? { physicalEdgeBarriers: [counterBarrier] } : {},
      servicePoint: {
        placeId: options.placeId,
        services: [...options.services],
        providerPosition: { ...options.providerPosition },
        customerPosition: { ...options.customerPosition },
        state: options.initialState ?? "open"
      }
    };
  }

  // src/scenarios/DefaultBakery.ts
  var DEFAULT_BAKERY_ID = "village-bakery";
  var DEFAULT_BAKERY_COUNTER_ID = "village-bakery-counter";
  var DEFAULT_BAKERY_BARREL_ID = "nora-bakery-water-barrel";
  var DEFAULT_BAKERY_BUCKET_ID = "nora-bakery-bucket";
  var DEFAULT_BAKERY_BASKET_ID = "nora-bakery-basket";
  var DEFAULT_BAKERY_BASKET_CAPACITY = 12;
  var DEFAULT_BAKERY_WATERSKIN_ID = "nora-waterskin";
  var DEFAULT_BAKERY_SERVICE_HOURS = [{
    service: "food",
    windows: [{ startMinuteOfDay: 8 * 60, endMinuteOfDay: 12 * 60 }]
  }];
  var BAKERY_OPENING_PREP_MINUTES = 15;
  var BAKERY_MORNING_STOCK_TARGET = 16;
  function createDefaultBakeryWorkplace(world2, layout) {
    const site = layout.bakerySite;
    const baker = new Character("nora", "Freya", { ...site.shopProviderPosition }, createPersonality({
      frugality: 0.65,
      caution: 0.55,
      patience: 0.7,
      conscientiousness: 0.9,
      sociability: 0.55,
      helpfulness: 0.65,
      curiosity: 0.45,
      assertiveness: 0.55,
      integrity: 0.85,
      emotionalStability: 0.75
    }));
    baker.homeId = DEFAULT_BAKERY_ID;
    baker.hunger = 0;
    baker.thirst = 0;
    baker.tiredness = 45;
    baker.money = 10;
    const bakery = createBakery({
      id: DEFAULT_BAKERY_ID,
      ownerId: baker.id,
      position: { ...site.position },
      frontDoorSide: "east",
      advertisedServiceHours: DEFAULT_BAKERY_SERVICE_HOURS
    });
    const counter = createServicePoint({
      id: DEFAULT_BAKERY_COUNTER_ID,
      placeId: bakery.id,
      services: ["food"],
      providerPosition: { ...site.shopProviderPosition },
      customerPosition: { ...site.shopCustomerPosition },
      ownerId: baker.id,
      containerId: DEFAULT_BAKERY_COUNTER_ID,
      initialState: "open"
    });
    world2.addObject(bakery);
    world2.addObject(counter);
    const roomIds = bakeryRoomIds(bakery.id);
    const workStorageId = bakeryWorkStorageId(bakery.id);
    const ovenActionPointId = facilityActionPointId(bakeryOvenId(bakery.id));
    const waterReserve = world2.roomResources.registerLiquid({
      id: DEFAULT_BAKERY_BARREL_ID,
      roomId: roomIds.workroom,
      liquidType: "water",
      capacity: 16,
      initialAmount: 0,
      ownerId: baker.id
    });
    const frontDoorId = `${bakery.id}-front-door`;
    const frontDoorInside = bakery.physicalFootprint ? getDoorInsidePosition(bakery.physicalFootprint, frontDoorId) : void 0;
    if (!frontDoorInside) throw new Error("Village bakery requires an inside-operable front door.");
    baker.addActivity(new WaterPreparationActivity("nora-water-preparation"));
    baker.addActivity(new SellFoodActivity());
    baker.addActivity(new ServicePointOperationActivity({
      id: "nora-bakery-counter-operation",
      name: "Operate Bakery Shop",
      servicePointId: counter.id,
      providerPosition: { ...site.shopProviderPosition },
      opensAt: 8 * 60,
      closesAt: 12 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open"
    }));
    baker.addActivity(new WorkplaceLiquidReserveActivity({
      id: "nora-bakery-water-reserve",
      name: "Fill Bakery Water Reserve",
      reserveId: DEFAULT_BAKERY_BARREL_ID,
      roomId: roomIds.workroom,
      roomPosition: { ...site.workPosition },
      bucketItemId: DEFAULT_BAKERY_BUCKET_ID,
      sourceId: "village-fountain",
      liquidType: "water",
      targetAmount: 16,
      activeFrom: 12 * 60,
      activeUntil: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: 55
    }));
    baker.addActivity(new PersonalWaterReserveActivity({
      id: "nora-personal-water-reserve",
      name: "Refill Freya's Waterskin",
      sourceRoomResourceId: DEFAULT_BAKERY_BARREL_ID,
      roomId: roomIds.workroom,
      roomPosition: { ...site.workPosition },
      portableItemId: DEFAULT_BAKERY_WATERSKIN_ID,
      targetAmount: 2,
      // Prepare personal water before the final fixed-reserve top-up so the
      // reserve can still finish the daylight window ready for overnight work.
      priority: 56,
      urgentPriority: 80
    }));
    baker.addActivity(new StagedWorkplaceProductionActivity({
      id: "nora-bakery-production",
      name: "Bake Bread For Morning",
      recipeId: "bake-bread",
      workActionPointId: ovenActionPointId,
      workPosition: { ...site.workPosition },
      outputContainerId: workStorageId,
      outputType: "food",
      outputFoodKind: "bread",
      outputHungerRelief: 70,
      targetStock: BAKERY_MORNING_STOCK_TARGET,
      outputCountPerBatch: 4,
      inputItemType: "flour",
      inputCountPerBatch: 1,
      liquidRoomResourceId: DEFAULT_BAKERY_BARREL_ID,
      liquidType: "water",
      liquidAmountPerBatch: 2,
      // One sourdough batch takes a little over three hours from mixing to
      // finished bread, but most of that time is passive. Multiple batches can
      // therefore ferment/proof concurrently while Freya tends each active stage.
      stages: [
        { id: "prepare-dough", activeMinutes: 15, passiveMinutesAfter: 90 },
        { id: "shape-dough", activeMinutes: 10, passiveMinutesAfter: 45 },
        { id: "bake-bread", activeMinutes: 30, passiveMinutesAfter: 0 }
      ],
      // Four batches cover the full 16-loaf morning target even after a busy
      // previous day leaves little or no stock. Passive stages overlap, so this
      // is a concurrency ceiling rather than four sequential three-hour jobs.
      maxConcurrentBatches: 4,
      activeFrom: 1 * 60,
      activeUntil: 8 * 60 - BAKERY_OPENING_PREP_MINUTES,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: 55,
      // Passive processing is worth monitoring but is deliberately below the
      // hands-on stages and urgent physical needs. Night-risk evaluation can
      // still reject casual excursions while dough is developing.
      waitingPriority: 20
    }));
    baker.addActivity(new DoorScheduleActivity({
      id: "nora-bakery-front-door-hours",
      doorId: frontDoorId,
      placeId: bakery.id,
      insidePosition: frontDoorInside,
      opensAt: 8 * 60,
      closesAt: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open",
      priority: 75
    }));
    baker.addActivitySchedule({
      id: "nora-bakery-shop-shift",
      activityId: "sell-food",
      schedule: new DailySchedule(8 * 60, 12 * 60),
      priorityBoost: 30,
      commitment: {
        goal: {
          type: "atLocation",
          parameters: {
            subjectId: serviceProviderActionPointId(counter.id),
            position: { ...site.shopProviderPosition }
          }
        },
        priority: 60
      }
    });
    baker.addActivitySchedule({
      id: "nora-bakery-baking-shift",
      activityId: "nora-bakery-production",
      schedule: new DailySchedule(1 * 60, 8 * 60),
      priorityBoost: 0,
      commitment: {
        goal: {
          type: "atLocation",
          parameters: { subjectId: ovenActionPointId, position: { ...site.workPosition } }
        },
        priority: 60
      }
    });
    baker.addRoutineTemplate({
      id: "nora-reverse-baking-day",
      name: "Freya's reverse baking day",
      activityScheduleId: "nora-bakery-baking-shift",
      planningHorizonMinutes: 180,
      arrivalBufferMinutes: 5
    });
    baker.addRoutineTemplate({
      id: "nora-bakery-shop-opening",
      name: "Freya's bakery opening",
      activityScheduleId: "nora-bakery-shop-shift",
      planningHorizonMinutes: 120,
      arrivalBufferMinutes: 5
    });
    baker.addKnowledge({
      type: "home-location",
      subjectId: bakery.id,
      polarity: "positive",
      position: { ...site.livingPosition },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    baker.addKnowledge({
      type: "service-place",
      subjectId: bakery.id,
      polarity: "positive",
      position: { ...site.position },
      context: { service: "food" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    baker.addKnowledge({
      type: "service-hours",
      subjectId: bakery.id,
      polarity: "positive",
      context: {
        service: "food",
        hours: DEFAULT_BAKERY_SERVICE_HOURS[0].windows.map((window) => ({ ...window }))
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    baker.addKnowledge({
      type: "service-provider",
      subjectId: baker.id,
      polarity: "positive",
      context: {
        service: "food",
        placeId: bakery.id,
        offering: "portable-food",
        terms: {
          price: 3,
          expectedDuration: 5,
          effects: { hungerRelief: 70 }
        }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    baker.addKnowledge({
      type: "water-source",
      subjectId: "village-fountain",
      polarity: "positive",
      position: { ...layout.fountainPosition },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    for (let index = 1; index <= 4; index++) {
      baker.physical.add(
        breadItem(`nora-bakery-bread-${index}`),
        { type: "container", containerId: workStorageId }
      );
    }
    baker.physical.add(breadItem("nora-personal-bread"), { type: "equipped", slot: "food-satchel" });
    baker.physical.add(breadItem("nora-personal-bread-2"), { type: "equipped", slot: "food-satchel" });
    baker.physical.add({
      id: DEFAULT_BAKERY_WATERSKIN_ID,
      type: "waterskin",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 2, contents: { type: "water", amount: 2 } }
    }, { type: "equipped", slot: "waterskin" });
    for (let index = 1; index <= 8; index++) {
      baker.physical.add({
        id: `nora-flour-${index}`,
        type: "flour",
        size: "medium",
        physical: { carryHands: 2, useHands: 2 }
      }, { type: "container", containerId: workStorageId });
    }
    baker.physical.add({
      id: DEFAULT_BAKERY_BASKET_ID,
      type: "basket",
      size: "medium",
      physical: { carryHands: 1, useHands: 1 },
      solidContainer: { capacity: DEFAULT_BAKERY_BASKET_CAPACITY }
    }, { type: "container", containerId: workStorageId });
    baker.physical.add({
      id: DEFAULT_BAKERY_BUCKET_ID,
      type: "bucket",
      size: "medium",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 4 }
    }, { type: "container", containerId: workStorageId });
    return { baker, bakery, counter, waterReserve };
  }
  function breadItem(id) {
    return {
      id,
      type: "food",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      food: { kind: "bread", hungerRelief: 70 }
    };
  }

  // src/scenarios/DefaultFieldTenancy.ts
  function configureDefaultFieldTenancy(world2, layout) {
    const residents = world2.characters.filter((character) => character.homeId !== void 0);
    if (residents.length === 0) {
      throw new Error("Default field tenancy requires established village residents.");
    }
    const householdIds = residents.map((character) => {
      const householdId = `${character.id}-household`;
      world2.households.register({
        id: householdId,
        name: `${character.name}'s Household`,
        memberIds: [character.id],
        homeId: character.homeId
      });
      return householdId;
    });
    const fieldIds = layout.mapFeatures.filter((feature) => feature.kind === "field" && feature.agriculture !== void 0).map((feature) => feature.id);
    if (fieldIds.length !== 3) {
      throw new Error(`Default three-field tenancy expected 3 fields, found ${fieldIds.length}.`);
    }
    world2.agriculture.assignScatteredTenancies(fieldIds, householdIds);
    return { fieldIds, householdIds };
  }

  // src/commerce/GoodsOffer.ts
  var GOODS_OFFER_REQUEST_TYPE = "goods-offer";
  function goodsOfferRequestParameters(parameters) {
    if (!parameters) return void 0;
    const { itemType, itemCategory, quantity, unitPrice, itemIds } = parameters;
    if (itemType !== void 0 && (typeof itemType !== "string" || itemType.length === 0)) return void 0;
    if (itemCategory !== void 0 && !isItemCategory(itemCategory)) return void 0;
    if (itemType === void 0 && itemCategory === void 0) return void 0;
    if (!Number.isInteger(quantity) || quantity <= 0) return void 0;
    if (!Number.isInteger(unitPrice) || unitPrice < 0) return void 0;
    if (!Array.isArray(itemIds) || itemIds.length !== quantity) return void 0;
    if (!itemIds.every((itemId) => typeof itemId === "string" && itemId.length > 0)) return void 0;
    return {
      ...typeof itemType === "string" ? { itemType } : {},
      ...isItemCategory(itemCategory) ? { itemCategory } : {},
      quantity,
      unitPrice,
      itemIds: [...itemIds]
    };
  }

  // src/activities/BuyOfferedGoodsActivity.ts
  var BuyOfferedGoodsActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Buy Offered Goods";
      if (Object.keys(options.policies ?? {}).length === 0 && Object.keys(options.categoryPolicies ?? {}).length === 0) {
        throw new Error("BuyOfferedGoodsActivity requires at least one buying policy.");
      }
    }
    getIntents({ character, time }) {
      const request = character.requests.getIncoming(time).filter((candidate) => candidate.type === GOODS_OFFER_REQUEST_TYPE).filter((candidate) => candidate.status === "pending" || candidate.status === "accepted").map((candidate) => ({ candidate, offer: goodsOfferRequestParameters(candidate.parameters) })).map((entry) => ({ ...entry, policy: entry.offer ? this.policyFor(entry.offer) : void 0 })).filter((entry) => entry.offer !== void 0 && entry.policy !== void 0).sort((first, second) => {
        if (first.candidate.status === "accepted" && second.candidate.status !== "accepted") return -1;
        if (second.candidate.status === "accepted" && first.candidate.status !== "accepted") return 1;
        return first.candidate.createdAt - second.candidate.createdAt;
      })[0];
      if (!request?.offer || !request.policy) return [];
      return [{
        id: `${character.id}:activity:${this.id}:request:${request.candidate.id}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "serveGoodsOffer",
          parameters: {
            requestId: request.candidate.id,
            maxUnitPrice: request.policy.maxUnitPrice,
            storageContainerId: request.policy.storageContainerId,
            storagePosition: { ...request.policy.storagePosition }
          }
        },
        priority: request.candidate.status === "accepted" ? this.options.acceptedPriority ?? 80 : this.options.pendingPriority ?? 65
      }];
    }
    policyFor(offer) {
      if (offer.itemType !== void 0) {
        const exact = this.options.policies?.[offer.itemType];
        if (exact) return exact;
      }
      return offer.itemCategory !== void 0 ? this.options.categoryPolicies?.[offer.itemCategory] : void 0;
    }
  };

  // src/activities/FieldFarmingActivity.ts
  var MINUTES_PER_DAY9 = 24 * 60;
  var DEFAULT_MAINTENANCE_INTERVAL_MINUTES = 7 * MINUTES_PER_DAY9;
  var FieldFarmingActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Work Household Fields";
      this.maintenanceIntervalMinutes = options.maintenanceIntervalMinutes ?? DEFAULT_MAINTENANCE_INTERVAL_MINUTES;
      if (!Number.isFinite(this.maintenanceIntervalMinutes) || this.maintenanceIntervalMinutes <= 0) {
        throw new Error("Field farming maintenance interval must be positive.");
      }
      this.tiles = options.tiles.map((tile) => ({
        ...tile,
        state: tile.state ?? "bare"
      }));
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY9;
      if (!isActive3(minuteOfDay, this.options.activeFrom, this.options.activeUntil)) return [];
      const task = this.nextTask(time, character.position);
      if (!task) return [];
      const finishBy = time + minutesUntilEnd2(minuteOfDay, this.options.activeFrom, this.options.activeUntil);
      return [{
        id: `${character.id}:activity:${this.id}:${task.type}:${task.x},${task.y}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "performAgriculturalWork",
          parameters: {
            activityId: this.id,
            workType: task.type,
            x: task.x,
            y: task.y,
            position: { x: task.x + 0.5, y: task.y + 0.5 },
            finishBy,
            ...task.type === "sow" ? { crop: task.crop } : {}
          }
        },
        priority: (this.options.priority ?? 44) + taskPriorityBoost(task.type)
      }];
    }
    /** Character-side update produced by the explicit result of their own work. */
    recordCompletedWork(request, completedAt) {
      const tile = this.tiles.find((candidate) => candidate.x === request.x && candidate.y === request.y);
      if (!tile) return;
      switch (request.type) {
        case "plough":
          tile.state = "ploughed";
          delete tile.plantedAt;
          delete tile.lastMaintainedAt;
          return;
        case "sow":
          tile.state = "sown";
          tile.plantedAt = completedAt;
          tile.lastMaintainedAt = completedAt;
          return;
        case "hoe":
          if (tile.state === "sown" || tile.state === "growing") tile.lastMaintainedAt = completedAt;
          return;
        case "harvest":
          tile.state = "harvested";
          return;
      }
    }
    /** True when this character-side work queue still expects this exact task. */
    expectsWork(request, time, position) {
      const task = this.nextTask(time, position);
      if (!task || task.type !== request.type || task.x !== request.x || task.y !== request.y) return false;
      return task.type !== "sow" || request.type !== "sow" || task.crop === request.crop;
    }
    getKnownTiles() {
      return this.tiles.map((tile) => ({ ...tile }));
    }
    nextTask(time, position) {
      const dueHarvest = nearestTile(this.tiles.filter(
        (tile) => tile.state === "ripe" || (tile.state === "sown" || tile.state === "growing") && tile.plantedAt !== void 0 && time >= tile.plantedAt + tile.growthMinutes
      ), position);
      if (dueHarvest) return { type: "harvest", x: dueHarvest.x, y: dueHarvest.y };
      const dueMaintenance = nearestTile(this.tiles.filter(
        (tile) => (tile.state === "sown" || tile.state === "growing") && tile.plantedAt !== void 0 && time < tile.plantedAt + tile.growthMinutes && tile.lastMaintainedAt !== void 0 && time >= tile.lastMaintainedAt + this.maintenanceIntervalMinutes
      ), position);
      if (dueMaintenance) return { type: "hoe", x: dueMaintenance.x, y: dueMaintenance.y };
      const readyToSow = nearestTile(this.tiles.filter((tile) => tile.state === "ploughed"), position);
      if (readyToSow) {
        return { type: "sow", x: readyToSow.x, y: readyToSow.y, crop: readyToSow.crop };
      }
      const readyToPlough = nearestTile(this.tiles.filter(
        (tile) => tile.state === "bare" || tile.state === "harvested"
      ), position);
      if (readyToPlough) return { type: "plough", x: readyToPlough.x, y: readyToPlough.y };
      return void 0;
    }
  };
  function nearestTile(tiles, position) {
    let nearest;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const tile of tiles) {
      const distance10 = Math.hypot(
        tile.x + 0.5 - position.x,
        tile.y + 0.5 - position.y
      );
      if (distance10 < nearestDistance) {
        nearest = tile;
        nearestDistance = distance10;
      }
    }
    return nearest;
  }
  function taskPriorityBoost(type) {
    switch (type) {
      case "harvest":
        return 5;
      case "hoe":
        return 3;
      case "sow":
        return 1;
      case "plough":
        return 0;
    }
  }
  function isActive3(minuteOfDay, start2, end) {
    if (start2 === end) return true;
    if (start2 < end) return minuteOfDay >= start2 && minuteOfDay < end;
    return minuteOfDay >= start2 || minuteOfDay < end;
  }
  function minutesUntilEnd2(minuteOfDay, start2, end) {
    if (!isActive3(minuteOfDay, start2, end)) return 0;
    if (start2 === end) return MINUTES_PER_DAY9;
    if (start2 < end) return end - minuteOfDay;
    return minuteOfDay >= start2 ? MINUTES_PER_DAY9 - minuteOfDay + end : end - minuteOfDay;
  }

  // src/activities/OfferGoodsForSaleActivity.ts
  var OfferGoodsForSaleActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Offer Goods For Sale";
      if (!options.itemType && !options.itemCategory) {
        throw new Error("OfferGoodsForSaleActivity requires an item type or category.");
      }
      if (!Number.isInteger(options.quantity ?? 1) || (options.quantity ?? 1) <= 0) {
        throw new Error("OfferGoodsForSaleActivity quantity must be a positive integer.");
      }
      if (!Number.isInteger(options.reserveStock ?? 0) || (options.reserveStock ?? 0) < 0) {
        throw new Error("OfferGoodsForSaleActivity reserve stock must be a non-negative integer.");
      }
    }
    getIntents({ character, time }) {
      const quantity = this.options.quantity ?? 1;
      const reserveStock = this.options.reserveStock ?? 0;
      const selector2 = this.selector();
      const ownedStock = character.physical.getAll().filter((possession) => itemMatchesSelector(possession.item, selector2)).length;
      if (ownedStock < quantity + reserveStock) return [];
      const existing = character.requests.getOutgoing(time).filter((request) => request.type === GOODS_OFFER_REQUEST_TYPE).filter((request) => request.parameters?.itemType === this.options.itemType).filter((request) => request.parameters?.itemCategory === this.options.itemCategory).find((request) => request.status === "pending" || request.status === "accepted");
      const selectorKey = this.options.itemType ?? this.options.itemCategory;
      return [{
        id: `${character.id}:activity:${this.id}:${selectorKey}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "offerGoodsForSale",
          parameters: {
            service: this.options.service,
            offering: this.options.offering,
            ...this.options.itemType !== void 0 ? { itemType: this.options.itemType } : {},
            ...this.options.itemCategory !== void 0 ? { itemCategory: this.options.itemCategory } : {},
            quantity,
            ...existing ? { requestId: existing.id } : {}
          }
        },
        priority: this.options.priority ?? 45
      }];
    }
    selector() {
      return {
        ...this.options.itemType !== void 0 ? { itemType: this.options.itemType } : {},
        ...this.options.itemCategory !== void 0 ? { itemCategory: this.options.itemCategory } : {}
      };
    }
  };

  // src/activities/SellGoodsActivity.ts
  var SellGoodsActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Sell Goods";
      if ((options.itemTypes?.length ?? 0) === 0 && (options.itemCategories?.length ?? 0) === 0) {
        throw new Error("SellGoodsActivity requires at least one item type or category.");
      }
    }
    getIntents({ character, time }) {
      const requests = character.requests.getIncoming(time).filter((request2) => this.isSupportedPurchase(request2)).filter((request2) => request2.status === "pending" || request2.status === "accepted").sort((first, second) => {
        if (first.status === "accepted" && second.status !== "accepted") return -1;
        if (second.status === "accepted" && first.status !== "accepted") return 1;
        return first.createdAt - second.createdAt;
      });
      const request = requests[0];
      if (!request) return [];
      return [{
        id: `${character.id}:activity:${this.id}:request:${request.id}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "servePurchaseRequest",
          parameters: { requestId: request.id }
        },
        priority: request.status === "accepted" ? this.options.acceptedPriority ?? 80 : this.options.pendingPriority ?? 30
      }];
    }
    isSupportedPurchase(request) {
      if (request.type !== "purchase") return false;
      const itemType = request.parameters?.itemType;
      const itemCategory = request.parameters?.itemCategory;
      if (typeof itemType === "string" && this.options.itemTypes?.includes(itemType)) return true;
      return isItemCategory(itemCategory) && this.options.itemCategories?.includes(itemCategory) === true;
    }
  };

  // src/world/House.ts
  var DEFAULT_HOUSE_WIDTH_METRES = 4;
  var DEFAULT_HOUSE_HEIGHT_METRES = 4;
  function createHouse(options) {
    const origin = {
      x: Math.floor(options.position.x) - Math.floor(DEFAULT_HOUSE_WIDTH_METRES / 2),
      y: Math.floor(options.position.y) - Math.floor(DEFAULT_HOUSE_HEIGHT_METRES / 2)
    };
    const doorSideLength = options.frontDoorSide === "north" || options.frontDoorSide === "south" ? DEFAULT_HOUSE_WIDTH_METRES : DEFAULT_HOUSE_HEIGHT_METRES;
    const frontDoorOffset = Math.floor(doorSideLength / 2);
    const bedActionPoint = { ...options.position };
    return {
      id: options.id,
      kind: "building",
      visualSize: "small",
      position: { ...options.position },
      ownerId: options.ownerId,
      physicalFootprint: {
        origin,
        width: DEFAULT_HOUSE_WIDTH_METRES,
        height: DEFAULT_HOUSE_HEIGHT_METRES,
        doors: [{
          id: `${options.id}-front-door`,
          side: options.frontDoorSide,
          offset: frontDoorOffset,
          state: "open",
          barredFromInside: true
        }]
      },
      fixtures: [createUsableResource({
        id: `${options.id}-bed`,
        type: "bed",
        placeId: options.id,
        position: bedActionPoint,
        physicalObstruction: bedObstructionWestOfActionPoint(bedActionPoint)
      })]
    };
  }

  // src/world/Warehouse.ts
  var DEFAULT_WAREHOUSE_WIDTH_METRES = 10;
  var DEFAULT_WAREHOUSE_HEIGHT_METRES = 8;
  function warehouseRoomIds(warehouseId) {
    return {
      storage: `${warehouseId}-storage-room`,
      tradeRoom: `${warehouseId}-trade-room`
    };
  }
  function warehouseStorageId(warehouseId) {
    return `${warehouseId}-bulk-storage`;
  }
  function createWarehouse(options) {
    const origin = {
      x: Math.floor(options.position.x) - Math.floor(DEFAULT_WAREHOUSE_WIDTH_METRES / 2),
      y: Math.floor(options.position.y) - Math.floor(DEFAULT_WAREHOUSE_HEIGHT_METRES / 2)
    };
    const ids = warehouseRoomIds(options.id);
    const storage = room2(ids.storage, options.id, origin, 6, 8, "private");
    const tradeRoom = room2(ids.tradeRoom, options.id, { x: origin.x + 6, y: origin.y }, 4, 8, "public");
    const storageCentre = roomCentre(storage);
    const internalPartitions = [{
      origin: { x: origin.x + 5, y: origin.y },
      side: "east",
      length: 8,
      doors: [{ id: `${options.id}-storage-door`, offset: 4, state: "open" }]
    }];
    return {
      id: options.id,
      kind: "building",
      visualSize: "large",
      recognisablePlaceType: "warehouse",
      recognisableServices: ["trade"],
      advertisedServiceOfferings: [{
        service: "trade",
        offering: "grain",
        itemCategory: "grain"
      }],
      advertisedServiceHours: options.advertisedServiceHours?.map((descriptor) => ({
        service: descriptor.service,
        windows: descriptor.windows.map((window) => ({ ...window }))
      })),
      position: { ...options.position },
      ownerId: options.ownerId,
      physicalFootprint: {
        origin,
        width: DEFAULT_WAREHOUSE_WIDTH_METRES,
        height: DEFAULT_WAREHOUSE_HEIGHT_METRES,
        doors: [{ id: `${options.id}-front-door`, side: options.frontDoorSide, offset: 4, state: "open" }]
      },
      physicalRooms: [storage, tradeRoom],
      internalPartitions,
      fixtures: [{
        id: warehouseStorageId(options.id),
        kind: "other",
        visualSize: "small",
        position: storageCentre,
        ownerId: options.ownerId,
        containerId: warehouseStorageId(options.id)
      }]
    };
  }
  function room2(id, placeId, origin, width, height, access) {
    return { id, placeId, access, area: { origin: { ...origin }, width, height } };
  }

  // src/scenarios/DefaultMerchant.ts
  var DEFAULT_MERCHANT_ID = "george";
  var DEFAULT_MERCHANT_HOME_ID = "george-home";
  var DEFAULT_WAREHOUSE_ID = "village-merchant-warehouse";
  var DEFAULT_WAREHOUSE_COUNTER_ID = "village-merchant-counter";
  var DEFAULT_GRAIN_PRICE = 2;
  var DEFAULT_GRAIN_STOCK = 20;
  var DEFAULT_GEORGE_MONEY = 100;
  var DEFAULT_WAREHOUSE_SERVICE_HOURS = [{
    service: "trade",
    windows: [{ startMinuteOfDay: 9 * 60, endMinuteOfDay: 16 * 60 }]
  }];
  function createDefaultMerchant(world2, layout) {
    const site = layout.merchantWarehouseSite;
    const homeSite = layout.homes.george;
    const merchant = new Character(
      DEFAULT_MERCHANT_ID,
      "George",
      { ...site.serviceProviderPosition },
      createPersonality({
        frugality: 0.7,
        caution: 0.55,
        patience: 0.65,
        conscientiousness: 0.75,
        sociability: 0.7,
        helpfulness: 0.55,
        curiosity: 0.6,
        assertiveness: 0.7,
        integrity: 0.75,
        emotionalStability: 0.7
      })
    );
    merchant.homeId = DEFAULT_MERCHANT_HOME_ID;
    merchant.hunger = 20;
    merchant.thirst = 0;
    merchant.tiredness = 30;
    merchant.money = DEFAULT_GEORGE_MONEY;
    const home = createHouse({
      id: DEFAULT_MERCHANT_HOME_ID,
      ownerId: merchant.id,
      position: { ...homeSite.position },
      frontDoorSide: homeSite.frontDoorSide
    });
    const warehouse = createWarehouse({
      id: DEFAULT_WAREHOUSE_ID,
      ownerId: merchant.id,
      position: { ...site.position },
      frontDoorSide: site.frontDoorSide,
      advertisedServiceHours: DEFAULT_WAREHOUSE_SERVICE_HOURS
    });
    const counter = createServicePoint({
      id: DEFAULT_WAREHOUSE_COUNTER_ID,
      placeId: warehouse.id,
      services: ["trade"],
      providerPosition: { ...site.serviceProviderPosition },
      customerPosition: { ...site.serviceCustomerPosition },
      ownerId: merchant.id,
      initialState: "closed"
    });
    world2.addObject(home);
    world2.addObject(warehouse);
    world2.addObject(counter);
    const homeFrontDoorId = `${home.id}-front-door`;
    const homeFrontDoorInside = home.physicalFootprint ? getDoorInsidePosition(home.physicalFootprint, homeFrontDoorId) : void 0;
    if (!homeFrontDoorInside) throw new Error("George's house requires an inside-operable front door.");
    merchant.addActivity(new DoorScheduleActivity({
      id: "george-home-front-door-hours",
      doorId: homeFrontDoorId,
      placeId: home.id,
      insidePosition: homeFrontDoorInside,
      opensAt: 6 * 60,
      closesAt: 22 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open"
    }));
    merchant.addActivity(new WaterPreparationActivity("george-water-preparation"));
    merchant.addActivity(new SellGoodsActivity({
      id: "george-sell-goods",
      name: "Sell Warehouse Goods",
      itemCategories: ["grain"]
    }));
    merchant.addActivity(new BuyOfferedGoodsActivity({
      id: "george-buy-offered-goods",
      name: "Buy Warehouse Stock",
      categoryPolicies: {
        grain: {
          maxUnitPrice: DEFAULT_GRAIN_PRICE,
          storageContainerId: warehouseStorageId(warehouse.id),
          storagePosition: { ...site.storagePosition }
        }
      }
    }));
    merchant.addActivity(new ServicePointOperationActivity({
      id: "george-warehouse-operation",
      name: "Operate Merchant Warehouse",
      servicePointId: counter.id,
      providerPosition: { ...site.serviceProviderPosition },
      opensAt: 9 * 60,
      closesAt: 16 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "closed",
      staffingMode: "continuous"
    }));
    merchant.addKnowledge({
      type: "home-location",
      subjectId: home.id,
      polarity: "positive",
      position: { ...homeSite.position },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.addKnowledge({
      type: "service-place",
      subjectId: warehouse.id,
      polarity: "positive",
      position: { ...site.position },
      context: { service: "trade" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.addKnowledge({
      type: "service-hours",
      subjectId: warehouse.id,
      polarity: "positive",
      context: {
        service: "trade",
        hours: DEFAULT_WAREHOUSE_SERVICE_HOURS[0].windows.map((window) => ({ ...window }))
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.addKnowledge({
      type: "service-provider",
      subjectId: merchant.id,
      polarity: "positive",
      context: {
        service: "trade",
        placeId: warehouse.id,
        offering: "grain",
        itemCategory: "grain",
        terms: { price: DEFAULT_GRAIN_PRICE, expectedDuration: 5 }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.addKnowledge({
      type: "water-source",
      subjectId: "village-fountain",
      polarity: "positive",
      position: { ...layout.fountainPosition },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.knownPeople.add("emma");
    merchant.addKnowledge({
      type: "service-place",
      subjectId: "village-tavern",
      polarity: "positive",
      position: { ...layout.tavern.position },
      context: { service: "food" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.addKnowledge({
      type: "service-provider",
      subjectId: "emma",
      polarity: "positive",
      context: {
        service: "food",
        placeId: "village-tavern",
        offering: "prepared-meal",
        terms: { price: 5, expectedDuration: 20, effects: { hungerRelief: 90 } }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.addKnowledge({
      type: "service-hours",
      subjectId: "village-tavern",
      polarity: "positive",
      context: {
        service: "food",
        hours: [{ startMinuteOfDay: 8 * 60, endMinuteOfDay: 22 * 60 }]
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    merchant.physical.add({
      id: "george-waterskin",
      type: "waterskin",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 2, contents: { type: "water", amount: 2 } }
    }, { type: "equipped", slot: "waterskin" });
    const storageId = warehouseStorageId(warehouse.id);
    const grainTypes = ["wheat-grain", "barley-grain", "rye-grain", "oat-grain"];
    for (let index = 1; index <= DEFAULT_GRAIN_STOCK; index++) {
      const type = grainTypes[(index - 1) % grainTypes.length];
      merchant.physical.add({
        id: `george-grain-${index}`,
        type,
        size: "medium",
        physical: { carryHands: 2, useHands: 2 }
      }, { type: "container", containerId: storageId });
    }
    return { merchant, home, warehouse, counter, storageId };
  }

  // src/scenarios/DefaultFarmer.ts
  var DEFAULT_FARMER_ID = "charlie";
  var DEFAULT_FARM_WORK_ACTIVITY_ID = farmerFieldWorkActivityId(DEFAULT_FARMER_ID);
  var DEFAULT_FARM_WORK_SCHEDULE_ID = farmerFieldWorkScheduleId(DEFAULT_FARMER_ID);
  var DEFAULT_VEGETABLE_WHOLESALE_PRICE = 2;
  var DEFAULT_VEGETABLE_BUYER_ID = "dave";
  var DEFAULT_VEGETABLE_MARKET_ID = "dave-cart";
  var DEFAULT_VEGETABLE_BUY_ACTIVITY_ID = "dave-buy-farm-vegetables";
  function farmerFieldWorkActivityId(farmerId) {
    return `${farmerId}-household-field-work`;
  }
  function farmerFieldWorkScheduleId(farmerId) {
    return `${farmerId}-field-workday`;
  }
  function createDefaultFarmer(world2, layout, farmer) {
    if (!farmer.homeId) throw new Error(`${farmer.name} requires a home before farmer setup.`);
    const farmHome = world2.getObject(farmer.homeId);
    if (!farmHome || farmHome.ownerId !== farmer.id) {
      throw new Error(`${farmer.name}'s owned home is required as a farmhouse.`);
    }
    const vegetableBuyer = world2.characters.find((character) => character.id === DEFAULT_VEGETABLE_BUYER_ID);
    const vegetableMarket = world2.getObject(DEFAULT_VEGETABLE_MARKET_ID);
    if (!vegetableBuyer || !vegetableMarket || vegetableMarket.ownerId !== vegetableBuyer.id || !vegetableMarket.containerId) {
      throw new Error(`${farmer.name}'s vegetable trade requires Dave and his physical market cart.`);
    }
    const vegetableCustomerPosition = {
      x: (layout.daveCartPosition.x + layout.daveSellingPosition.x) / 2,
      y: (layout.daveCartPosition.y + layout.daveSellingPosition.y) / 2
    };
    farmer.addActivity(new OfferGoodsForSaleActivity({
      id: `${farmer.id}-sell-harvest`,
      name: "Sell Harvest Surplus",
      service: "trade",
      offering: "grain",
      itemCategory: "grain",
      quantity: 1,
      reserveStock: 0,
      priority: 45
    }));
    farmer.addActivity(new OfferGoodsForSaleActivity({
      id: `${farmer.id}-sell-vegetables`,
      name: "Sell Vegetable Surplus",
      service: "trade",
      offering: "portable-food",
      itemCategory: "vegetable",
      quantity: 1,
      reserveStock: 0,
      priority: 45
    }));
    if (!vegetableBuyer.activities.some((activity) => activity.id === DEFAULT_VEGETABLE_BUY_ACTIVITY_ID)) {
      vegetableBuyer.addActivity(new BuyOfferedGoodsActivity({
        id: DEFAULT_VEGETABLE_BUY_ACTIVITY_ID,
        name: "Buy Farm Vegetables",
        categoryPolicies: {
          vegetable: {
            maxUnitPrice: DEFAULT_VEGETABLE_WHOLESALE_PRICE,
            storageContainerId: vegetableMarket.containerId,
            storagePosition: { ...layout.daveSellingPosition }
          }
        }
      }));
    }
    farmer.knownPeople.add(DEFAULT_MERCHANT_ID);
    farmer.addKnowledge({
      type: "service-provider",
      subjectId: DEFAULT_MERCHANT_ID,
      polarity: "positive",
      context: {
        service: "trade",
        placeId: DEFAULT_WAREHOUSE_ID,
        offering: "grain",
        itemCategory: "grain",
        terms: { price: DEFAULT_GRAIN_PRICE, expectedDuration: 5 }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    farmer.addKnowledge({
      type: "service-place",
      subjectId: DEFAULT_WAREHOUSE_ID,
      polarity: "positive",
      position: { ...layout.merchantWarehouseSite.serviceCustomerPosition },
      context: { service: "trade" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    farmer.addKnowledge({
      type: "service-hours",
      subjectId: DEFAULT_WAREHOUSE_ID,
      polarity: "positive",
      context: {
        service: "trade",
        hours: DEFAULT_WAREHOUSE_SERVICE_HOURS[0].windows.map((window) => ({ ...window }))
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    farmer.knownPeople.add(vegetableBuyer.id);
    farmer.addKnowledge({
      type: "service-provider",
      subjectId: vegetableBuyer.id,
      polarity: "positive",
      context: {
        service: "trade",
        placeId: vegetableMarket.id,
        offering: "portable-food",
        itemCategory: "vegetable",
        terms: { price: DEFAULT_VEGETABLE_WHOLESALE_PRICE, expectedDuration: 5 }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    farmer.addKnowledge({
      type: "service-place",
      subjectId: vegetableMarket.id,
      polarity: "positive",
      position: vegetableCustomerPosition,
      context: { service: "trade" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    farmer.addKnowledge({
      type: "service-hours",
      subjectId: vegetableMarket.id,
      polarity: "positive",
      context: {
        service: "trade",
        hours: [{ startMinuteOfDay: 9 * 60, endMinuteOfDay: 17 * 60 }]
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    return { farmer, farmHome, harvestItemIds: [] };
  }
  function configureDefaultFarmerFieldWork(world2, farmer) {
    const household = world2.households.getForMember(farmer.id);
    if (!household) throw new Error(`${farmer.name} requires a household before field work is configured.`);
    const tiles = world2.agriculture.getStripsForHousehold(household.id).flatMap((strip) => {
      const field = world2.agriculture.getField(strip.fieldId);
      if (!field) return [];
      const rotation = field.rotation;
      if (rotation === "fallow") return [];
      return world2.agriculture.tilesForStrip(strip.id).map((tile) => {
        const crop = tile.crop ?? plannedCropForStrip(rotation, strip.index);
        return {
          x: tile.x,
          y: tile.y,
          crop,
          growthMinutes: defaultCropDefinition(crop).growthMinutes,
          state: knownFarmState(tile.state),
          plantedAt: tile.plantedAt,
          lastMaintainedAt: tile.lastWorkedAt
        };
      });
    });
    if (tiles.length === 0) throw new Error(`${farmer.name} has no active household field tiles to work.`);
    const activity = new FieldFarmingActivity({
      id: farmerFieldWorkActivityId(farmer.id),
      name: "Work Household Fields",
      tiles,
      startMinuteOfDay: world2.startMinuteOfDay,
      activeFrom: 8 * 60,
      activeUntil: 17 * 60,
      priority: 44
    });
    farmer.addActivity(activity);
    farmer.addActivitySchedule({
      id: farmerFieldWorkScheduleId(farmer.id),
      activityId: activity.id,
      schedule: new DailySchedule(8 * 60, 17 * 60),
      priorityBoost: 0,
      mealBreaks: [{
        id: "midday-main-meal",
        name: "Midday main meal",
        startMinuteOfDay: 12 * 60,
        endMinuteOfDay: 13 * 60,
        mealSize: "main",
        priority: 52
      }]
    });
    return activity;
  }
  function knownFarmState(state2) {
    if (state2 === "fallow") throw new Error("Fallow tiles must not be included in an active farming assignment.");
    return state2;
  }

  // src/scenarios/DefaultHelenFarmer.ts
  var DEFAULT_HELEN_ID = "helen";
  var DEFAULT_HELEN_HOME_ID = "helen-home";
  function createDefaultHelenResident(world2, layout) {
    const homeSite = layout.homes.helen;
    const farmer = new Character(DEFAULT_HELEN_ID, "Helen", { ...homeSite.position }, createPersonality({
      frugality: 0.65,
      caution: 0.55,
      patience: 0.65,
      conscientiousness: 0.8,
      sociability: 0.55,
      helpfulness: 0.7,
      curiosity: 0.45,
      assertiveness: 0.5,
      integrity: 0.8,
      emotionalStability: 0.7
    }));
    farmer.homeId = DEFAULT_HELEN_HOME_ID;
    farmer.hunger = 0;
    farmer.thirst = 0;
    farmer.tiredness = 30;
    farmer.money = 10;
    farmer.addActivity(new WaterPreparationActivity("helen-water-preparation"));
    const farmHome = createHouse({
      id: DEFAULT_HELEN_HOME_ID,
      ownerId: farmer.id,
      position: { ...homeSite.position },
      frontDoorSide: homeSite.frontDoorSide
    });
    const frontDoorId = `${farmHome.id}-front-door`;
    const insidePosition = farmHome.physicalFootprint ? getDoorInsidePosition(farmHome.physicalFootprint, frontDoorId) : void 0;
    if (!insidePosition) throw new Error("Helen's farmhouse requires an inside-operable front door.");
    farmer.addActivity(new DoorScheduleActivity({
      id: "helen-home-front-door-hours",
      doorId: frontDoorId,
      placeId: farmHome.id,
      insidePosition,
      opensAt: 6 * 60,
      closesAt: 22 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open"
    }));
    world2.addObject(farmHome);
    return { farmer, farmHome };
  }

  // src/services/MaterialProcessingService.ts
  var MATERIAL_PROCESSING_REQUEST_TYPE = "material-processing";
  function materialProcessingRequestParameters(parameters) {
    if (!parameters) return void 0;
    const service = parameters.service;
    const offering = parameters.offering;
    const inputItemType = parameters.inputItemType;
    const inputItemCategory = parameters.inputItemCategory;
    const inputCount = parameters.inputCount;
    const outputItemType = parameters.outputItemType;
    const outputCount = parameters.outputCount;
    const price = parameters.price;
    const expectedDuration = parameters.expectedDuration;
    const inputItemIds = parameters.inputItemIds;
    if (!isServiceType(service) || !isServiceOfferingType(offering)) return void 0;
    if (inputItemType !== void 0 && (typeof inputItemType !== "string" || inputItemType.length === 0)) return void 0;
    if (inputItemCategory !== void 0 && !isItemCategory(inputItemCategory)) return void 0;
    if (inputItemType === void 0 && inputItemCategory === void 0) return void 0;
    if (typeof outputItemType !== "string") return void 0;
    if (!isPositiveInteger(inputCount) || !isPositiveInteger(outputCount)) return void 0;
    if (!isNonNegativeInteger(price) || !isPositiveNumber(expectedDuration)) return void 0;
    if (!Array.isArray(inputItemIds) || inputItemIds.length !== inputCount || !inputItemIds.every((itemId) => typeof itemId === "string" && itemId.length > 0)) return void 0;
    return {
      service,
      offering,
      ...typeof inputItemType === "string" ? { inputItemType } : {},
      ...isItemCategory(inputItemCategory) ? { inputItemCategory } : {},
      inputCount,
      outputItemType,
      outputCount,
      price,
      expectedDuration,
      inputItemIds: [...inputItemIds]
    };
  }
  function materialProcessingDefinitionMatches(request, offered) {
    return request.service === offered.service && request.offering === offered.offering && request.inputItemType === offered.inputItemType && request.inputItemCategory === offered.inputItemCategory && request.inputCount === offered.inputCount && request.outputItemType === offered.outputItemType && request.outputCount === offered.outputCount && request.price === offered.price && request.expectedDuration === offered.expectedDuration;
  }
  function isPositiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
  }
  function isNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }
  function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  // src/activities/MaterialProcessingServiceActivity.ts
  var MINUTES_PER_DAY10 = 24 * 60;
  var MaterialProcessingServiceActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Process Customer Material";
      validateMinute("activeFrom", options.activeFrom);
      validateMinute("activeUntil", options.activeUntil);
      validateMinute("startMinuteOfDay", options.startMinuteOfDay);
      if (!options.inputItemType && !options.inputItemCategory) {
        throw new Error("Material processing requires an input item type or category.");
      }
      if (!Number.isInteger(options.inputCount) || options.inputCount <= 0) {
        throw new Error("Material processing inputCount must be a positive integer.");
      }
      if (!Number.isInteger(options.outputCount) || options.outputCount <= 0) {
        throw new Error("Material processing outputCount must be a positive integer.");
      }
      if (!Number.isInteger(options.price) || options.price < 0) {
        throw new Error("Material processing price must be a non-negative whole number.");
      }
      if (!Number.isFinite(options.expectedDuration) || options.expectedDuration <= 0) {
        throw new Error("Material processing expectedDuration must be positive.");
      }
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY10;
      const requests = character.requests.getIncoming(time).filter(
        (request2) => request2.type === MATERIAL_PROCESSING_REQUEST_TYPE && (request2.status === "pending" || request2.status === "accepted") && request2.parameters?.service === this.options.service && request2.parameters?.offering === this.options.offering && request2.parameters?.inputItemType === this.options.inputItemType && request2.parameters?.inputItemCategory === this.options.inputItemCategory && (request2.status === "accepted" || this.isAvailableAt(minuteOfDay))
      ).sort((first, second) => {
        const firstAccepted = first.status === "accepted" ? 0 : 1;
        const secondAccepted = second.status === "accepted" ? 0 : 1;
        return firstAccepted - secondAccepted || first.createdAt - second.createdAt;
      });
      const request = requests[0];
      if (!request) return [];
      return [{
        id: `${character.id}:activity:${this.id}:request:${request.id}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "fulfilMaterialProcessingRequest",
          parameters: {
            requestId: request.id,
            service: this.options.service,
            offering: this.options.offering,
            ...this.options.inputItemType !== void 0 ? { inputItemType: this.options.inputItemType } : {},
            ...this.options.inputItemCategory !== void 0 ? { inputItemCategory: this.options.inputItemCategory } : {},
            inputCount: this.options.inputCount,
            outputItemType: this.options.outputItemType,
            outputCount: this.options.outputCount,
            price: this.options.price,
            expectedDuration: this.options.expectedDuration,
            workActionPointId: this.options.workActionPointId,
            workPosition: copyPosition(this.options.workPosition),
            returnActionPointId: this.options.returnActionPointId,
            returnPosition: copyPosition(this.options.returnPosition)
          }
        },
        priority: request.status === "accepted" ? this.options.acceptedPriority ?? 85 : this.options.pendingPriority ?? 65
      }];
    }
    isAvailableAt(minuteOfDay) {
      if (this.options.activeFrom === this.options.activeUntil) return true;
      if (this.options.activeFrom < this.options.activeUntil) {
        return minuteOfDay >= this.options.activeFrom && minuteOfDay < this.options.activeUntil;
      }
      return minuteOfDay >= this.options.activeFrom || minuteOfDay < this.options.activeUntil;
    }
  };
  function validateMinute(name, value) {
    if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY10) {
      throw new Error(`${name} must be an integer minute from 0 to 1439.`);
    }
  }
  function copyPosition(position) {
    return { x: position.x, y: position.y };
  }

  // src/environment/LightEnvironment.ts
  var MINUTES_PER_DAY11 = 24 * 60;
  var DAYLIGHT_START_MINUTE = 6 * 60;
  var DAYLIGHT_END_MINUTE = 20 * 60;
  var NIGHT_VISIBILITY_MULTIPLIER = 0.2;
  var NIGHT_OUTDOOR_EXPLORATION_RISK = 20;
  function isDarkMinuteOfDay(minuteOfDay) {
    const normalized = normalizeMinuteOfDay(minuteOfDay);
    return normalized < DAYLIGHT_START_MINUTE || normalized >= DAYLIGHT_END_MINUTE;
  }
  function visualRangeMultiplier(minuteOfDay) {
    return isDarkMinuteOfDay(minuteOfDay) ? NIGHT_VISIBILITY_MULTIPLIER : 1;
  }
  function outdoorExplorationRisk(minuteOfDay) {
    return isDarkMinuteOfDay(minuteOfDay) ? NIGHT_OUTDOOR_EXPLORATION_RISK : 0;
  }
  function normalizeMinuteOfDay(minuteOfDay) {
    if (!Number.isFinite(minuteOfDay)) {
      throw new Error("Minute of day must be finite.");
    }
    return (minuteOfDay % MINUTES_PER_DAY11 + MINUTES_PER_DAY11) % MINUTES_PER_DAY11;
  }

  // src/social/ConversationRange.ts
  var CONVERSATION_RANGE_METRES = 1;
  var CONVERSATION_RANGE_EPSILON = 1e-6;
  function isWithinConversationRange(distance10) {
    return distance10 <= CONVERSATION_RANGE_METRES + CONVERSATION_RANGE_EPSILON;
  }
  function arePositionsWithinConversationRange(first, second, world2) {
    const distance10 = Math.hypot(first.x - second.x, first.y - second.y);
    return isWithinConversationRange(distance10) && world2.navigation.isLineClear(first, second, "interaction");
  }

  // src/navigation/NavigationClearance.ts
  var CHARACTER_BODY_RADIUS_METRES = 0.3;
  var CHARACTER_BODY_DIAMETER_METRES = CHARACTER_BODY_RADIUS_METRES * 2;
  var CHARACTER_PERSON_APPROACH_RANGE_METRES = CHARACTER_BODY_DIAMETER_METRES + 0.1;
  var GEOMETRY_EPSILON = 1e-9;
  var CLEARANCE_EDGE_SAMPLE_METRES = 0.5;
  function isPositionClearWithClearance(grid, position, channel, clearance) {
    return isLineClearWithClearance(grid, position, position, channel, clearance);
  }
  function isLineClearWithClearance(grid, from, to, channel, clearance) {
    if (!Number.isFinite(clearance) || clearance < 0) {
      throw new Error("Navigation clearance must be a non-negative finite distance.");
    }
    if (!grid.isLineClear(from, to, channel)) return false;
    if (clearance <= GEOMETRY_EPSILON) return true;
    const distance10 = Math.hypot(to.x - from.x, to.y - from.y);
    const sampleCount = Math.max(1, Math.ceil(distance10 / CLEARANCE_EDGE_SAMPLE_METRES));
    const nearbyCellRadius = Math.max(
      1,
      Math.ceil(clearance + CLEARANCE_EDGE_SAMPLE_METRES / 2)
    );
    const checkedEdges = /* @__PURE__ */ new Set();
    for (let sample = 0; sample <= sampleCount; sample++) {
      const ratio = sampleCount === 0 ? 0 : sample / sampleCount;
      const point = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio
      };
      const centreCell = grid.worldToCell(point);
      for (let yOffset = -nearbyCellRadius; yOffset <= nearbyCellRadius; yOffset++) {
        for (let xOffset = -nearbyCellRadius; xOffset <= nearbyCellRadius; xOffset++) {
          const cell = {
            x: centreCell.x + xOffset,
            y: centreCell.y + yOffset
          };
          const east = { x: cell.x + 1, y: cell.y };
          if (checkCandidateBarrier(
            grid,
            cell,
            east,
            from,
            to,
            channel,
            clearance,
            checkedEdges
          )) return false;
          const south = { x: cell.x, y: cell.y + 1 };
          if (checkCandidateBarrier(
            grid,
            cell,
            south,
            from,
            to,
            channel,
            clearance,
            checkedEdges
          )) return false;
        }
      }
    }
    return true;
  }
  function checkCandidateBarrier(grid, first, second, from, to, channel, clearance, checkedEdges) {
    const key = barrierEdgeKey(first, second);
    if (checkedEdges.has(key)) return false;
    checkedEdges.add(key);
    const barrier = grid.getBarrier(first, second);
    if (!barrier || !barrierNeedsBodyClearance(barrier, channel)) return false;
    const [edgeStart, edgeEnd] = barrierWorldSegment(first, second);
    return segmentDistance(from, to, edgeStart, edgeEnd) < clearance - GEOMETRY_EPSILON;
  }
  function barrierNeedsBodyClearance(barrier, channel) {
    if (barrier.type === "wall") return true;
    if (barrier.type === "channel") return false;
    const security = barrier.security ?? (barrier.state === "locked" ? "barred" : "unsecured");
    return channel === "movement" && (barrier.state !== "open" || security === "barred");
  }
  function barrierEdgeKey(first, second) {
    const firstKey = `${first.x},${first.y}`;
    const secondKey = `${second.x},${second.y}`;
    return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
  }
  function barrierWorldSegment(first, second) {
    if (first.x !== second.x) {
      const x2 = Math.max(first.x, second.x);
      const y2 = first.y;
      return [{ x: x2, y: y2 }, { x: x2, y: y2 + 1 }];
    }
    const x = first.x;
    const y = Math.max(first.y, second.y);
    return [{ x, y }, { x: x + 1, y }];
  }
  function segmentDistance(firstStart, firstEnd, secondStart, secondEnd) {
    if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
    return Math.min(
      pointToSegmentDistance(firstStart, secondStart, secondEnd),
      pointToSegmentDistance(firstEnd, secondStart, secondEnd),
      pointToSegmentDistance(secondStart, firstStart, firstEnd),
      pointToSegmentDistance(secondEnd, firstStart, firstEnd)
    );
  }
  function pointToSegmentDistance(point, start2, end) {
    const dx = end.x - start2.x;
    const dy = end.y - start2.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= GEOMETRY_EPSILON) {
      return Math.hypot(point.x - start2.x, point.y - start2.y);
    }
    const ratio = Math.max(0, Math.min(
      1,
      ((point.x - start2.x) * dx + (point.y - start2.y) * dy) / lengthSquared
    ));
    return Math.hypot(
      point.x - (start2.x + dx * ratio),
      point.y - (start2.y + dy * ratio)
    );
  }
  function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
    const firstA = cross(firstStart, firstEnd, secondStart);
    const firstB = cross(firstStart, firstEnd, secondEnd);
    const secondA = cross(secondStart, secondEnd, firstStart);
    const secondB = cross(secondStart, secondEnd, firstEnd);
    if ((firstA > GEOMETRY_EPSILON && firstB < -GEOMETRY_EPSILON || firstA < -GEOMETRY_EPSILON && firstB > GEOMETRY_EPSILON) && (secondA > GEOMETRY_EPSILON && secondB < -GEOMETRY_EPSILON || secondA < -GEOMETRY_EPSILON && secondB > GEOMETRY_EPSILON)) {
      return true;
    }
    return Math.abs(firstA) <= GEOMETRY_EPSILON && onSegment(firstStart, secondStart, firstEnd) || Math.abs(firstB) <= GEOMETRY_EPSILON && onSegment(firstStart, secondEnd, firstEnd) || Math.abs(secondA) <= GEOMETRY_EPSILON && onSegment(secondStart, firstStart, secondEnd) || Math.abs(secondB) <= GEOMETRY_EPSILON && onSegment(secondStart, firstEnd, secondEnd);
  }
  function cross(start2, end, point) {
    return (end.x - start2.x) * (point.y - start2.y) - (end.y - start2.y) * (point.x - start2.x);
  }
  function onSegment(start2, point, end) {
    return point.x >= Math.min(start2.x, end.x) - GEOMETRY_EPSILON && point.x <= Math.max(start2.x, end.x) + GEOMETRY_EPSILON && point.y >= Math.min(start2.y, end.y) - GEOMETRY_EPSILON && point.y <= Math.max(start2.y, end.y) + GEOMETRY_EPSILON;
  }

  // src/navigation/NavigationSystem.ts
  var CARDINAL_COST = 1;
  var DIAGONAL_COST = Math.SQRT2;
  var APPROACH_SAMPLE_COUNT = 16;
  var APPROACH_RADIUS_MULTIPLIER = 0.9;
  var DISCONNECTED_GOAL_COMPONENT_PROBE_LIMIT = 128;
  var MinPriorityQueue = class {
    constructor() {
      this.values = [];
    }
    get size() {
      return this.values.length;
    }
    push(node) {
      this.values.push(node);
      this.bubbleUp(this.values.length - 1);
    }
    pop() {
      if (this.values.length === 0) return void 0;
      const first = this.values[0];
      const last = this.values.pop();
      if (this.values.length > 0) {
        this.values[0] = last;
        this.bubbleDown(0);
      }
      return first;
    }
    bubbleUp(index) {
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (this.values[parent].priority <= this.values[index].priority) return;
        [this.values[parent], this.values[index]] = [this.values[index], this.values[parent]];
        index = parent;
      }
    }
    bubbleDown(index) {
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.values.length && this.values[left].priority < this.values[smallest].priority) {
          smallest = left;
        }
        if (right < this.values.length && this.values[right].priority < this.values[smallest].priority) {
          smallest = right;
        }
        if (smallest === index) return;
        [this.values[smallest], this.values[index]] = [this.values[index], this.values[smallest]];
        index = smallest;
      }
    }
  };
  var NavigationSystem = class {
    constructor(maxExpandedNodes = 2e4, travellerRadius = CHARACTER_BODY_RADIUS_METRES) {
      this.maxExpandedNodes = maxExpandedNodes;
      this.travellerRadius = travellerRadius;
    }
    findRoute(from, to, grid) {
      const start2 = grid.worldToCell(from);
      const goal = grid.worldToCell(to);
      if (grid.isBlocked(start2) || grid.isBlocked(goal)) return void 0;
      if (!isPositionClearWithClearance(grid, to, "movement", this.travellerRadius)) return void 0;
      if (this.canTravelDirectly(from, to, grid)) {
        return {
          cells: this.sameCell(start2, goal) ? [start2] : [start2, goal],
          waypoints: [{ ...to }],
          distance: Math.hypot(to.x - from.x, to.y - from.y)
        };
      }
      if (this.sameCell(start2, goal)) return void 0;
      if (this.isSmallDisconnectedGoalComponent(start2, goal, grid)) return void 0;
      const startKey = this.key(start2);
      const goalKey = this.key(goal);
      const startPriority = this.heuristic(start2, goal);
      const open = new MinPriorityQueue();
      open.push({ cell: start2, priority: startPriority });
      const openPriorities = /* @__PURE__ */ new Map([[startKey, startPriority]]);
      const cameFrom = /* @__PURE__ */ new Map();
      const gScore = /* @__PURE__ */ new Map([[startKey, 0]]);
      let expanded = 0;
      while (open.size > 0 && expanded < this.maxExpandedNodes) {
        const current = open.pop();
        if (!current) break;
        const currentKey = this.key(current.cell);
        const bestOpenPriority = openPriorities.get(currentKey);
        if (bestOpenPriority === void 0 || current.priority !== bestOpenPriority) {
          continue;
        }
        openPriorities.delete(currentKey);
        if (currentKey === goalKey) {
          const cells = this.reconstructCells(cameFrom, current.cell, start2);
          const rawWaypoints = cells.slice(1).map((cell) => grid.cellCentre(cell));
          if (rawWaypoints.length === 0 || !this.samePosition(rawWaypoints[rawWaypoints.length - 1], to)) {
            rawWaypoints.push({ ...to });
          }
          const waypoints = this.simplifyWaypoints(from, rawWaypoints, grid);
          if (!waypoints) return void 0;
          return {
            cells,
            waypoints,
            distance: this.routeDistance(from, waypoints)
          };
        }
        expanded++;
        const currentG = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY;
        for (const neighbour of this.neighbours(current.cell, grid)) {
          const neighbourKey = this.key(neighbour.cell);
          const tentativeG = currentG + neighbour.cost;
          if (tentativeG >= (gScore.get(neighbourKey) ?? Number.POSITIVE_INFINITY)) {
            continue;
          }
          cameFrom.set(neighbourKey, current.cell);
          gScore.set(neighbourKey, tentativeG);
          const priority = tentativeG + this.heuristic(neighbour.cell, goal);
          openPriorities.set(neighbourKey, priority);
          open.push({ cell: neighbour.cell, priority });
        }
      }
      return void 0;
    }
    /**
     * Finds somewhere the mover can stand while remaining within direct interaction
     * range of the target. The usual straight-line approach is tried first; only
     * when a barrier invalidates it do we sample alternate points around the target.
     */
    findApproachRoute(from, target, range, grid) {
      const safeRange = Math.max(0, range);
      const currentDistance = Math.hypot(target.x - from.x, target.y - from.y);
      if (currentDistance <= safeRange + 1e-6 && grid.isLineClear(from, target, "interaction")) {
        const route = this.findRoute(from, from, grid);
        return route ? { destination: { ...from }, route } : void 0;
      }
      const direct = this.directApproachPoint(from, target, safeRange);
      if (grid.isLineClear(direct, target, "interaction")) {
        const route = this.findRoute(from, direct, grid);
        if (route) return { destination: direct, route };
      }
      const radius = safeRange * APPROACH_RADIUS_MULTIPLIER;
      let best;
      for (let index = 0; index < APPROACH_SAMPLE_COUNT; index++) {
        const angle = Math.PI * 2 * index / APPROACH_SAMPLE_COUNT;
        const candidate = {
          x: target.x + Math.cos(angle) * radius,
          y: target.y + Math.sin(angle) * radius
        };
        if (!grid.isLineClear(candidate, target, "interaction")) continue;
        const route = this.findRoute(from, candidate, grid);
        if (!route) continue;
        if (!best || route.distance < best.route.distance) {
          best = { destination: candidate, route };
        }
      }
      if (best) return best;
      const targetRoute = this.findRoute(from, target, grid);
      return targetRoute ? { destination: { ...target }, route: targetRoute } : void 0;
    }
    canTravelDirectly(from, to, grid) {
      return isLineClearWithClearance(
        grid,
        from,
        to,
        "movement",
        this.travellerRadius
      );
    }
    directApproachPoint(from, target, range) {
      const dx = from.x - target.x;
      const dy = from.y - target.y;
      const distance10 = Math.hypot(dx, dy);
      if (distance10 <= range || distance10 === 0) return { ...from };
      const scale = range / distance10;
      return {
        x: target.x + dx * scale,
        y: target.y + dy * scale
      };
    }
    neighbours(cell, grid) {
      const neighbours = [];
      for (const [dx, dy, cost] of [
        [0, -1, CARDINAL_COST],
        [1, 0, CARDINAL_COST],
        [0, 1, CARDINAL_COST],
        [-1, 0, CARDINAL_COST],
        [1, -1, DIAGONAL_COST],
        [1, 1, DIAGONAL_COST],
        [-1, 1, DIAGONAL_COST],
        [-1, -1, DIAGONAL_COST]
      ]) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (!grid.canTraverseAdjacent(cell, next)) continue;
        neighbours.push({ cell: next, cost });
      }
      return neighbours;
    }
    /**
     * Cheaply proves that the goal sits inside a small component disconnected from
     * the start. The probe never declares failure merely because it reached its
     * budget; larger/open components always fall through to normal A*.
     */
    isSmallDisconnectedGoalComponent(start2, goal, grid) {
      const queue = [{ ...goal }];
      const visited = /* @__PURE__ */ new Set([this.key(goal)]);
      let nextIndex = 0;
      while (nextIndex < queue.length && visited.size < DISCONNECTED_GOAL_COMPONENT_PROBE_LIMIT) {
        const current = queue[nextIndex++];
        if (this.sameCell(current, start2)) return false;
        for (const neighbour of this.neighbours(current, grid)) {
          if (this.sameCell(neighbour.cell, start2)) return false;
          const neighbourKey = this.key(neighbour.cell);
          if (visited.has(neighbourKey)) continue;
          visited.add(neighbourKey);
          queue.push(neighbour.cell);
          if (visited.size >= DISCONNECTED_GOAL_COMPONENT_PROBE_LIMIT) {
            return false;
          }
        }
      }
      return nextIndex >= queue.length;
    }
    simplifyWaypoints(from, raw, grid) {
      if (raw.length === 0) return [];
      const simplified = [];
      let current = from;
      let index = 0;
      while (index < raw.length) {
        let furthest = -1;
        for (let candidate = raw.length - 1; candidate >= index; candidate--) {
          if (this.canTravelDirectly(current, raw[candidate], grid)) {
            furthest = candidate;
            break;
          }
        }
        if (furthest < 0) return void 0;
        simplified.push(raw[furthest]);
        current = raw[furthest];
        index = furthest + 1;
      }
      return simplified;
    }
    reconstructCells(cameFrom, goal, start2) {
      const cells = [{ ...goal }];
      let current = goal;
      while (!this.sameCell(current, start2)) {
        const previous = cameFrom.get(this.key(current));
        if (!previous) break;
        cells.push({ ...previous });
        current = previous;
      }
      cells.reverse();
      return cells;
    }
    routeDistance(from, waypoints) {
      let distance10 = 0;
      let previous = from;
      for (const waypoint of waypoints) {
        distance10 += Math.hypot(waypoint.x - previous.x, waypoint.y - previous.y);
        previous = waypoint;
      }
      return distance10;
    }
    heuristic(first, second) {
      const dx = Math.abs(first.x - second.x);
      const dy = Math.abs(first.y - second.y);
      const diagonal = Math.min(dx, dy);
      const straight = Math.max(dx, dy) - diagonal;
      return diagonal * DIAGONAL_COST + straight * CARDINAL_COST;
    }
    sameCell(first, second) {
      return first.x === second.x && first.y === second.y;
    }
    samePosition(first, second) {
      return Math.abs(first.x - second.x) <= 1e-9 && Math.abs(first.y - second.y) <= 1e-9;
    }
    key(cell) {
      return `${cell.x},${cell.y}`;
    }
  };

  // src/planning/PlanningEstimates.ts
  var navigation = new NavigationSystem();
  var MAX_TRAVEL_ESTIMATE_CACHE_ENTRIES = 256;
  var travelEstimateCaches = /* @__PURE__ */ new WeakMap();
  function estimateTravelDuration(context, target, stopDistance = 0) {
    if (!target) return void 0;
    return estimateTravelDurationBetween(
      context,
      context.character.position,
      target.position,
      stopDistance
    );
  }
  function isTravelTargetReachable(context, target, stopDistance = 0) {
    if (!target) return true;
    return estimateTravelDuration(context, target, stopDistance) !== void 0;
  }
  function estimateTravelDurationBetween(context, from, to, stopDistance = 0) {
    const movementSpeed = context.character.movementSpeed;
    if (movementSpeed <= 0) return void 0;
    const safeStopDistance = Math.max(0, stopDistance);
    const cache = travelEstimateCache(context, movementSpeed);
    const cacheKey = JSON.stringify([
      from.x,
      from.y,
      to.x,
      to.y,
      safeStopDistance
    ]);
    const cached = cache.entries.get(cacheKey);
    if (cached !== void 0) {
      return cached === null ? void 0 : cached;
    }
    const grid = context.character.navigationKnowledge.grid;
    const route = safeStopDistance > 0 ? navigation.findApproachRoute(from, to, safeStopDistance, grid)?.route : navigation.findRoute(from, to, grid);
    const duration = route ? route.distance / movementSpeed : void 0;
    rememberTravelEstimate(cache.entries, cacheKey, duration ?? null);
    return duration;
  }
  function travelEstimateCache(context, movementSpeed) {
    const navigationRevision = context.character.navigationKnowledge.grid.revision;
    const existing = travelEstimateCaches.get(context.character);
    if (existing && existing.navigationRevision === navigationRevision && existing.movementSpeed === movementSpeed) {
      return existing;
    }
    const created = {
      navigationRevision,
      movementSpeed,
      entries: /* @__PURE__ */ new Map()
    };
    travelEstimateCaches.set(context.character, created);
    return created;
  }
  function rememberTravelEstimate(entries, key, value) {
    if (entries.size >= MAX_TRAVEL_ESTIMATE_CACHE_ENTRIES) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== void 0) entries.delete(oldestKey);
    }
    entries.set(key, value);
  }

  // src/perception/Perception.ts
  var PERSON_PERCEPTION_PROFILE = {
    detectionRange: 30,
    recognitionRange: 15,
    identificationRange: 5
  };
  var DEFAULT_OBJECT_PERCEPTION_PROFILE = {
    detectionRange: 30,
    recognitionRange: 15,
    identificationRange: 5
  };
  var BUILDING_PERCEPTION_PROFILES = {
    small: { detectionRange: 60, recognitionRange: 40, identificationRange: 15 },
    medium: { detectionRange: 100, recognitionRange: 65, identificationRange: 20 },
    large: { detectionRange: 150, recognitionRange: 100, identificationRange: 30 }
  };
  var Perception = class {
    constructor(detectionRange = PERSON_PERCEPTION_PROFILE.detectionRange, recognitionRange = PERSON_PERCEPTION_PROFILE.recognitionRange, identificationRange = PERSON_PERCEPTION_PROFILE.identificationRange) {
      this.detectionRange = detectionRange;
      this.recognitionRange = recognitionRange;
      this.identificationRange = identificationRange;
      this.observationIds = /* @__PURE__ */ new Map();
      this.objectObservationIds = /* @__PURE__ */ new Map();
      this.nextObservationId = 1;
      this.nextObjectObservationId = 1;
    }
    observe(observer, subject, time, visibilityMultiplier = 1) {
      if (observer.id === subject.id) {
        return void 0;
      }
      const trackingKey = this.trackingKey(observer.id, subject.id);
      const distance10 = this.distanceBetween(observer.position, subject.position);
      const multiplier = normalizeVisibilityMultiplier(visibilityMultiplier);
      if (distance10 > this.detectionRange * multiplier) {
        this.observationIds.delete(trackingKey);
        return void 0;
      }
      let level = "detection";
      if (distance10 <= this.recognitionRange * multiplier) {
        level = "recognition";
      }
      if (distance10 <= this.identificationRange * multiplier && observer.knownPeople.has(subject.id)) {
        level = "identification";
      }
      return {
        observerId: observer.id,
        observationId: this.getObservationId(trackingKey, observer.id),
        subjectId: level === "identification" ? subject.id : void 0,
        level,
        position: { ...subject.position },
        distance: distance10,
        observedAt: time
      };
    }
    observeObject(observer, object, time, visibilityMultiplier = 1) {
      const distance10 = this.distanceBetween(observer.position, object.position);
      const profile = this.objectPerceptionProfile(object);
      const multiplier = normalizeVisibilityMultiplier(visibilityMultiplier);
      if (distance10 > profile.detectionRange * multiplier) {
        return void 0;
      }
      let level = "detection";
      if (distance10 <= profile.recognitionRange * multiplier) {
        level = "recognition";
      }
      if (distance10 <= profile.identificationRange * multiplier) {
        level = "identification";
      }
      const trackingKey = this.trackingKey(observer.id, object.id);
      return {
        observerId: observer.id,
        observationId: this.getObjectObservationId(trackingKey, observer.id),
        objectId: object.id,
        kind: object.kind,
        visualSize: object.visualSize,
        recognisablePlaceType: object.recognisablePlaceType,
        recognisableServices: object.recognisableServices,
        hasAdvertisedServiceOfferings: level !== "detection" && (object.advertisedServiceOfferings?.length ?? 0) > 0,
        advertisedServiceOfferings: level === "identification" ? object.advertisedServiceOfferings?.map(cloneServiceOfferingDescriptor) : void 0,
        advertisedServiceHours: level === "identification" ? object.advertisedServiceHours?.map((descriptor) => ({
          service: descriptor.service,
          windows: descriptor.windows.map((window) => ({ ...window }))
        })) : void 0,
        servicePoint: object.servicePoint,
        servicePointState: object.servicePoint?.state,
        level,
        position: { ...object.position },
        distance: distance10,
        observedAt: time,
        displayedForSale: object.displayedForSale === true
      };
    }
    objectPerceptionProfile(object) {
      if (object.kind !== "building") return DEFAULT_OBJECT_PERCEPTION_PROFILE;
      return BUILDING_PERCEPTION_PROFILES[object.visualSize ?? "small"];
    }
    getObservationId(trackingKey, observerId) {
      const existing = this.observationIds.get(trackingKey);
      if (existing) return existing;
      const observationId = `${observerId}-observed-person-${this.nextObservationId++}`;
      this.observationIds.set(trackingKey, observationId);
      return observationId;
    }
    getObjectObservationId(trackingKey, observerId) {
      const existing = this.objectObservationIds.get(trackingKey);
      if (existing) return existing;
      const observationId = `${observerId}-observed-place-${this.nextObjectObservationId++}`;
      this.objectObservationIds.set(trackingKey, observationId);
      return observationId;
    }
    trackingKey(observerId, subjectId) {
      return `${observerId}:${subjectId}`;
    }
    distanceBetween(first, second) {
      return Math.hypot(second.x - first.x, second.y - first.y);
    }
  };
  function cloneServiceOfferingDescriptor(descriptor) {
    return {
      service: descriptor.service,
      offering: descriptor.offering,
      ...descriptor.itemType !== void 0 ? { itemType: descriptor.itemType } : {},
      ...descriptor.foodKind !== void 0 ? { foodKind: descriptor.foodKind } : {},
      ...descriptor.terms !== void 0 ? {
        terms: {
          ...descriptor.terms.price !== void 0 ? { price: descriptor.terms.price } : {},
          ...descriptor.terms.expectedDuration !== void 0 ? { expectedDuration: descriptor.terms.expectedDuration } : {},
          ...descriptor.terms.effects !== void 0 ? {
            effects: { ...descriptor.terms.effects }
          } : {}
        }
      } : {}
    };
  }
  function normalizeVisibilityMultiplier(value) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Visibility multiplier must be a non-negative finite number.");
    }
    return value;
  }

  // src/planning/PersonSearch.ts
  var PERSON_SEARCH_RETRY_MINUTES = 30;
  var PERSON_SEARCH_MEMORY_PERSISTENCE = 180;
  var PERSON_SEARCH_HISTORY_MINUTES = 360;
  var PERSON_SEARCH_BASE_DISTANCE = PERSON_PERCEPTION_PROFILE.detectionRange * 0.8;
  var PERSON_SEARCH_MAX_DISTANCE = PERSON_SEARCH_BASE_DISTANCE * 3;
  var PERSON_SEARCH_LEGS = 3;
  var PLACE_SEARCH_RETRY_MINUTES = 360;
  var DIRECTIONS = [
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 0, y: 1 }
  ];
  function canSearchForPerson(character, time) {
    const recentSearchTimes = [
      ...character.memory.getByType("area-searched").filter((memory) => memory.context?.purpose === "person").map((memory) => memory.lastObservedAt),
      ...character.memory.getByType("person-search-attempt").filter((memory) => memory.context?.purpose === "person").map((memory) => memory.lastObservedAt)
    ];
    const mostRecent = recentSearchTimes.length > 0 ? Math.max(...recentSearchTimes) : void 0;
    return mostRecent === void 0 || time - mostRecent >= PERSON_SEARCH_RETRY_MINUTES;
  }
  function selectPersonSearchPlaceLead(character, time) {
    const searchedPlaceIds = new Set(
      character.memory.getByType("place-searched").filter((memory) => memory.context?.purpose === "person").filter((memory) => time - memory.lastObservedAt < PLACE_SEARCH_RETRY_MINUTES).map((memory) => memory.context?.placeObservationId).filter((value) => typeof value === "string")
    );
    const candidates = character.memory.getByType("place-observed").filter((memory) => !searchedPlaceIds.has(memory.subjectId)).map((memory) => {
      const position = memory.context?.position;
      if (!isPosition(position)) return void 0;
      const knownPlaceId = memory.context?.knownPlaceId;
      if (typeof knownPlaceId === "string" && knownPlaceId === character.homeId) {
        return void 0;
      }
      const visualSize = memory.context?.visualSize;
      const sizeScore = visualSize === "large" ? 80 : visualSize === "medium" ? 40 : 15;
      const recognisedBuildingScore = memory.context?.recognisedKind === "building" ? 30 : 0;
      const noveltyScore = typeof knownPlaceId === "string" ? 0 : 20;
      const distance10 = Math.hypot(
        position.x - character.position.x,
        position.y - character.position.y
      );
      const score = sizeScore + recognisedBuildingScore + noveltyScore + memory.confidence * 10 - distance10 * 0.1;
      return {
        observationId: memory.subjectId,
        position: { ...position },
        score
      };
    }).filter((candidate) => candidate !== void 0).sort((first, second) => second.score - first.score);
    return candidates[0];
  }
  function createPersonSearchPattern(character, time, origin = character.position) {
    const recentSearches = [
      ...character.memory.getByType("area-searched"),
      ...character.memory.getByType("person-search-attempt")
    ].filter((memory) => memory.context?.purpose === "person").filter((memory) => time - memory.lastObservedAt <= PERSON_SEARCH_HISTORY_MINUTES);
    const highestPreviousIndex = recentSearches.reduce((highest, memory) => {
      const value = memory.context?.searchIndex;
      return typeof value === "number" && Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, -1);
    const searchIndex = highestPreviousIndex + 1;
    const lead = selectPersonSearchPlaceLead(character, time);
    if (lead) {
      const dx = lead.position.x - origin.x;
      const dy = lead.position.y - origin.y;
      const distanceToLead = Math.hypot(dx, dy);
      if (distanceToLead > 0.1) {
        const radius2 = Math.min(PERSON_SEARCH_BASE_DISTANCE, distanceToLead);
        const unitX = dx / distanceToLead;
        const unitY = dy / distanceToLead;
        const waypoints2 = Array.from({ length: PERSON_SEARCH_LEGS }, (_, index) => {
          const distance10 = radius2 * ((index + 1) / PERSON_SEARCH_LEGS);
          return {
            x: origin.x + unitX * distance10,
            y: origin.y + unitY * distance10
          };
        });
        return {
          searchIndex,
          origin: { ...origin },
          waypoints: waypoints2,
          radius: radius2,
          strategy: "environmental-lead",
          leadObservationId: lead.observationId,
          leadPosition: { ...lead.position }
        };
      }
    }
    const direction = DIRECTIONS[searchIndex % DIRECTIONS.length];
    const spiralStep = Math.floor(searchIndex / 2) + 1;
    const radius = Math.min(PERSON_SEARCH_MAX_DISTANCE, PERSON_SEARCH_BASE_DISTANCE * spiralStep);
    const waypoints = Array.from({ length: PERSON_SEARCH_LEGS }, (_, index) => {
      const distance10 = radius * ((index + 1) / PERSON_SEARCH_LEGS);
      return {
        x: origin.x + direction.x * distance10,
        y: origin.y + direction.y * distance10
      };
    });
    return {
      searchIndex,
      origin: { ...origin },
      waypoints,
      radius,
      strategy: "frontier"
    };
  }
  function rememberBlockedPersonSearch(character, time, pattern, attemptedWaypoint) {
    character.memory.remember({
      id: `${character.id}:person-search-attempt:${time}:${pattern.searchIndex}`,
      type: "person-search-attempt",
      subjectId: `person-search:${time}:${pattern.searchIndex}`,
      persistence: PERSON_SEARCH_MEMORY_PERSISTENCE,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 0.4,
      context: {
        purpose: "person",
        searchIndex: pattern.searchIndex,
        strategy: pattern.strategy,
        reason: "unreachable",
        origin: { ...pattern.origin },
        attemptedWaypoint: { ...attemptedWaypoint },
        leadObservationId: pattern.leadObservationId
      }
    });
  }
  function rememberFailedPersonSearch(character, time, pattern) {
    const end = pattern.waypoints[pattern.waypoints.length - 1] ?? pattern.origin;
    character.memory.remember({
      id: `${character.id}:person-search:${time}:${pattern.searchIndex}`,
      type: "area-searched",
      subjectId: `person-search:${time}:${pattern.searchIndex}`,
      persistence: PERSON_SEARCH_MEMORY_PERSISTENCE,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 0.5,
      context: {
        purpose: "person",
        searchIndex: pattern.searchIndex,
        strategy: pattern.strategy,
        center: { ...end },
        radius: pattern.radius,
        origin: { ...pattern.origin },
        end: { ...end },
        leadObservationId: pattern.leadObservationId
      }
    });
    if (pattern.leadObservationId && pattern.leadPosition && Math.hypot(end.x - pattern.leadPosition.x, end.y - pattern.leadPosition.y) <= 0.1) {
      character.memory.remember({
        id: `${character.id}:place-search:${pattern.leadObservationId}:${time}`,
        type: "place-searched",
        subjectId: `${pattern.leadObservationId}:person`,
        persistence: PERSON_SEARCH_MEMORY_PERSISTENCE,
        confidence: 1,
        createdAt: time,
        lastObservedAt: time,
        importance: 0.5,
        context: {
          purpose: "person",
          placeObservationId: pattern.leadObservationId,
          position: { ...pattern.leadPosition }
        }
      });
    }
  }
  function isPosition(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  }

  // src/planning/KnowledgePlans.ts
  function knowledgeGoal(query) {
    return {
      type: "knowsKnowledge",
      parameters: knowledgeQueryParameters(query)
    };
  }
  var knowledgePlans = [
    {
      id: "ask-knowledge",
      name: "Ask Person",
      achieves: { type: "knowsKnowledge" },
      prerequisites: [],
      getPrerequisites: (goal) => [{
        type: "withinConversationRange",
        parameters: goal.parameters ? { ...goal.parameters } : void 0
      }],
      duration: 10,
      risk: 5,
      cost: 0
    },
    {
      id: "go-to-conversation-range",
      name: "Go To Conversation Range",
      achieves: { type: "withinConversationRange" },
      prerequisites: [],
      getPrerequisites: (goal) => [{
        type: "hasPerson",
        parameters: goal.parameters ? { ...goal.parameters } : void 0
      }],
      duration: 0,
      risk: 0,
      cost: 0,
      isTargetAvailable: (_goal, context, target) => isTravelTargetReachable(context, target, CONVERSATION_RANGE_METRES),
      estimate: (_goal, context, target) => ({
        duration: estimateTravelDuration(context, target, CONVERSATION_RANGE_METRES)
      })
    },
    {
      id: "search-for-person",
      name: "Search For Person",
      achieves: { type: "hasPerson" },
      prerequisites: [],
      duration: 15,
      risk: 1,
      cost: 0,
      isAvailable: (context) => context.character.movementSpeed > 0 && canSearchForPerson(context.character, context.time),
      estimate: (_goal, context) => ({
        // Searching is exploratory movement rather than travel to a known safe
        // destination. Only worlds that explicitly model outdoor darkness add
        // the night risk; isolated planner tests remain environmentally neutral.
        risk: 1 + (context.environment?.outdoorDarkness ? outdoorExplorationRisk(context.minuteOfDay ?? 0) : 0)
      })
    }
  ];

  // src/activities/ProcessingDemandActivity.ts
  var MINUTES_PER_DAY12 = 24 * 60;

  // src/world/Mill.ts
  var DEFAULT_MILL_WIDTH_METRES = 8;
  var DEFAULT_MILL_HEIGHT_METRES = 6;
  function millRoomIds(millId) {
    return { workroom: `${millId}-workroom`, reception: `${millId}-reception` };
  }
  function millstoneId(millId) {
    return `${millId}-millstone`;
  }
  function createMill(options) {
    const origin = {
      x: Math.floor(options.position.x) - Math.floor(DEFAULT_MILL_WIDTH_METRES / 2),
      y: Math.floor(options.position.y) - Math.floor(DEFAULT_MILL_HEIGHT_METRES / 2)
    };
    const ids = millRoomIds(options.id);
    const frontDoorId = `${options.id}-front-door`;
    const workroomDoorId = `${options.id}-workroom-door`;
    const workroom = room3(ids.workroom, options.id, origin, 4, 6, "private");
    const reception = room3(ids.reception, options.id, { x: origin.x + 4, y: origin.y }, 4, 6, "public");
    const internalPartitions = [{
      origin: { x: origin.x + 3, y: origin.y },
      side: "east",
      length: 6,
      doors: [{ id: workroomDoorId, offset: 3, state: "open" }]
    }];
    const workCentre = roomCentre(workroom);
    return {
      id: options.id,
      kind: "building",
      visualSize: "medium",
      recognisablePlaceType: "mill",
      recognisableServices: ["milling"],
      advertisedServiceOfferings: [{
        service: "milling",
        offering: "grain-milling",
        itemCategory: "grain"
      }],
      advertisedServiceHours: options.advertisedServiceHours?.map((descriptor) => ({
        service: descriptor.service,
        windows: descriptor.windows.map((window) => ({ ...window }))
      })),
      position: { ...options.position },
      ownerId: options.ownerId,
      physicalFootprint: {
        origin,
        width: DEFAULT_MILL_WIDTH_METRES,
        height: DEFAULT_MILL_HEIGHT_METRES,
        doors: [{ id: frontDoorId, side: options.frontDoorSide, offset: 3, state: "open" }]
      },
      physicalRooms: [workroom, reception],
      internalPartitions,
      fixtures: [createFacility({
        id: millstoneId(options.id),
        type: "millstone",
        placeId: options.id,
        roomId: workroom.id,
        position: workCentre,
        actionPointPosition: workCentre,
        physicalObstruction: {
          origin: { x: Math.floor(workCentre.x) - 1, y: Math.floor(workCentre.y) },
          width: 1,
          height: 1
        }
      })]
    };
  }
  function room3(id, placeId, origin, width, height, access) {
    return { id, placeId, access, area: { origin: { ...origin }, width, height } };
  }

  // src/scenarios/DefaultMill.ts
  var DEFAULT_MILL_ID = "village-mill";
  var DEFAULT_MILL_SERVICE_POINT_ID = "village-mill-counter";
  var DEFAULT_MILLING_SERVICE_PRICE = 1;
  var DEFAULT_MILLING_SERVICE_MINUTES = 30;
  var DEFAULT_MILL_SERVICE_HOURS = [{
    service: "milling",
    windows: [{ startMinuteOfDay: 8 * 60, endMinuteOfDay: 17 * 60 }]
  }];
  function createDefaultMillWorkplace(world2, layout, miller) {
    const site = layout.millSite;
    const mill = createMill({
      id: DEFAULT_MILL_ID,
      ownerId: miller.id,
      position: { ...site.position },
      frontDoorSide: site.frontDoorSide,
      advertisedServiceHours: DEFAULT_MILL_SERVICE_HOURS
    });
    const servicePoint = createServicePoint({
      id: DEFAULT_MILL_SERVICE_POINT_ID,
      placeId: mill.id,
      services: ["milling"],
      providerPosition: { ...site.serviceProviderPosition },
      customerPosition: { ...site.serviceCustomerPosition },
      ownerId: miller.id,
      initialState: "open"
    });
    world2.addObject(mill);
    world2.addObject(servicePoint);
    const operationActivityId = "bob-mill-operation";
    miller.addActivity(new ServicePointOperationActivity({
      id: operationActivityId,
      name: "Operate Village Mill",
      servicePointId: servicePoint.id,
      providerPosition: { ...site.serviceProviderPosition },
      opensAt: 8 * 60,
      closesAt: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open",
      staffingMode: "on-demand"
    }));
    miller.addActivitySchedule({
      id: "bob-mill-availability",
      activityId: operationActivityId,
      schedule: new DailySchedule(8 * 60, 17 * 60),
      priorityBoost: 0,
      mealBreaks: [{
        id: "midday-main-meal",
        name: "Midday main meal",
        startMinuteOfDay: 12 * 60,
        endMinuteOfDay: 13 * 60,
        mealSize: "main",
        priority: 52
      }]
    });
    miller.addActivity(new MaterialProcessingServiceActivity({
      id: "bob-grain-milling",
      name: "Mill Customer Grain",
      service: "milling",
      offering: "grain-milling",
      inputItemCategory: "grain",
      inputCount: 1,
      outputItemType: "flour",
      outputCount: 1,
      price: DEFAULT_MILLING_SERVICE_PRICE,
      expectedDuration: DEFAULT_MILLING_SERVICE_MINUTES,
      workActionPointId: facilityActionPointId(millstoneId(mill.id)),
      workPosition: { ...site.workPosition },
      returnActionPointId: serviceCustomerActionPointId(servicePoint.id),
      returnPosition: { ...site.serviceCustomerPosition },
      activeFrom: 8 * 60,
      activeUntil: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay
    }));
    miller.addKnowledge({
      type: "service-place",
      subjectId: mill.id,
      polarity: "positive",
      position: { ...site.position },
      context: { service: "milling" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    miller.addKnowledge({
      type: "service-hours",
      subjectId: mill.id,
      polarity: "positive",
      context: {
        service: "milling",
        hours: DEFAULT_MILL_SERVICE_HOURS[0].windows.map((window) => ({ ...window }))
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    miller.addKnowledge({
      type: "service-provider",
      subjectId: miller.id,
      polarity: "positive",
      context: {
        service: "milling",
        placeId: mill.id,
        offering: "grain-milling",
        itemCategory: "grain",
        terms: {
          price: DEFAULT_MILLING_SERVICE_PRICE,
          expectedDuration: DEFAULT_MILLING_SERVICE_MINUTES
        }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    return { miller, mill, servicePoint };
  }

  // src/agriculture/AgricultureSystem.ts
  function tileKey(x, y) {
    return `${x},${y}`;
  }
  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
      const a = polygon[current];
      const b = polygon[previous];
      const crosses = a.y > point.y !== b.y > point.y && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }
  var NEXT_ROTATION = {
    "winter-crop": "fallow",
    "spring-crop": "winter-crop",
    fallow: "spring-crop"
  };
  var DAILY_WEED_GROWTH = {
    fallow: 0,
    bare: 0,
    ploughed: 0.05,
    sown: 0.04,
    growing: 0.05,
    ripe: 0.02,
    harvested: 0.03
  };
  var MAX_WEED_YIELD_PENALTY = 0.5;
  var AgricultureSystem = class {
    constructor(cropDefinitions = DEFAULT_CROP_DEFINITIONS) {
      this.fields = /* @__PURE__ */ new Map();
      this.strips = /* @__PURE__ */ new Map();
      this.tiles = /* @__PURE__ */ new Map();
      this.crops = /* @__PURE__ */ new Map();
      for (const definition of cropDefinitions) {
        if (this.crops.has(definition.kind)) {
          throw new Error(`Crop definition ${definition.kind} is duplicated.`);
        }
        if (!Number.isFinite(definition.growthMinutes) || definition.growthMinutes <= 0) {
          throw new Error(`Crop ${definition.kind} requires a positive growth duration.`);
        }
        if (!Number.isFinite(definition.yieldPerTile) || definition.yieldPerTile <= 0) {
          throw new Error(`Crop ${definition.kind} requires a positive tile yield.`);
        }
        this.crops.set(definition.kind, { ...definition });
      }
    }
    registerField(definition) {
      if (this.fields.has(definition.id)) {
        throw new Error(`Agricultural field ${definition.id} already exists.`);
      }
      if (definition.boundary.length < 3) {
        throw new Error(`Agricultural field ${definition.id} requires a polygon boundary.`);
      }
      const orientation = definition.stripOrientation ?? "north-south";
      const xs = definition.boundary.map((point) => point.x);
      const ys = definition.boundary.map((point) => point.y);
      const minX = Math.floor(Math.min(...xs));
      const maxX = Math.ceil(Math.max(...xs)) - 1;
      const minY = Math.floor(Math.min(...ys));
      const maxY = Math.ceil(Math.max(...ys)) - 1;
      const cellsByStrip = /* @__PURE__ */ new Map();
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!pointInPolygon({ x: x + 0.5, y: y + 0.5 }, definition.boundary)) continue;
          const key = tileKey(x, y);
          if (this.tiles.has(key)) {
            throw new Error(`Agricultural fields overlap at ${key}.`);
          }
          const stripCoordinate = orientation === "north-south" ? x : y;
          const cells = cellsByStrip.get(stripCoordinate) ?? [];
          cells.push({ x, y });
          cellsByStrip.set(stripCoordinate, cells);
        }
      }
      const stripIds = [];
      const sortedStripCoordinates = [...cellsByStrip.keys()].sort((a, b) => a - b);
      for (const [index, stripCoordinate] of sortedStripCoordinates.entries()) {
        const stripId = `${definition.id}-strip-${String(index + 1).padStart(2, "0")}`;
        const coordinates = cellsByStrip.get(stripCoordinate);
        coordinates.sort((a, b) => orientation === "north-south" ? a.y - b.y : a.x - b.x);
        const strip = {
          id: stripId,
          fieldId: definition.id,
          index,
          tiles: coordinates.map((coordinate) => ({ ...coordinate }))
        };
        this.strips.set(stripId, strip);
        stripIds.push(stripId);
        for (const coordinate of coordinates) {
          const tile = {
            ...coordinate,
            fieldId: definition.id,
            stripId,
            state: definition.rotation === "fallow" ? "fallow" : "bare",
            growth: 0,
            weedLevel: 0,
            fertility: 1
          };
          this.tiles.set(tileKey(tile.x, tile.y), tile);
        }
      }
      const field = {
        id: definition.id,
        name: definition.name,
        boundary: definition.boundary.map((point) => ({ ...point })),
        rotation: definition.rotation,
        stripOrientation: orientation,
        stripIds
      };
      this.fields.set(field.id, field);
      return field;
    }
    getField(id) {
      return this.fields.get(id);
    }
    getFields() {
      return [...this.fields.values()];
    }
    getStrip(id) {
      return this.strips.get(id);
    }
    getCropDefinition(kind) {
      return this.crops.get(kind);
    }
    getStripsForField(fieldId) {
      const field = this.fields.get(fieldId);
      if (!field) return [];
      return field.stripIds.map((stripId) => this.strips.get(stripId)).filter((strip) => strip !== void 0);
    }
    getStripsForHousehold(householdId) {
      return [...this.strips.values()].filter((strip) => strip.tenantHouseholdId === householdId);
    }
    setStripTenant(stripId, householdId) {
      const strip = this.strips.get(stripId);
      if (!strip) throw new Error(`Agricultural strip ${stripId} does not exist.`);
      if (householdId) strip.tenantHouseholdId = householdId;
      else delete strip.tenantHouseholdId;
    }
    /**
     * Distributes neighbouring one-metre strips between households in a repeating
     * pattern. Each field uses a different offset so each household's holding is
     * scattered through all three open fields instead of forming one private block.
     */
    assignScatteredTenancies(fieldIds, householdIds) {
      if (fieldIds.length === 0) throw new Error("Field tenancy requires at least one field.");
      if (householdIds.length === 0) throw new Error("Field tenancy requires at least one household.");
      if (new Set(householdIds).size !== householdIds.length) {
        throw new Error("Field tenancy household ids must be unique.");
      }
      fieldIds.forEach((fieldId, fieldIndex) => {
        const strips = this.getStripsForField(fieldId);
        if (strips.length === 0) throw new Error(`Agricultural field ${fieldId} has no strips.`);
        const offset = fieldIndex % householdIds.length;
        strips.forEach((strip, stripIndex) => {
          strip.tenantHouseholdId = householdIds[(stripIndex + offset) % householdIds.length];
        });
      });
    }
    canPloughTile(x, y) {
      const tile = this.getTile(x, y);
      if (!tile) return false;
      const field = this.fields.get(tile.fieldId);
      return field !== void 0 && field.rotation !== "fallow" && tile.state !== "fallow" && (tile.state === "bare" || tile.state === "harvested");
    }
    canSowTile(x, y, crop) {
      const tile = this.getTile(x, y);
      if (!tile || tile.state !== "ploughed") return false;
      const field = this.fields.get(tile.fieldId);
      const definition = this.crops.get(crop);
      return field !== void 0 && definition !== void 0 && field.rotation === definition.preferredRotation;
    }
    canHoeTile(x, y) {
      const tile = this.getTile(x, y);
      return tile !== void 0 && tile.weedLevel > 0 && (tile.state === "ploughed" || tile.state === "sown" || tile.state === "growing");
    }
    canHarvestTile(x, y) {
      const tile = this.getTile(x, y);
      return tile !== void 0 && tile.state === "ripe" && tile.crop !== void 0;
    }
    /** Completion effect for a finished ploughing action. */
    ploughTile(x, y, workedAt) {
      const tile = this.requireTile(x, y);
      const field = this.requireField(tile.fieldId);
      if (field.rotation === "fallow" || tile.state === "fallow") {
        throw new Error(`Agricultural tile ${x},${y} is fallow and cannot be ploughed for a crop.`);
      }
      if (tile.state !== "bare" && tile.state !== "harvested") {
        throw new Error(`Agricultural tile ${x},${y} must be bare or harvested before ploughing.`);
      }
      tile.state = "ploughed";
      tile.growth = 0;
      tile.weedLevel = 0;
      tile.lastWorkedAt = workedAt;
      delete tile.crop;
      delete tile.plantedAt;
      return tile;
    }
    /** Completion effect for a finished sowing action. */
    sowTile(x, y, crop, plantedAt) {
      const tile = this.requireTile(x, y);
      if (tile.state !== "ploughed") {
        throw new Error(`Agricultural tile ${x},${y} must be ploughed before sowing.`);
      }
      const field = this.requireField(tile.fieldId);
      const definition = this.requireCrop(crop);
      if (field.rotation !== definition.preferredRotation) {
        throw new Error(`${crop} belongs in ${definition.preferredRotation}, not ${field.rotation}.`);
      }
      tile.state = "sown";
      tile.crop = crop;
      tile.growth = 0;
      tile.plantedAt = plantedAt;
      tile.lastWorkedAt = plantedAt;
      return tile;
    }
    /** Completion effect for a finished maintenance/hoeing action. */
    hoeTile(x, y, workedAt) {
      const tile = this.requireTile(x, y);
      if (!this.canHoeTile(x, y)) {
        throw new Error(`Agricultural tile ${x},${y} has no maintainable weeds.`);
      }
      tile.weedLevel = 0;
      tile.lastWorkedAt = workedAt;
      return tile;
    }
    /** Completion effect for a finished harvesting action. */
    harvestTile(x, y, workedAt) {
      const tile = this.requireTile(x, y);
      if (tile.state !== "ripe" || !tile.crop) {
        throw new Error(`Agricultural tile ${x},${y} must contain a ripe crop before harvesting.`);
      }
      const definition = this.requireCrop(tile.crop);
      const crop = tile.crop;
      const weedLevel = tile.weedLevel;
      const yieldMultiplier = 1 - weedLevel * MAX_WEED_YIELD_PENALTY;
      tile.state = "harvested";
      tile.growth = 1;
      tile.lastWorkedAt = workedAt;
      return {
        fieldId: tile.fieldId,
        stripId: tile.stripId,
        x: tile.x,
        y: tile.y,
        crop,
        itemType: definition.harvestedItemType,
        quantity: definition.yieldPerTile * yieldMultiplier,
        weedLevel,
        yieldMultiplier
      };
    }
    /** Daily biological update for crop growth and weed pressure. */
    update(currentTime) {
      for (const tile of this.tiles.values()) {
        tile.weedLevel = Math.min(1, tile.weedLevel + DAILY_WEED_GROWTH[tile.state]);
        if (tile.state !== "sown" && tile.state !== "growing" || !tile.crop || tile.plantedAt === void 0) {
          continue;
        }
        const definition = this.requireCrop(tile.crop);
        const elapsed = Math.max(0, currentTime - tile.plantedAt);
        tile.growth = Math.min(1, elapsed / definition.growthMinutes);
        if (tile.growth >= 1) tile.state = "ripe";
        else if (tile.growth > 0) tile.state = "growing";
        else tile.state = "sown";
      }
    }
    /**
     * Advances one complete three-field cycle step while preserving tenancy and
     * soil fertility. Crop occupancy is reset ready for the next agricultural year.
     */
    advanceThreeFieldRotation(fieldIds) {
      if (fieldIds.length !== 3 || new Set(fieldIds).size !== 3) {
        throw new Error("Three-field rotation requires exactly three distinct fields.");
      }
      const fields = fieldIds.map((fieldId) => {
        const field = this.fields.get(fieldId);
        if (!field) throw new Error(`Agricultural field ${fieldId} does not exist.`);
        return field;
      });
      const rotations = new Set(fields.map((field) => field.rotation));
      if (rotations.size !== 3) {
        throw new Error("Three-field rotation requires one winter, one spring and one fallow field.");
      }
      for (const field of fields) {
        field.rotation = NEXT_ROTATION[field.rotation];
        for (const tile of this.tilesForField(field.id)) {
          tile.state = field.rotation === "fallow" ? "fallow" : "bare";
          tile.growth = 0;
          tile.weedLevel = 0;
          delete tile.crop;
          delete tile.plantedAt;
          delete tile.lastWorkedAt;
        }
      }
    }
    getTile(x, y) {
      return this.tiles.get(tileKey(x, y));
    }
    tilesForField(fieldId) {
      return [...this.tiles.values()].filter((tile) => tile.fieldId === fieldId);
    }
    tilesForStrip(stripId) {
      const strip = this.strips.get(stripId);
      if (!strip) return [];
      return strip.tiles.map((coordinate) => this.getTile(coordinate.x, coordinate.y)).filter((tile) => tile !== void 0);
    }
    requireTile(x, y) {
      const tile = this.getTile(x, y);
      if (!tile) throw new Error(`Agricultural tile ${x},${y} does not exist.`);
      return tile;
    }
    requireField(fieldId) {
      const field = this.fields.get(fieldId);
      if (!field) throw new Error(`Agricultural field ${fieldId} does not exist.`);
      return field;
    }
    requireCrop(kind) {
      const definition = this.crops.get(kind);
      if (!definition) throw new Error(`Crop ${kind} has no registered definition.`);
      return definition;
    }
  };

  // src/navigation/RectangularFootprint.ts
  function applyRectangularFootprint(grid, footprint) {
    validateFootprint(footprint);
    const { origin, width, height } = footprint;
    for (let x = 0; x < width; x++) {
      grid.setWall({ x: origin.x + x, y: origin.y }, "north");
      grid.setWall({ x: origin.x + x, y: origin.y + height - 1 }, "south");
    }
    for (let y = 0; y < height; y++) {
      grid.setWall({ x: origin.x, y: origin.y + y }, "west");
      grid.setWall({ x: origin.x + width - 1, y: origin.y + y }, "east");
    }
    for (const door of footprint.doors ?? []) {
      const boundary = doorBoundary(footprint, door);
      grid.setDoor(
        boundary.cell,
        boundary.direction,
        door.id,
        door.state ?? "open",
        door.barredFromInside ? boundary.cell : void 0
      );
    }
  }
  function validateFootprint(footprint) {
    if (!Number.isInteger(footprint.origin.x) || !Number.isInteger(footprint.origin.y)) {
      throw new Error("Physical footprint origin must use integer grid coordinates.");
    }
    if (!Number.isInteger(footprint.width) || footprint.width <= 0) {
      throw new Error("Physical footprint width must be a positive integer number of metres.");
    }
    if (!Number.isInteger(footprint.height) || footprint.height <= 0) {
      throw new Error("Physical footprint height must be a positive integer number of metres.");
    }
    const seenDoorIds = /* @__PURE__ */ new Set();
    for (const door of footprint.doors ?? []) {
      if (!door.id) throw new Error("Physical footprint doors require an id.");
      if (seenDoorIds.has(door.id)) {
        throw new Error(`Duplicate physical footprint door id ${door.id}.`);
      }
      seenDoorIds.add(door.id);
      const sideLength = door.side === "north" || door.side === "south" ? footprint.width : footprint.height;
      if (!Number.isInteger(door.offset) || door.offset < 0 || door.offset >= sideLength) {
        throw new Error(`Door ${door.id} offset is outside the ${door.side} side.`);
      }
    }
  }
  function doorBoundary(footprint, door) {
    const { origin, width, height } = footprint;
    switch (door.side) {
      case "north":
        return {
          cell: { x: origin.x + door.offset, y: origin.y },
          direction: "north"
        };
      case "south":
        return {
          cell: { x: origin.x + door.offset, y: origin.y + height - 1 },
          direction: "south"
        };
      case "west":
        return {
          cell: { x: origin.x, y: origin.y + door.offset },
          direction: "west"
        };
      case "east":
        return {
          cell: { x: origin.x + width - 1, y: origin.y + door.offset },
          direction: "east"
        };
    }
  }

  // src/navigation/WallPartition.ts
  function applyWallPartition(grid, partition) {
    validatePartition(partition);
    const doorsByOffset = new Map((partition.doors ?? []).map((door) => [door.offset, door]));
    for (let offset = 0; offset < partition.length; offset++) {
      const cell = partitionCell(partition, offset);
      const door = doorsByOffset.get(offset);
      if (!door) {
        grid.setWall(cell, partition.side);
        continue;
      }
      grid.setDoor(
        cell,
        partition.side,
        door.id,
        door.state ?? "open",
        door.barredFromInside ? cell : void 0
      );
    }
  }
  function partitionCell(partition, offset) {
    const horizontal = partition.side === "north" || partition.side === "south";
    return horizontal ? { x: partition.origin.x + offset, y: partition.origin.y } : { x: partition.origin.x, y: partition.origin.y + offset };
  }
  function validatePartition(partition) {
    if (!Number.isInteger(partition.origin.x) || !Number.isInteger(partition.origin.y)) {
      throw new Error("Wall partition origin must use integer grid coordinates.");
    }
    if (!Number.isInteger(partition.length) || partition.length <= 0) {
      throw new Error("Wall partition length must be a positive integer number of metres.");
    }
    const seenDoorIds = /* @__PURE__ */ new Set();
    const seenOffsets = /* @__PURE__ */ new Set();
    for (const door of partition.doors ?? []) {
      if (!door.id) throw new Error("Wall partition doors require an id.");
      if (seenDoorIds.has(door.id)) {
        throw new Error(`Duplicate wall partition door id ${door.id}.`);
      }
      if (!Number.isInteger(door.offset) || door.offset < 0 || door.offset >= partition.length) {
        throw new Error(`Door ${door.id} offset is outside the wall partition.`);
      }
      if (seenOffsets.has(door.offset)) {
        throw new Error(`Multiple doors cannot occupy wall partition offset ${door.offset}.`);
      }
      seenDoorIds.add(door.id);
      seenOffsets.add(door.offset);
    }
  }

  // src/physical/FoodSpoilageSystem.ts
  var MINUTES_PER_HOUR = 60;
  var FOOD_SHELF_LIFE_MINUTES = {
    bread: 24 * MINUTES_PER_HOUR,
    fruit: 48 * MINUTES_PER_HOUR,
    vegetable: 72 * MINUTES_PER_HOUR,
    meat: 12 * MINUTES_PER_HOUR,
    "dried-meat": 7 * 24 * MINUTES_PER_HOUR,
    "prepared-meal": 12 * MINUTES_PER_HOUR,
    portable: 24 * MINUTES_PER_HOUR
  };
  var FoodSpoilageSystem = class {
    update(characters, elapsedMinutes) {
      if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0) {
        throw new Error("Food spoilage elapsedMinutes must be a non-negative finite number.");
      }
      if (elapsedMinutes === 0) return;
      for (const character of characters) {
        const spoiledItemIds = [];
        for (const possession of character.physical.getAll()) {
          const food = possession.item.food;
          if (!food) continue;
          const spoilage = food.spoilage ?? (food.spoilage = initialSpoilageState(food));
          validateSpoilage(food.kind, spoilage.ageMinutes, spoilage.shelfLifeMinutes);
          spoilage.ageMinutes += elapsedMinutes;
          if (spoilage.ageMinutes >= spoilage.shelfLifeMinutes) {
            spoiledItemIds.push(possession.item.id);
          }
        }
        for (const itemId of spoiledItemIds) {
          character.physical.remove(itemId);
        }
      }
    }
  };
  function initialSpoilageState(food) {
    return {
      ageMinutes: 0,
      shelfLifeMinutes: FOOD_SHELF_LIFE_MINUTES[food.kind]
    };
  }
  function validateSpoilage(kind, ageMinutes, shelfLifeMinutes) {
    if (!Number.isFinite(ageMinutes) || ageMinutes < 0) {
      throw new Error(`Food ${kind} spoilage ageMinutes must be a non-negative finite number.`);
    }
    if (!Number.isFinite(shelfLifeMinutes) || shelfLifeMinutes <= 0) {
      throw new Error(`Food ${kind} shelfLifeMinutes must be a positive finite number.`);
    }
  }

  // src/world/ResourceUsageSystem.ts
  var ResourceUsageSystem = class {
    constructor() {
      this.occupants = /* @__PURE__ */ new Map();
    }
    claim(resourceId, characterId, capacity) {
      if (!Number.isInteger(capacity) || capacity <= 0) {
        throw new Error("Resource capacity must be a positive integer.");
      }
      const occupants = this.occupants.get(resourceId) ?? /* @__PURE__ */ new Set();
      if (occupants.has(characterId)) return true;
      if (occupants.size >= capacity) return false;
      occupants.add(characterId);
      this.occupants.set(resourceId, occupants);
      return true;
    }
    release(resourceId, characterId) {
      const occupants = this.occupants.get(resourceId);
      if (!occupants) return;
      occupants.delete(characterId);
      if (occupants.size === 0) this.occupants.delete(resourceId);
    }
    releaseAll(characterId) {
      for (const [resourceId, occupants] of this.occupants) {
        occupants.delete(characterId);
        if (occupants.size === 0) this.occupants.delete(resourceId);
      }
    }
    isClaimedBy(resourceId, characterId) {
      return this.occupants.get(resourceId)?.has(characterId) ?? false;
    }
    occupancy(resourceId) {
      return this.occupants.get(resourceId)?.size ?? 0;
    }
  };

  // src/world/OwnershipSystem.ts
  var OwnershipSystem = class {
    constructor() {
      this.owners = /* @__PURE__ */ new Map();
    }
    setOwner(itemId, ownerId) {
      if (!itemId || !ownerId) throw new Error("Ownership requires an item and owner id.");
      this.owners.set(itemId, ownerId);
    }
    getOwner(itemId) {
      return this.owners.get(itemId);
    }
    isOwnedBy(itemId, ownerId) {
      return this.owners.get(itemId) === ownerId;
    }
    /**
     * Transfers title during an explicit voluntary transaction. Unregistered
     * legacy items are treated as owned by the transferring possessor at this
     * boundary; once ownership is registered, a non-owner cannot sell the item.
     */
    transfer(itemId, fromOwnerId, toOwnerId) {
      const currentOwner = this.owners.get(itemId);
      if (currentOwner !== void 0 && currentOwner !== fromOwnerId) {
        throw new Error(`Item ${itemId} is owned by ${currentOwner}, not ${fromOwnerId}.`);
      }
      this.owners.set(itemId, toOwnerId);
    }
  };

  // src/world/ItemLoanSystem.ts
  var ItemLoanSystem = class {
    constructor() {
      this.loans = /* @__PURE__ */ new Map();
    }
    lend(loan) {
      if (this.loans.has(loan.itemId)) {
        throw new Error(`Item ${loan.itemId} is already on loan.`);
      }
      if (loan.ownerId === loan.borrowerId) {
        throw new Error("An owner cannot loan an item to themselves.");
      }
      this.loans.set(loan.itemId, { ...loan });
    }
    get(itemId) {
      const loan = this.loans.get(itemId);
      return loan ? { ...loan } : void 0;
    }
    complete(itemId) {
      this.loans.delete(itemId);
    }
    getBorrowedBy(borrowerId) {
      return [...this.loans.values()].filter((loan) => loan.borrowerId === borrowerId).map((loan) => ({ ...loan }));
    }
  };

  // src/world/AccommodationSystem.ts
  var MINUTES_PER_DAY13 = 24 * 60;
  var AccommodationSystem = class {
    constructor() {
      this.rooms = /* @__PURE__ */ new Map();
      this.rentals = [];
    }
    registerRoom(room6) {
      if (this.rooms.has(room6.id)) {
        throw new Error(`Accommodation room ${room6.id} is already registered.`);
      }
      if (room6.rental && (!Number.isInteger(room6.rental.dailyRate) || room6.rental.dailyRate < 0)) {
        throw new Error("Accommodation daily rate must be a non-negative whole number of currency items.");
      }
      this.rooms.set(room6.id, room6);
    }
    getRoom(roomId) {
      return this.rooms.get(roomId);
    }
    getRoomsAt(placeId) {
      return Array.from(this.rooms.values()).filter((room6) => room6.placeId === placeId);
    }
    getAvailableRentableRooms(placeId, time) {
      return this.getRoomsAt(placeId).filter(
        (room6) => room6.rental !== void 0 && !this.activeRentalForRoom(room6.id, time)
      );
    }
    /** Rents a room from `startTime` for whole 24-hour periods. */
    rentRoom(roomId, occupantId, startTime, days = 1) {
      const room6 = this.rooms.get(roomId);
      if (!room6?.rental) return void 0;
      if (!Number.isInteger(days) || days <= 0) {
        throw new Error("Accommodation rental days must be a positive integer.");
      }
      if (this.activeRentalForRoom(roomId, startTime)) return void 0;
      const rental = {
        roomId,
        occupantId,
        startTime,
        endTime: startTime + days * MINUTES_PER_DAY13,
        pricePaid: room6.rental.dailyRate * days
      };
      this.rentals.push(rental);
      return rental;
    }
    hasRoomAccess(characterId, roomId, time) {
      const room6 = this.rooms.get(roomId);
      if (!room6) return false;
      if (room6.access === "public") return true;
      if (room6.residentId === characterId) return true;
      return this.activeRentalForRoom(roomId, time)?.occupantId === characterId;
    }
    getAccessibleRooms(characterId, time) {
      return Array.from(this.rooms.values()).filter(
        (room6) => this.hasRoomAccess(characterId, room6.id, time)
      );
    }
    getActiveRental(characterId, time) {
      return this.rentals.find(
        (rental) => rental.occupantId === characterId && rental.startTime <= time && time < rental.endTime
      );
    }
    activeRentalForRoom(roomId, time) {
      return this.rentals.find(
        (rental) => rental.roomId === roomId && rental.startTime <= time && time < rental.endTime
      );
    }
  };

  // src/world/HouseholdSystem.ts
  var HouseholdSystem = class {
    constructor() {
      this.households = /* @__PURE__ */ new Map();
      this.householdByMember = /* @__PURE__ */ new Map();
    }
    register(definition) {
      if (!definition.id || !definition.name) {
        throw new Error("Households require an id and name.");
      }
      if (this.households.has(definition.id)) {
        throw new Error(`Household ${definition.id} already exists.`);
      }
      if (definition.memberIds.length === 0) {
        throw new Error(`Household ${definition.id} requires at least one member.`);
      }
      const uniqueMembers = [...new Set(definition.memberIds)];
      if (uniqueMembers.length !== definition.memberIds.length) {
        throw new Error(`Household ${definition.id} contains duplicate members.`);
      }
      for (const memberId of uniqueMembers) {
        const existing = this.householdByMember.get(memberId);
        if (existing) {
          throw new Error(`${memberId} already belongs to household ${existing}.`);
        }
      }
      const household = {
        id: definition.id,
        name: definition.name,
        memberIds: uniqueMembers,
        ...definition.homeId ? { homeId: definition.homeId } : {}
      };
      this.households.set(household.id, household);
      for (const memberId of household.memberIds) {
        this.householdByMember.set(memberId, household.id);
      }
      return household;
    }
    get(id) {
      return this.households.get(id);
    }
    getAll() {
      return [...this.households.values()];
    }
    getForMember(memberId) {
      const householdId = this.householdByMember.get(memberId);
      return householdId ? this.households.get(householdId) : void 0;
    }
  };

  // src/world/RoomResourceSystem.ts
  var RoomResourceSystem = class {
    constructor() {
      this.liquids = /* @__PURE__ */ new Map();
    }
    registerLiquid(options) {
      if (this.liquids.has(options.id)) {
        throw new Error(`Room liquid resource ${options.id} is already registered.`);
      }
      if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
        throw new Error("Room liquid resource capacity must be positive.");
      }
      const initialAmount = options.initialAmount ?? 0;
      if (!Number.isFinite(initialAmount) || initialAmount < 0 || initialAmount > options.capacity) {
        throw new Error("Room liquid resource initial amount must fit its capacity.");
      }
      const state2 = {
        id: options.id,
        roomId: options.roomId,
        liquidType: options.liquidType,
        capacity: options.capacity,
        amount: initialAmount,
        ...options.ownerId ? { ownerId: options.ownerId } : {}
      };
      this.liquids.set(state2.id, state2);
      return state2;
    }
    getLiquid(id) {
      return this.liquids.get(id);
    }
    getLiquidsInRoom(roomId) {
      return Array.from(this.liquids.values()).filter((resource) => resource.roomId === roomId);
    }
    addLiquid(id, amount) {
      const resource = this.liquids.get(id);
      if (!resource || !Number.isFinite(amount) || amount <= 0) return 0;
      const added = Math.min(amount, resource.capacity - resource.amount);
      if (added <= 0) return 0;
      resource.amount += added;
      return added;
    }
    consumeLiquid(id, amount) {
      const resource = this.liquids.get(id);
      if (!resource || !Number.isFinite(amount) || amount <= 0) return 0;
      const consumed = Math.min(amount, resource.amount);
      if (consumed <= 0) return 0;
      resource.amount -= consumed;
      return consumed;
    }
  };

  // src/chance/ChanceSystem.ts
  var SeededChanceSource = class {
    constructor(seed) {
      this.seed = seed;
      if (!Number.isInteger(seed)) throw new Error("Chance seed must be an integer.");
      this.state = seed >>> 0 || 1831565813;
    }
    next() {
      let value = this.state;
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      this.state = value >>> 0;
      return this.state / 4294967296;
    }
  };
  var ChanceSystem = class {
    constructor(source) {
      this.source = source;
    }
    resolve(probability) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new Error("Chance probability must be between zero and one.");
      }
      const roll = this.source.next();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
        throw new Error("Chance source must return a value in [0, 1).");
      }
      return { probability, roll, succeeded: roll < probability };
    }
  };

  // src/hunting/HuntingSystem.ts
  var HuntingSystem = class {
    constructor() {
      this.habitats = /* @__PURE__ */ new Map();
    }
    registerHabitat(descriptor) {
      if (this.habitats.has(descriptor.id)) {
        throw new Error(`Hunting habitat ${descriptor.id} is already registered.`);
      }
      if (!Number.isInteger(descriptor.capacity) || descriptor.capacity <= 0) {
        throw new Error("Hunting habitat capacity must be a positive integer.");
      }
      if (!Number.isFinite(descriptor.successChance) || descriptor.successChance < 0 || descriptor.successChance > 1) {
        throw new Error("Hunting success chance must be between zero and one.");
      }
      if (descriptor.recoveryMinutes <= 0 || descriptor.disturbanceMinutes <= 0) {
        throw new Error("Hunting habitat recovery and disturbance must be positive.");
      }
      this.habitats.set(descriptor.id, {
        ...descriptor,
        position: { ...descriptor.position },
        available: descriptor.capacity,
        disturbedUntil: 0
      });
    }
    getHabitat(id, time) {
      const habitat = this.habitats.get(id);
      if (!habitat) return void 0;
      this.recover(habitat, time);
      return {
        id: habitat.id,
        speciesId: habitat.speciesId,
        position: { ...habitat.position },
        capacity: habitat.capacity,
        successChance: habitat.successChance,
        recoveryMinutes: habitat.recoveryMinutes,
        disturbanceMinutes: habitat.disturbanceMinutes
      };
    }
    getAvailable(id, time) {
      const habitat = this.habitats.get(id);
      if (!habitat) return void 0;
      this.recover(habitat, time);
      return habitat.available;
    }
    attempt(id, time, chance) {
      const habitat = this.habitats.get(id);
      if (!habitat) return { status: "unavailable", retryAt: time };
      this.recover(habitat, time);
      if (habitat.available <= 0 || time < habitat.disturbedUntil) {
        return {
          status: "unavailable",
          retryAt: Math.max(habitat.disturbedUntil, habitat.nextRecoveryAt ?? time)
        };
      }
      const result = chance.resolve(habitat.successChance);
      habitat.disturbedUntil = time + habitat.disturbanceMinutes;
      if (!result.succeeded) {
        return { status: "escaped", retryAt: habitat.disturbedUntil, chance: result };
      }
      habitat.available -= 1;
      habitat.nextRecoveryAt ?? (habitat.nextRecoveryAt = time + habitat.recoveryMinutes);
      return {
        status: "caught",
        retryAt: Math.max(habitat.disturbedUntil, habitat.nextRecoveryAt),
        chance: result
      };
    }
    recover(habitat, time) {
      while (habitat.available < habitat.capacity && habitat.nextRecoveryAt !== void 0 && time >= habitat.nextRecoveryAt) {
        habitat.available += 1;
        habitat.nextRecoveryAt += habitat.recoveryMinutes;
      }
      if (habitat.available >= habitat.capacity) habitat.nextRecoveryAt = void 0;
    }
  };

  // src/world/World.ts
  var MINUTES_PER_DAY14 = 24 * 60;
  var World = class {
    constructor(startMinuteOfDay = 0, chanceSource = new SeededChanceSource(1)) {
      this.startMinuteOfDay = startMinuteOfDay;
      this.time = 0;
      /**
       * Enables clock-driven environmental effects such as darkness. Kept opt-in so
       * isolated test/sandbox worlds that use minute zero as a neutral origin do not
       * silently become night simulations.
       */
      this.dayNightEnvironmentEnabled = false;
      this.characters = [];
      this.objects = [];
      this.mapFeatures = [];
      this.navigation = new NavigationGrid();
      this.resourceUsage = new ResourceUsageSystem();
      this.roomResources = new RoomResourceSystem();
      this.ownership = new OwnershipSystem();
      this.itemLoans = new ItemLoanSystem();
      this.accommodation = new AccommodationSystem();
      this.households = new HouseholdSystem();
      this.foodSpoilage = new FoodSpoilageSystem();
      this.agriculture = new AgricultureSystem();
      this.hunting = new HuntingSystem();
      this.lastAgricultureGrowthDay = 0;
      if (!Number.isInteger(startMinuteOfDay) || startMinuteOfDay < 0 || startMinuteOfDay >= MINUTES_PER_DAY14) {
        throw new Error("World startMinuteOfDay must be an integer from 0 to 1439.");
      }
      this.chance = new ChanceSystem(chanceSource);
      this.chanceSeed = chanceSource instanceof SeededChanceSource ? chanceSource.seed : null;
    }
    get minuteOfDay() {
      return (this.startMinuteOfDay + this.time) % MINUTES_PER_DAY14;
    }
    addCharacter(character) {
      this.characters.push(character);
      for (const possession of character.physical.getAll()) {
        if (this.ownership.getOwner(possession.item.id) === void 0) {
          this.ownership.setOwner(possession.item.id, character.id);
        }
      }
      if (character.homeId) {
        const bed = this.objects.find((object) => {
          const resource = object.usableResource;
          if (resource?.type !== "bed" || resource.placeId !== character.homeId) return false;
          return resource.roomId === void 0 || this.accommodation.hasRoomAccess(character.id, resource.roomId, this.time);
        });
        if (bed) {
          character.addKnowledge({
            type: "home-location",
            subjectId: character.homeId,
            polarity: "positive",
            position: { ...bed.position },
            sourceType: "world-initiation",
            learnedAt: this.time,
            confidence: 1
          });
        }
      }
      for (const place of this.objects.filter((object) => object.ownerId === character.id)) {
        const rentableRooms = this.accommodation.getRoomsAt(place.id).filter((room6) => room6.rental !== void 0);
        if (rentableRooms.length === 0) continue;
        const price = rentableRooms[0].rental.dailyRate;
        character.addKnowledge({
          type: "service-provider",
          subjectId: character.id,
          polarity: "positive",
          context: {
            service: "accommodation",
            placeId: place.id,
            offering: "room-day",
            terms: { price, expectedDuration: 5 }
          },
          sourceType: "world-initiation",
          learnedAt: this.time,
          confidence: 1
        });
      }
    }
    addObject(object) {
      if (this.objects.some((existing) => existing.id === object.id) || this.mapFeatures.some((existing) => existing.id === object.id)) {
        throw new Error(`World entity ${object.id} already exists.`);
      }
      this.objects.push(object);
      if (object.physicalFootprint) {
        applyRectangularFootprint(this.navigation, object.physicalFootprint);
      }
      const obstruction = this.getFixtureObstruction(object);
      if (obstruction) applyFixtureObstruction(this.navigation, obstruction);
      for (const edgeBarrier of object.physicalEdgeBarriers ?? []) {
        applyPhysicalEdgeBarrier(this.navigation, edgeBarrier);
      }
      for (const partition of object.internalPartitions ?? []) {
        applyWallPartition(this.navigation, partition);
      }
      for (const room6 of object.physicalRooms ?? []) {
        this.accommodation.registerRoom(room6);
      }
      for (const fixture of object.fixtures ?? []) {
        this.addObject(fixture);
      }
    }
    addMapFeature(feature) {
      if (this.mapFeatures.some((existing) => existing.id === feature.id) || this.objects.some((existing) => existing.id === feature.id)) {
        throw new Error(`World entity ${feature.id} already exists.`);
      }
      this.mapFeatures.push(feature);
      if (feature.kind === "field" && feature.agriculture && feature.geometry.type === "polygon") {
        this.agriculture.registerField({
          id: feature.id,
          name: feature.label,
          boundary: feature.geometry.points,
          rotation: feature.agriculture.initialRotation,
          stripOrientation: feature.agriculture.stripOrientation
        });
      }
    }
    getObject(id) {
      return this.objects.find((object) => object.id === id);
    }
    getFixtureObstruction(object) {
      return worldObjectFixtureObstruction(object);
    }
    /** Returns the first non-overlapping room area that currently contains the position. */
    getRoomAtPosition(position) {
      return this.objects.flatMap((object) => object.physicalRooms ?? []).find((room6) => isPositionInRoom(position, room6));
    }
    getActionPoints() {
      const points = [];
      for (const object of this.objects) {
        if (object.servicePoint) {
          points.push(serviceProviderActionPoint(object.id, object.servicePoint));
          points.push(serviceCustomerActionPoint(object.id, object.servicePoint));
        }
        if (object.usableResource) {
          points.push(usableResourceActionPoint(object.id, object.position, object.usableResource));
        }
        if (object.facility) points.push(object.facility.actionPoint);
      }
      return points;
    }
    getActionPoint(id) {
      return this.getActionPoints().find((point) => point.id === id);
    }
    getOccupiedActionPointIds(characterId) {
      return this.getActionPoints().filter((point) => this.resourceUsage.isClaimedBy(point.id, characterId)).map((point) => point.id);
    }
    getContainers() {
      return this.objects.filter((object) => object.containerId !== void 0).map((object) => ({
        id: object.containerId,
        position: object.position,
        ownerId: object.ownerId
      }));
    }
    update() {
      this.syncPresenceActionPoints();
      this.foodSpoilage.update(this.characters, 1);
      const agricultureDay = Math.floor((this.startMinuteOfDay + this.time) / MINUTES_PER_DAY14);
      if (agricultureDay > this.lastAgricultureGrowthDay) {
        this.agriculture.update(this.time);
        this.lastAgricultureGrowthDay = agricultureDay;
      }
      for (const character of this.characters) {
        character.advanceNeeds(1);
      }
    }
    advanceTime(minutes) {
      this.time += minutes;
    }
    getPeopleNear(position, radius = 5) {
      return this.characters.filter((character) => {
        const dx = character.position.x - position.x;
        const dy = character.position.y - position.y;
        return Math.sqrt(dx * dx + dy * dy) <= radius;
      });
    }
    syncPresenceActionPoints() {
      const points = this.getActionPoints().filter((point) => point.occupancyMode === "presence");
      for (const point of points) {
        for (const character of this.characters) {
          if (isAtActionPoint(character.position, point)) {
            this.resourceUsage.claim(point.id, character.id, point.capacity);
          } else {
            this.resourceUsage.release(point.id, character.id);
          }
        }
      }
    }
  };

  // src/planning/CandidatePlan.ts
  function instantiatePlan(candidate) {
    return {
      definition: candidate.definition,
      goal: candidate.goal,
      prerequisites: candidate.prerequisites.map(instantiatePlan),
      totalDuration: candidate.totalDuration,
      totalCost: candidate.totalCost,
      totalRisk: candidate.totalRisk,
      expectedNeedRelief: candidate.expectedNeedRelief ? { ...candidate.expectedNeedRelief } : void 0,
      satisfied: candidate.satisfied,
      completed: candidate.satisfied,
      failed: false,
      target: clonePlanTarget(candidate.target)
    };
  }
  function clonePlanTarget(target) {
    if (!target) return void 0;
    if (target.type === "person") {
      return {
        ...target,
        position: { ...target.position }
      };
    }
    return {
      ...target,
      position: { ...target.position }
    };
  }

  // src/memory/InteractionMemory.ts
  function getInteractionMemoryContext(memory) {
    if (memory.type !== "interaction" || !memory.context) return void 0;
    const context = memory.context;
    if (typeof context.interactionKind !== "string" || typeof context.role !== "string" || typeof context.outcome !== "string" || typeof context.valence !== "number") {
      return void 0;
    }
    return context;
  }

  // src/social/HearsayOpinionEvaluator.ts
  var HearsayOpinionEvaluator = class {
    evaluate(observer, subjectPersonId) {
      if (!observer.knownPeople.has(subjectPersonId)) {
        return this.neutral(subjectPersonId);
      }
      const reports = observer.memory.getByType("interaction").map((memory) => ({ memory, context: getInteractionMemoryContext(memory) })).filter(
        (entry) => entry.context?.interactionKind === "opinion-shared" && entry.context.role === "opinion-listener" && entry.context.opinionSubjectPersonId === subjectPersonId && typeof entry.context.otherPersonId === "string" && typeof entry.context.reportedTrust === "number" && typeof entry.context.reportedAffinity === "number"
      );
      if (reports.length === 0) {
        return this.neutral(subjectPersonId);
      }
      let totalWeight = 0;
      let trustTotal = 0;
      let affinityTotal = 0;
      const sources = /* @__PURE__ */ new Set();
      for (const { memory, context } of reports) {
        if (!context?.otherPersonId || context.reportedTrust === void 0 || context.reportedAffinity === void 0) {
          continue;
        }
        const sourceRelationship = observer.relationships.get(context.otherPersonId);
        const sourceTrust = sourceRelationship?.trust ?? 0.5;
        const sourceFamiliarity = sourceRelationship?.familiarity ?? 0;
        const sourceCredibility = this.clamp(
          0.15 + sourceTrust * 0.75 + sourceFamiliarity * 0.1
        );
        const subjectExperience = 0.25 + this.clamp(context.reportedFamiliarity ?? 0) * 0.75;
        const reportConfidence = this.clamp(context.opinionConfidence ?? 0.5);
        const memoryConfidence = this.clamp(memory.confidence);
        const weight = sourceCredibility * subjectExperience * reportConfidence * memoryConfidence;
        if (weight <= 0) continue;
        sources.add(context.otherPersonId);
        totalWeight += weight;
        trustTotal += this.clamp(context.reportedTrust) * weight;
        affinityTotal += this.clamp(context.reportedAffinity) * weight;
      }
      if (totalWeight <= 0) {
        return this.neutral(subjectPersonId);
      }
      const trustExpectation = trustTotal / totalWeight;
      const affinityExpectation = affinityTotal / totalWeight;
      const confidence = this.clamp(totalWeight);
      const directFamiliarity = observer.relationships.get(subjectPersonId)?.familiarity ?? 0;
      const directExperienceDamping = this.clamp(1 - directFamiliarity);
      return {
        subjectPersonId,
        sourceCount: sources.size,
        trustExpectation,
        affinityExpectation,
        confidence,
        directExperienceDamping,
        trustAdjustment: (trustExpectation - 0.5) * confidence * directExperienceDamping,
        affinityAdjustment: (affinityExpectation - 0.5) * confidence * directExperienceDamping
      };
    }
    neutral(subjectPersonId) {
      return {
        subjectPersonId,
        sourceCount: 0,
        trustExpectation: 0.5,
        affinityExpectation: 0.5,
        confidence: 0,
        directExperienceDamping: 1,
        trustAdjustment: 0,
        affinityAdjustment: 0
      };
    }
    clamp(value) {
      return Math.max(0, Math.min(1, value));
    }
  };

  // src/brain/PlanEvaluator.ts
  var DEFAULT_WEIGHTS = {
    cost: 4,
    risk: 2,
    baseDuration: 0.05,
    urgentDuration: 0.95,
    schedulePressure: 1,
    needRelief: 0.35
  };
  var PlanEvaluator = class {
    constructor(weights = {}) {
      this.hearsay = new HearsayOpinionEvaluator();
      this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    }
    evaluateAll(candidates, intent, character, world2) {
      return candidates.map((plan, index) => ({
        evaluation: this.evaluate(plan, intent, character, world2),
        index
      })).sort(
        (first, second) => second.evaluation.score - first.evaluation.score || first.index - second.index
      ).map((entry) => entry.evaluation);
    }
    evaluate(plan, intent, character, world2) {
      const urgency = this.getNeedUrgency(intent, character);
      const baseDurationWeight = this.weights.baseDuration + this.weights.urgentDuration * urgency;
      const costWeight = this.weights.cost * this.preferenceMultiplier(character.personality.frugality);
      const riskWeight = this.weights.risk * this.preferenceMultiplier(character.personality.caution);
      const patienceMultiplier = this.inversePreferenceMultiplier(character.personality.patience);
      const durationWeight = baseDurationWeight * patienceMultiplier;
      const scheduleWeight = this.weights.schedulePressure * this.preferenceMultiplier(character.personality.conscientiousness);
      const needReliefWeight = this.weights.needRelief;
      const costPenalty = plan.totalCost * costWeight;
      const riskPenalty = plan.totalRisk * riskWeight;
      const durationPenalty = plan.totalDuration * durationWeight;
      const schedulePenalty = this.getSchedulePenalty(plan, intent, character, world2, scheduleWeight);
      const needReliefBenefit = this.getRelevantNeedRelief(plan, intent, character) * needReliefWeight;
      const subjectPersonId = this.getTargetPersonId(plan, character);
      const relationship = subjectPersonId ? character.relationships.get(subjectPersonId) : void 0;
      const directRelationshipPreference = relationship ? (relationship.trust - 0.5) * riskWeight + (relationship.affinity - 0.5) * 0.75 + relationship.familiarity * 0.25 : 0;
      const hearsay = subjectPersonId ? this.hearsay.evaluate(character, subjectPersonId) : void 0;
      const hearsayPreference = hearsay ? hearsay.trustAdjustment * riskWeight + hearsay.affinityAdjustment * 0.5 : 0;
      const score = -(costPenalty + riskPenalty + durationPenalty + schedulePenalty) + needReliefBenefit + directRelationshipPreference + hearsayPreference;
      return {
        plan,
        score,
        breakdown: {
          costPenalty,
          costWeight,
          riskPenalty,
          riskWeight,
          durationPenalty,
          urgency,
          durationWeight,
          patienceMultiplier,
          schedulePenalty,
          scheduleWeight,
          needReliefBenefit,
          needReliefWeight,
          directRelationshipPreference,
          hearsayPreference
        }
      };
    }
    getTargetPersonId(plan, character) {
      const target = plan.target;
      if (!target) return void 0;
      const personId = target.type === "person" ? target.personId : target.subjectId;
      return personId && character.knownPeople.has(personId) ? personId : void 0;
    }
    preferenceMultiplier(trait) {
      return 0.5 + trait;
    }
    inversePreferenceMultiplier(trait) {
      return 1.5 - trait;
    }
    getNeedUrgency(intent, character) {
      if (intent.source.type !== "need") return 0;
      let value;
      switch (intent.source.id) {
        case "hunger":
          value = character.hunger;
          break;
        case "thirst":
          value = character.thirst;
          break;
        case "tiredness":
          value = character.tiredness;
          break;
        default:
          return 0;
      }
      return Math.max(0, Math.min(1, (value - 70) / 30));
    }
    getRelevantNeedRelief(plan, intent, character) {
      if (intent.source.type !== "need" || !plan.expectedNeedRelief) return 0;
      switch (intent.source.id) {
        case "hunger":
          return Math.min(character.hunger, plan.expectedNeedRelief.hunger ?? 0);
        case "thirst":
          return Math.min(character.thirst, plan.expectedNeedRelief.thirst ?? 0);
        case "tiredness":
          return Math.min(character.tiredness, plan.expectedNeedRelief.tiredness ?? 0);
        default:
          return 0;
      }
    }
    getSchedulePenalty(plan, intent, character, world2, scheduleWeight) {
      const agenda = character.dailyAgenda;
      if (!agenda) return 0;
      const currentAgendaId = intent.source.type === "agenda" ? intent.source.id : void 0;
      const nextCommitment = agenda.items.filter(
        (item) => item.status === "planned" && item.source === "scheduled-commitment" && item.id !== currentAgendaId
      ).sort((first, second) => first.plannedStart - second.plannedStart)[0];
      if (!nextCommitment) return 0;
      const candidateEndsAt = world2.time + plan.totalDuration;
      const minutesIntoCommitment = Math.max(0, candidateEndsAt - nextCommitment.plannedStart);
      if (minutesIntoCommitment === 0) return 0;
      const priorityFactor = Math.max(0, nextCommitment.priority) / 100;
      return minutesIntoCommitment * priorityFactor * scheduleWeight;
    }
  };

  // src/scheduling/DailyAgenda.ts
  var DailyAgenda = class {
    constructor(dayIndex, createdAt, items) {
      this.dayIndex = dayIndex;
      this.createdAt = createdAt;
      this.items = items;
    }
  };

  // src/scheduling/RoutineReviewer.ts
  var COMPLETION_CONFIRMATION_TOLERANCE_MINUTES = 1;
  var MAX_DAILY_BUFFER_INCREASE_MINUTES = 5;
  var RoutineReviewer = class {
    review(character, agenda) {
      const created = [];
      for (const item of agenda.items) {
        if (item.source !== "scheduled-commitment") continue;
        const template = character.routineTemplates.find(
          (candidate) => candidate.id === item.routineTemplateId
        );
        if (!template) continue;
        const reviewId = `${character.id}:routine-review:${agenda.dayIndex}:${item.id}`;
        if (character.routineReviews.some((review2) => review2.id === reviewId)) continue;
        const arrivalBufferBefore = template.arrivalBufferMinutes;
        const confirmedCompletion = item.status === "completed" && item.completedAt !== void 0;
        const latenessMinutes = confirmedCompletion ? Math.max(
          0,
          item.completedAt - item.deadline - COMPLETION_CONFIRMATION_TOLERANCE_MINUTES
        ) : void 0;
        let outcome = "missed";
        let adjustmentMinutes = 0;
        if (confirmedCompletion) {
          outcome = latenessMinutes > 0 ? "late" : "on-time";
          if (outcome === "late") {
            const previous = [...character.routineReviews].reverse().find((review2) => review2.routineTemplateId === template.id);
            if (previous?.outcome === "late" && previous.latenessMinutes !== void 0) {
              const averageLateness = (previous.latenessMinutes + latenessMinutes) / 2;
              adjustmentMinutes = Math.min(
                MAX_DAILY_BUFFER_INCREASE_MINUTES,
                Math.max(1, Math.ceil(averageLateness / 2))
              );
              template.arrivalBufferMinutes += adjustmentMinutes;
            }
          }
        }
        const review = {
          id: reviewId,
          dayIndex: agenda.dayIndex,
          routineTemplateId: template.id,
          agendaItemId: item.id,
          outcome,
          plannedStart: item.plannedStart,
          startedAt: item.startedAt,
          deadline: item.deadline,
          completedAt: item.completedAt,
          latenessMinutes,
          arrivalBufferBefore,
          arrivalBufferAfter: template.arrivalBufferMinutes,
          adjustmentMinutes
        };
        character.routineReviews.push(review);
        created.push(review);
      }
      return created;
    }
  };

  // src/scheduling/AgendaPlanner.ts
  var MINUTES_PER_DAY15 = 24 * 60;
  var MEAL_BREAK_GRACE_MINUTES = 30;
  var AgendaPlanner = class {
    constructor(planner, needs = new NeedForecaster(), routineReviewer = new RoutineReviewer()) {
      this.planner = planner;
      this.needs = needs;
      this.routineReviewer = routineReviewer;
    }
    ensureAgenda(character, world2) {
      const dayIndex = Math.floor((world2.startMinuteOfDay + world2.time) / MINUTES_PER_DAY15);
      if (character.dailyAgenda?.dayIndex !== dayIndex) {
        if (character.dailyAgenda) {
          this.routineReviewer.review(character, character.dailyAgenda);
        }
        character.dailyAgenda = new DailyAgenda(dayIndex, world2.time, []);
      }
      this.recordFailedMealAttempt(character, world2);
      this.expireMissedMealBreaks(character, world2);
      this.materialiseMealBreaks(character, world2, dayIndex);
      const templatesToMaterialise = this.templatesReadyToMaterialise(character, world2);
      if (templatesToMaterialise.length === 0) return;
      const proposed = this.build(character, world2, dayIndex, templatesToMaterialise);
      for (const item of proposed.items) {
        if (character.dailyAgenda.items.some((existing) => existing.id === item.id)) continue;
        character.dailyAgenda.items.push(item);
      }
      character.dailyAgenda.items.sort((first, second) => first.plannedStart - second.plannedStart);
    }
    build(character, world2, dayIndex = Math.floor((world2.startMinuteOfDay + world2.time) / MINUTES_PER_DAY15), templates = character.routineTemplates) {
      const items = [];
      const context = {
        character,
        time: world2.time,
        minuteOfDay: world2.minuteOfDay
      };
      for (const template of templates) {
        const assignment = character.activitySchedules.find((schedule) => schedule.id === template.activityScheduleId);
        if (!assignment?.commitment) continue;
        const minutesUntilStart = assignment.schedule.minutesUntilStart(world2.minuteOfDay);
        if (minutesUntilStart > template.planningHorizonMinutes) continue;
        const commitmentPosition = this.goalPosition(assignment.commitment.goal);
        if (!commitmentPosition) continue;
        const scheduleStart = world2.time + minutesUntilStart;
        const readyBy = scheduleStart - template.arrivalBufferMinutes;
        let commitmentPlannedStart = readyBy - this.travelMinutes(
          context,
          character.position,
          commitmentPosition
        );
        const minutesUntilScheduleEnd = assignment.schedule.isActive(world2.minuteOfDay) ? assignment.schedule.minutesUntilEnd(world2.minuteOfDay) : minutesUntilStart + assignment.schedule.durationMinutes;
        const drinkForecast = this.needs.forecast(character, "drink", minutesUntilScheduleEnd);
        const portableWaterCapacity = totalCarriedLiquidCapacity(character.physical.getAll(), "water");
        const hasWaterGoal = {
          type: "hasWater",
          parameters: { amount: portableWaterCapacity }
        };
        const alreadyHasFullReserve = portableWaterCapacity > 0 && this.planner.isGoalSatisfied(hasWaterGoal, context);
        if (drinkForecast.becomesUrgent && portableWaterCapacity > 0 && !alreadyHasFullReserve) {
          const waterPreparation = this.bestWaterPreparation(
            this.planner.solve(hasWaterGoal, context),
            context,
            commitmentPosition
          );
          if (waterPreparation) {
            const preparationDuration = Math.max(1, waterPreparation.plan.totalDuration);
            const waterStart = readyBy - preparationDuration - waterPreparation.fromWaterToCommitment;
            const waterDeadline = waterStart + preparationDuration;
            items.push({
              id: `${template.id}:predicted-need:drink`,
              routineTemplateId: template.id,
              goal: hasWaterGoal,
              reason: "Predicted personal thirst will become urgent before the next scheduled commitment ends, so prepare a full portable water reserve.",
              source: "predicted-need",
              plannedStart: this.clampStart(waterStart, world2.time),
              deadline: waterDeadline,
              priority: assignment.commitment.priority + 5,
              status: "planned"
            });
            commitmentPlannedStart = readyBy - waterPreparation.fromWaterToCommitment;
          }
        }
        items.push({
          id: `${template.id}:commitment:${assignment.id}`,
          routineTemplateId: template.id,
          activityScheduleId: assignment.id,
          goal: assignment.commitment.goal,
          reason: `Prepare for scheduled activity ${assignment.activityId}.`,
          source: "scheduled-commitment",
          plannedStart: this.clampStart(commitmentPlannedStart, world2.time),
          deadline: scheduleStart,
          priority: assignment.commitment.priority,
          status: "planned"
        });
      }
      return new DailyAgenda(dayIndex, world2.time, items.sort((first, second) => first.plannedStart - second.plannedStart));
    }
    /**
     * Brain asks the agenda to refresh before it clears a failed runtime plan. Use
     * that boundary to remember a failed meal attempt so the same routine lunch is
     * not reconstructed and retried on the immediately following tick. Unsolved
     * planning attempts use the same timestamp in Brain.
     */
    recordFailedMealAttempt(character, world2) {
      if (!character.currentPlan?.failed || character.currentIntent?.source.type !== "agenda") return;
      const item = character.dailyAgenda?.items.find(
        (candidate) => candidate.id === character.currentIntent?.source.id
      );
      if (item?.source === "meal-opportunity" && item.status === "planned") {
        item.lastAttemptedAt = world2.time;
      }
    }
    /**
     * A work break is an opportunity rather than a permanent survival goal. Give
     * interrupted work a short grace period after the approved window, but do not
     * let a missed lunch keep invoking proactive food planning for the rest of the
     * day. An already-active meal plan is allowed to finish normally.
     */
    expireMissedMealBreaks(character, world2) {
      const agenda = character.dailyAgenda;
      if (!agenda) return;
      const activeAgendaItemId = character.currentIntent?.source.type === "agenda" ? character.currentIntent.source.id : void 0;
      for (const item of agenda.items) {
        if (item.source !== "meal-opportunity" || item.status !== "planned" || item.id === activeAgendaItemId) continue;
        if (world2.time > item.deadline + MEAL_BREAK_GRACE_MINUTES) {
          item.status = "cancelled";
        }
      }
    }
    /**
     * Converts explicit job permissions into today's agenda without making eating
     * compulsory. The goal records the opening of the window, so it only becomes
     * satisfied after food is actually consumed during that meal opportunity.
     */
    materialiseMealBreaks(character, world2, dayIndex) {
      const agenda = character.dailyAgenda;
      if (!agenda || !this.hasSubjectiveMealLead(character)) return;
      const dayStartTime = dayIndex * MINUTES_PER_DAY15 - world2.startMinuteOfDay;
      for (const assignment of character.activitySchedules) {
        for (const mealBreak of assignment.mealBreaks ?? []) {
          if (!Number.isFinite(mealBreak.startMinuteOfDay) || !Number.isFinite(mealBreak.endMinuteOfDay) || mealBreak.endMinuteOfDay <= mealBreak.startMinuteOfDay) continue;
          const plannedStart = dayStartTime + mealBreak.startMinuteOfDay;
          const deadline = dayStartTime + mealBreak.endMinuteOfDay;
          if (deadline < world2.time) continue;
          const id = `${assignment.id}:meal:${mealBreak.id}:${dayIndex}`;
          if (agenda.items.some((item) => item.id === id)) continue;
          agenda.items.push({
            id,
            activityScheduleId: assignment.id,
            goal: {
              type: "eatFood",
              parameters: {
                since: plannedStart,
                mealSize: mealBreak.mealSize,
                opportunityId: id
              }
            },
            reason: `${mealBreak.name} is an approved meal break during ${assignment.activityId}.`,
            source: "meal-opportunity",
            plannedStart,
            deadline,
            priority: mealBreak.priority,
            status: "planned"
          });
        }
      }
      agenda.items.sort((first, second) => first.plannedStart - second.plannedStart);
    }
    /**
     * Proactive meal planning should start from an actionable subjective lead,
     * rather than from any vaguely recognised food place. Food already possessed
     * and a worker's own meal stock are immediately actionable. External service
     * requires a learned provider plus a remembered position for either that
     * provider or the provider's place. Urgent hunger can still use the ordinary
     * discovery plans when only a vague place lead exists.
     */
    hasSubjectiveMealLead(character) {
      const possessions = character.physical.getAll();
      if (possessions.some((possession) => isDirectlyEdibleFood(possession.item))) return true;
      const canPrepareOwnMeal2 = character.activities.some(
        (activity) => activity.id === "prepared-meal-service"
      ) && possessions.some((possession) => possession.item.type === "meal-stock");
      if (canPrepareOwnMeal2) return true;
      const providers = character.knowledge.filter(
        (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && knowledge.context?.service === "food"
      );
      return providers.some((provider) => {
        const knownProviderPosition = character.knowledge.some(
          (knowledge) => knowledge.type === "person-location" && knowledge.subjectId === provider.subjectId && knowledge.polarity === "positive" && knowledge.position !== void 0
        );
        if (knownProviderPosition) return true;
        const placeId = provider.context?.placeId;
        if (!placeId) return false;
        return character.knowledge.some(
          (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === placeId && knowledge.polarity === "positive" && knowledge.position !== void 0
        );
      });
    }
    templatesReadyToMaterialise(character, world2) {
      const materialised = new Set(
        character.dailyAgenda?.items.flatMap(
          (item) => item.routineTemplateId ? [item.routineTemplateId] : []
        ) ?? []
      );
      return character.routineTemplates.filter((template) => {
        if (materialised.has(template.id)) return false;
        const assignment = character.activitySchedules.find((schedule) => schedule.id === template.activityScheduleId);
        if (!assignment?.commitment) return false;
        return assignment.schedule.minutesUntilStart(world2.minuteOfDay) <= template.planningHorizonMinutes;
      });
    }
    bestWaterPreparation(plans, context, commitmentPosition) {
      const options = plans.flatMap((plan) => {
        if (plan.target?.type !== "location") return [];
        const fromWaterToCommitment = this.travelMinutes(
          context,
          plan.target.position,
          commitmentPosition
        );
        if (!Number.isFinite(fromWaterToCommitment)) return [];
        return [{ plan, fromWaterToCommitment }];
      });
      return options.sort(
        (first, second) => first.plan.totalDuration + first.fromWaterToCommitment - (second.plan.totalDuration + second.fromWaterToCommitment)
      )[0];
    }
    goalPosition(goal) {
      const position = goal.parameters?.position;
      if (!position || typeof position !== "object") return void 0;
      const candidate = position;
      if (typeof candidate.x !== "number" || typeof candidate.y !== "number") return void 0;
      return { x: candidate.x, y: candidate.y };
    }
    travelMinutes(context, from, to) {
      const duration = estimateTravelDurationBetween(context, from, to);
      return duration === void 0 ? Number.POSITIVE_INFINITY : Math.ceil(duration);
    }
    clampStart(value, now) {
      if (!Number.isFinite(value)) return now;
      return Math.max(now, Math.floor(value));
    }
  };

  // src/brain/Brain.ts
  var SOCIAL_NEED_TRIGGER = 60;
  var SOCIAL_NEED_PHYSICAL_SAFETY_CUTOFF = 50;
  var SOCIAL_INTENT_MAX_PRIORITY = 30;
  var MEAL_OPPORTUNITY_RETRY_MINUTES = 15;
  var Brain = class {
    constructor(planner, planEvaluator = new PlanEvaluator()) {
      this.planner = planner;
      this.planEvaluator = planEvaluator;
      this.agendaPlanner = new AgendaPlanner(planner);
    }
    think(character, world2) {
      if (this.shouldWaitForSocialInstruction(character, world2)) {
        return;
      }
      const hasMealBreaks = character.activitySchedules.some(
        (schedule) => (schedule.mealBreaks?.length ?? 0) > 0
      );
      if (character.routineTemplates.length > 0 || hasMealBreaks) {
        this.agendaPlanner.ensureAgenda(character, world2);
      }
      const intents = this.collectIntents(character, world2);
      const activePlan = character.currentPlan && !character.currentPlan.completed && !character.currentPlan.failed;
      if (activePlan) {
        if (character.currentAction) {
          if (character.currentAction.interruptionPolicy !== "interruptible") return;
          if (character.currentAction.shouldInterrupt?.()) {
            character.interruptCurrentAction(world2, "wake condition reached");
          } else if (!character.currentIntent) {
            return;
          } else {
            const refreshedCurrentIntent = intents.find((intent) => intent.id === character.currentIntent?.id);
            if (!refreshedCurrentIntent) {
              const socialConversationCanFinishNaturally = character.currentIntent.source.type === "need" && character.currentIntent.source.id === "social" && character.currentAction.type.startsWith("conversation:") && character.socialNeed < SOCIAL_NEED_TRIGGER && Math.max(character.hunger, character.thirst, character.tiredness) < SOCIAL_NEED_PHYSICAL_SAFETY_CUTOFF;
              if (socialConversationCanFinishNaturally) return;
              character.interruptCurrentAction(world2, "intent no longer applies");
            } else {
              character.currentIntent = refreshedCurrentIntent;
              const higherPriority = this.findSolvableIntent(
                intents.filter(
                  (intent) => intent.id !== refreshedCurrentIntent.id && intent.priority > refreshedCurrentIntent.priority
                ),
                character,
                world2
              );
              if (!higherPriority) return;
              character.interruptCurrentAction(
                world2,
                `higher-priority intent ${higherPriority.intent.id}`
              );
              this.assignSolvedIntent(higherPriority, character, world2);
              return;
            }
          }
        } else if (!character.currentIntent) {
          return;
        } else {
          const refreshedCurrentIntent = intents.find((intent) => intent.id === character.currentIntent?.id);
          if (!refreshedCurrentIntent) {
            logSimulation(world2, "decision", `${character.name} releases intent ${character.currentIntent.id}; source no longer proposes it`);
            character.currentPlan = void 0;
            character.currentPlanKnowledgeRevision = void 0;
            character.currentIntent = void 0;
          } else {
            character.currentIntent = refreshedCurrentIntent;
            const higherPriority = this.findSolvableIntent(
              intents.filter(
                (intent) => intent.id !== refreshedCurrentIntent.id && intent.priority > refreshedCurrentIntent.priority
              ),
              character,
              world2
            );
            if (higherPriority) {
              logSimulation(world2, "decision", `${character.name} interrupts ${refreshedCurrentIntent.id} for ${higherPriority.intent.id}`);
              this.assignSolvedIntent(higherPriority, character, world2);
              return;
            }
            if (this.hasPlanningKnowledgeChanged(character)) {
              const previousRevision = character.currentPlanKnowledgeRevision;
              const replanned = this.findSolvableIntent(
                [refreshedCurrentIntent],
                character,
                world2
              );
              if (replanned) {
                logSimulation(
                  world2,
                  "decision",
                  `${character.name} replans ${refreshedCurrentIntent.id}; knowledge changed from revision ${previousRevision} to ${character.knowledgeRevision}`
                );
                this.assignSolvedIntent(replanned, character, world2);
                return;
              }
              logSimulation(
                world2,
                "decision",
                `${character.name} releases ${refreshedCurrentIntent.id}; changed knowledge no longer supports a plan`
              );
              character.currentPlan = void 0;
              character.currentPlanKnowledgeRevision = void 0;
              character.currentIntent = void 0;
            } else {
              return;
            }
          }
        }
      }
      if (character.currentPlan?.completed || character.currentPlan?.failed) {
        character.currentPlan = void 0;
        character.currentPlanKnowledgeRevision = void 0;
        character.currentIntent = void 0;
      }
      if (intents.length === 0) {
        return;
      }
      logSimulation(
        world2,
        "decision",
        `${character.name} intents: ${intents.map((intent) => `${intent.goal.type}(priority=${intent.priority}, source=${intent.source.type}:${intent.source.id})`).join(", ")}`
      );
      const solved = this.findSolvableIntent(intents, character, world2, true);
      if (!solved) return;
      this.assignSolvedIntent(solved, character, world2);
    }
    shouldWaitForSocialInstruction(character, world2) {
      const instruction = character.socialInstruction;
      if (!instruction || instruction.type !== "wait") return false;
      const requester = world2.characters.find((candidate) => candidate.id === instruction.personId);
      const expired = world2.time >= instruction.issuedAt + instruction.expectedDuration;
      const requesterArrived = requester !== void 0 && isWithinConversationRange(
        Math.hypot(
          requester.position.x - character.position.x,
          requester.position.y - character.position.y
        )
      );
      if (!requester || expired || requesterArrived) {
        character.socialInstruction = void 0;
        return false;
      }
      character.movementTarget = void 0;
      return true;
    }
    collectIntents(character, world2) {
      const intents = [];
      const planningContext = this.planningContext(character, world2);
      const dueAgendaRequiresAction = character.dailyAgenda?.items.some(
        (item) => item.status === "planned" && world2.time >= item.plannedStart && !this.planner.isGoalSatisfied(item.goal, planningContext)
      ) ?? false;
      if (character.hunger >= 70) {
        intents.push({
          id: `${character.id}:need:hunger:eat-food`,
          source: { type: "need", id: "hunger" },
          goal: { type: "eatFood" },
          priority: 70
        });
      }
      if (character.thirst >= 70) {
        intents.push({
          id: `${character.id}:need:thirst:drink-water`,
          source: { type: "need", id: "thirst" },
          goal: { type: "drinkWater" },
          priority: 70
        });
      }
      const continuingSleep = character.currentAction?.type === "sleep" && character.currentIntent?.source.type === "need" && character.currentIntent.source.id === "tiredness" && character.tiredness > 20;
      if (!dueAgendaRequiresAction && (character.tiredness >= 70 || continuingSleep)) {
        intents.push({
          id: `${character.id}:need:tiredness:rest`,
          source: { type: "need", id: "tiredness" },
          goal: { type: "rested" },
          priority: 70
        });
      }
      const highestPhysicalNeed = Math.max(character.hunger, character.thirst, character.tiredness);
      if (!dueAgendaRequiresAction && highestPhysicalNeed < SOCIAL_NEED_PHYSICAL_SAFETY_CUTOFF && character.socialNeed >= SOCIAL_NEED_TRIGGER) {
        const priority = Math.min(
          SOCIAL_INTENT_MAX_PRIORITY,
          10 + (character.socialNeed - SOCIAL_NEED_TRIGGER) * 0.5
        );
        intents.push({
          id: `${character.id}:need:social:talk-to-person`,
          source: { type: "need", id: "social" },
          goal: { type: "socialized" },
          priority
        });
      }
      for (const activity of character.activities) {
        const priorityBoost = character.getActivitySchedulePriorityBoost(activity.id, world2.minuteOfDay);
        for (const intent of activity.getIntents({ character, time: world2.time })) {
          intents.push({
            ...intent,
            priority: intent.priority + priorityBoost
          });
        }
      }
      const agenda = character.dailyAgenda;
      if (agenda) {
        for (const item of agenda.items) {
          if (item.status !== "planned" || world2.time < item.plannedStart) continue;
          if (this.planner.isGoalSatisfied(item.goal, planningContext)) {
            item.status = "completed";
            item.completedAt ?? (item.completedAt = world2.time);
            continue;
          }
          const isCurrentAgendaIntent = character.currentIntent?.source.type === "agenda" && character.currentIntent.source.id === item.id;
          if (item.source === "meal-opportunity" && !isCurrentAgendaIntent && item.lastAttemptedAt !== void 0 && world2.time < item.lastAttemptedAt + MEAL_OPPORTUNITY_RETRY_MINUTES) {
            continue;
          }
          const lateBy = Math.max(0, world2.time - item.deadline);
          const latenessBoost = item.source === "scheduled-commitment" ? Math.min(30, lateBy) : 0;
          const opportunityBoost = item.source === "meal-opportunity" ? Math.min(
            20,
            Math.max(
              0,
              (world2.time - item.plannedStart) / Math.max(1, item.deadline - item.plannedStart) * 20
            )
          ) : 0;
          intents.push({
            id: `${character.id}:agenda:${item.id}`,
            source: { type: "agenda", id: item.id },
            goal: item.goal,
            priority: item.priority + latenessBoost + opportunityBoost
          });
        }
      }
      return intents.sort((first, second) => second.priority - first.priority);
    }
    findSolvableIntent(intents, character, world2, logFailures = false) {
      for (const intent of intents) {
        const candidates = this.planner.solve(
          intent.goal,
          this.planningContext(character, world2)
        );
        if (candidates.length === 0) {
          this.recordUnsolvedAgendaAttempt(intent, character, world2.time);
          if (logFailures) {
            logSimulation(world2, "decision", `${character.name} cannot currently solve ${intent.goal.type}`);
          }
          continue;
        }
        const acceptableCandidates = this.planEvaluator.evaluateAll(
          candidates,
          intent,
          character,
          world2
        ).filter((evaluation) => evaluation.breakdown.riskPenalty <= intent.priority).map((evaluation) => evaluation.plan);
        if (acceptableCandidates.length === 0) {
          this.recordUnsolvedAgendaAttempt(intent, character, world2.time);
          if (logFailures) {
            logSimulation(
              world2,
              "decision",
              `${character.name} declines ${intent.goal.type}; available plans exceed risk budget ${intent.priority.toFixed(1)}`
            );
          }
          continue;
        }
        return { intent, candidates: acceptableCandidates };
      }
      return void 0;
    }
    recordUnsolvedAgendaAttempt(intent, character, time) {
      if (intent.source.type !== "agenda") return;
      const item = character.dailyAgenda?.items.find((candidate) => candidate.id === intent.source.id);
      if (item?.source === "meal-opportunity") item.lastAttemptedAt = time;
    }
    assignSolvedIntent(solved, character, world2) {
      const evaluated = this.planEvaluator.evaluateAll(
        solved.candidates,
        solved.intent,
        character,
        world2
      );
      const best = evaluated[0].plan;
      character.currentIntent = solved.intent;
      character.currentPlan = instantiatePlan(best);
      character.currentPlanKnowledgeRevision = character.knowledgeRevision;
      if (solved.intent.source.type === "agenda") {
        const item = character.dailyAgenda?.items.find(
          (candidate) => candidate.id === solved.intent.source.id
        );
        if (item) item.startedAt ?? (item.startedAt = world2.time);
      }
      logSimulation(
        world2,
        "debug",
        `${character.name} candidates for ${solved.intent.goal.type}: ` + evaluated.map(
          (entry) => `${this.describeCandidate(entry.plan)}, score=${entry.score.toFixed(2)}`
        ).join(" | ")
      );
      if (best.satisfied) {
        logSimulation(world2, "decision", `${character.name} already satisfies ${solved.intent.goal.type}`);
      } else {
        logSimulation(world2, "decision", `${character.name} plans: ${best.definition?.name ?? "unknown"}`);
      }
    }
    planningContext(character, world2) {
      return {
        character,
        time: world2.time,
        minuteOfDay: world2.minuteOfDay,
        ...world2.dayNightEnvironmentEnabled ? {
          environment: {
            outdoorDarkness: isDarkMinuteOfDay(world2.minuteOfDay)
          }
        } : {}
      };
    }
    hasPlanningKnowledgeChanged(character) {
      return character.currentPlanKnowledgeRevision !== void 0 && character.currentPlanKnowledgeRevision !== character.knowledgeRevision;
    }
    describeCandidate(candidate) {
      const target = candidate.target;
      if (candidate.satisfied) {
        if (!target) return "already-satisfied";
        if (target.type === "person") {
          const targetLabel4 = target.personId ?? target.observationId ?? "unknown-person";
          return `already-satisfied(target=${targetLabel4}, knowledge=${target.knowledge}, distance=${target.distance.toFixed(1)}m)`;
        }
        return `already-satisfied(location=(${target.position.x},${target.position.y})${target.subjectId ? `, subject=${target.subjectId}` : ""})`;
      }
      let targetDescription = "";
      if (target?.type === "person") {
        const targetLabel4 = target.personId ?? target.observationId ?? "unknown-person";
        targetDescription = `, target=${targetLabel4}, knowledge=${target.knowledge}, distance=${target.distance.toFixed(1)}m`;
      } else if (target?.type === "location") {
        targetDescription = `, location=(${target.position.x},${target.position.y})${target.subjectId ? `, subject=${target.subjectId}` : ""})`;
      }
      return `${candidate.definition?.name ?? "unknown"}(duration=${candidate.totalDuration}, cost=${candidate.totalCost}, risk=${candidate.totalRisk}${targetDescription})`;
    }
  };

  // src/planning/PlanningContext.ts
  function normalizePlanningContext(input) {
    return {
      character: input.character,
      time: input.time,
      ...input.minuteOfDay !== void 0 ? { minuteOfDay: input.minuteOfDay } : {},
      ...input.environment ? { environment: { ...input.environment } } : {}
    };
  }

  // src/planning/AccommodationPlanning.ts
  function getActiveAccommodationStay(context) {
    return context.character.memory.getByType("accommodation-stay").map((memory) => {
      const placeId = memory.context?.placeId;
      const bedId = memory.context?.bedId;
      const position = memory.context?.position;
      const expiresAt = memory.context?.expiresAt;
      if (typeof placeId !== "string" || typeof bedId !== "string" || typeof position?.x !== "number" || typeof position?.y !== "number" || typeof expiresAt !== "number" || expiresAt <= context.time) return void 0;
      return {
        roomId: memory.subjectId,
        placeId,
        bedId,
        position: { x: position.x, y: position.y },
        expiresAt
      };
    }).filter((stay) => stay !== void 0).sort((first, second) => second.expiresAt - first.expiresAt)[0];
  }
  function getActiveAccommodationTarget(context) {
    const stay = getActiveAccommodationStay(context);
    return stay ? {
      type: "location",
      subjectId: stay.bedId,
      position: { ...stay.position }
    } : void 0;
  }
  function knownAccommodationPrice(context, target) {
    const providerId = target?.type === "location" ? target.subjectId : void 0;
    const facts = context.character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && knowledge.context?.service === "accommodation" && knowledge.context?.offering === "room-day" && (providerId === void 0 || knowledge.subjectId === providerId)
    );
    const price = facts.map((fact) => fact.context?.terms?.price).find((value) => typeof value === "number" && Number.isInteger(value) && value >= 0);
    return price ?? DEFAULT_ROOM_DAY_PRICE;
  }

  // src/planning/GoalSatisfactionRegistry.ts
  var GoalSatisfactionRegistry = class {
    constructor() {
      this.handlers = /* @__PURE__ */ new Map();
    }
    register(goalType, handler) {
      if (this.handlers.has(goalType)) {
        throw new Error(`Goal satisfaction handler already registered for ${goalType}`);
      }
      this.handlers.set(goalType, handler);
    }
    has(goalType) {
      return this.handlers.has(goalType);
    }
    evaluate(goal, context) {
      return this.handlers.get(goal.type)?.(goal, context);
    }
  };
  function createCoreGoalSatisfactionRegistry() {
    const registry = new GoalSatisfactionRegistry();
    registry.register(
      "hasFood",
      (_goal, context) => context.character.physical.getAll().some(
        (possession) => isDirectlyEdibleFood(possession.item)
      )
    );
    registry.register("hasWater", (goal, context) => {
      const requested = Number(goal.parameters?.amount ?? 1);
      const requiredAmount = Number.isFinite(requested) && requested > 0 ? requested : 1;
      return totalCarriedLiquid(context.character.physical.getAll(), "water") >= requiredAmount;
    });
    registry.register(
      "hasDrink",
      (_goal, context) => context.character.physical.getAll().some(
        (possession) => possession.item.drink !== void 0 && getLiquidAmount(possession.item, possession.item.drink.liquidType) >= 1
      )
    );
    registry.register(
      "hasWaterContainer",
      (_goal, context) => context.character.physical.getAll().some(
        (possession) => isCarriedPossession(possession) && isLiquidContainerItem(possession.item)
      )
    );
    registry.register("hasWorkplaceCarrier", (goal, context) => {
      const carrierItemId = goal.parameters?.carrierItemId;
      if (typeof carrierItemId !== "string") return false;
      const carrier = context.character.physical.get(carrierItemId);
      return carrier?.item.solidContainer !== void 0 && (carrier.location.type === "hand" || carrier.location.type === "equipped");
    });
    registry.register(
      "hasMoney",
      (goal, context) => context.character.money >= Number(goal.parameters?.amount ?? 0)
    );
    registry.register("eatFood", (goal, context) => {
      const since = Number(goal.parameters?.since);
      if (!Number.isFinite(since)) return false;
      return context.character.memory.getByType("meal-consumed").some(
        (memory) => memory.lastObservedAt >= since
      );
    });
    registry.register("rested", (_goal, context) => context.character.tiredness <= 20);
    registry.register("socialized", (_goal, context) => context.character.socialNeed < 60);
    registry.register(
      "hasAccommodation",
      (_goal, context) => getActiveAccommodationStay(context) !== void 0
    );
    registry.register("atAccommodation", (_goal, context) => {
      const stay = getActiveAccommodationStay(context);
      return stay !== void 0 && Math.hypot(
        stay.position.x - context.character.position.x,
        stay.position.y - context.character.position.y
      ) <= 0.1;
    });
    registry.register("knowsKnowledge", (goal, context) => {
      const query = knowledgeQueryFromParameters(goal.parameters);
      return query !== void 0 && context.character.knowledge.some(
        (knowledge) => knowledge.type === query.type && (query.subjectId === "*" || knowledge.subjectId === query.subjectId) && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, query.context)
      );
    });
    return registry;
  }

  // src/planning/GoalTargetRegistry.ts
  var GoalTargetRegistry = class {
    constructor() {
      this.handlers = /* @__PURE__ */ new Map();
    }
    register(goalType, handler) {
      if (this.handlers.has(goalType)) {
        throw new Error(`Goal target handler already registered for ${goalType}`);
      }
      this.handlers.set(goalType, handler);
    }
    has(goalType) {
      return this.handlers.has(goalType);
    }
    resolveAll(goal, context) {
      const result = this.handlers.get(goal.type)?.(goal, context);
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    }
  };

  // src/services/ServiceAvailabilityMemory.ts
  var MINUTES_PER_DAY16 = 24 * 60;
  var EVENING_CLOSED_RECONSIDERATION_MINUTE = 18 * 60;
  var LATE_NIGHT_START_MINUTE = 22 * 60;
  var MORNING_RECONSIDERATION_MINUTE = 6 * 60;
  var ORDINARY_CLOSED_RETRY_MINUTES = 30;
  var RECENT_OPEN_EVIDENCE_MINUTES = 5;
  function rememberServicePlaceUnavailable(character, placeId, time, unavailableUntil) {
    if (!Number.isFinite(unavailableUntil) || unavailableUntil <= time) return;
    const existing = character.memory.getByType("service-place-unavailable").find((memory) => memory.subjectId === placeId);
    const existingUntil = typeof existing?.context?.unavailableUntil === "number" ? existing.context.unavailableUntil : time;
    const rememberedUntil = Math.max(existingUntil, unavailableUntil);
    const persistence = Math.max(1, rememberedUntil - time);
    character.memory.remember({
      id: `${character.id}:service-place-unavailable:${placeId}`,
      type: "service-place-unavailable",
      subjectId: placeId,
      persistence,
      confidence: 1,
      createdAt: existing?.createdAt ?? time,
      lastObservedAt: time,
      importance: 0.8,
      context: { unavailableUntil: rememberedUntil }
    });
  }
  function servicePlaceUnavailableUntil(character, placeId, time, service, minuteOfDay) {
    const explicit = character.memory.getByType("service-place-unavailable").find((candidate) => candidate.subjectId === placeId);
    const explicitUntil = typeof explicit?.context?.unavailableUntil === "number" && time < explicit.context.unavailableUntil ? explicit.context.unavailableUntil : void 0;
    const observed = latestObservedServiceState(character, placeId, service);
    let observedUntil;
    if (observed?.state === "closed") {
      observedUntil = observedClosedRetryAt(observed.observedAt, observed.minuteOfDay);
      if (time >= observedUntil) observedUntil = void 0;
    }
    const advertisedUntil = service !== void 0 ? advertisedHoursUnavailableUntil(character, placeId, service, time, minuteOfDay) : void 0;
    const candidates = [explicitUntil, observedUntil, advertisedUntil].filter((value) => value !== void 0);
    return candidates.length > 0 ? Math.max(...candidates) : void 0;
  }
  function isServicePlaceWorthTryingNow(character, placeId, service, time, minuteOfDay) {
    if (servicePlaceUnavailableUntil(character, placeId, time, service, minuteOfDay) !== void 0) return false;
    if (!isLateNight(minuteOfDay)) return true;
    return hasRecentOpenEvidence(character, placeId, service, time);
  }
  function knownServiceRetryAt(character, service, time, minuteOfDay) {
    const placeIds = Array.from(new Set(character.knowledge.filter(
      (knowledge) => knowledge.type === "service-place" && knowledge.polarity === "positive" && knowledge.context?.service === service
    ).map((knowledge) => knowledge.subjectId)));
    return retryAtForPlaces(character, placeIds, service, time, minuteOfDay);
  }
  function knownServiceContextRetryAt(character, context, time, minuteOfDay) {
    const broadContext = context.placeId === void 0 && context.offering === void 0 && context.itemType === void 0 && context.foodKind === void 0;
    if (broadContext) return knownServiceRetryAt(character, context.service, time, minuteOfDay);
    const providerPlaces = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, context) && typeof knowledge.context?.placeId === "string"
    ).map((knowledge) => knowledge.context.placeId);
    const placeIds = context.placeId !== void 0 ? [context.placeId] : Array.from(new Set(providerPlaces));
    return retryAtForPlaces(character, placeIds, context.service, time, minuteOfDay);
  }
  function retryAtForPlaces(character, placeIds, service, time, minuteOfDay) {
    if (placeIds.length === 0) return void 0;
    const retryTimes = placeIds.map((placeId) => {
      if (isServicePlaceWorthTryingNow(character, placeId, service, time, minuteOfDay)) {
        return void 0;
      }
      return servicePlaceUnavailableUntil(character, placeId, time, service, minuteOfDay) ?? lateNightRetryAt(time, minuteOfDay);
    });
    if (retryTimes.some((retryAt) => retryAt === void 0)) return void 0;
    return Math.min(...retryTimes);
  }
  function advertisedHoursUnavailableUntil(character, placeId, service, time, minuteOfDay) {
    if (minuteOfDay === void 0 || !Number.isFinite(minuteOfDay)) return void 0;
    const hours = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-hours" && knowledge.subjectId === placeId && knowledge.polarity === "positive" && knowledge.context?.service === service && Array.isArray(knowledge.context?.hours)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0]?.context?.hours;
    if (!hours?.length) return void 0;
    const valid = hours.filter(isValidWindow);
    if (valid.length === 0) return void 0;
    const current = normalizeMinuteOfDay2(minuteOfDay);
    if (valid.some((window) => isWithinWindow(current, window))) return void 0;
    const minutesUntilOpening = Math.min(...valid.map((window) => {
      const start2 = normalizeMinuteOfDay2(window.startMinuteOfDay);
      const delta = (start2 - current + MINUTES_PER_DAY16) % MINUTES_PER_DAY16;
      return delta === 0 ? MINUTES_PER_DAY16 : delta;
    }));
    return time + Math.max(1, minutesUntilOpening);
  }
  function isValidWindow(window) {
    return Number.isFinite(window.startMinuteOfDay) && Number.isFinite(window.endMinuteOfDay);
  }
  function isWithinWindow(minuteOfDay, window) {
    const start2 = normalizeMinuteOfDay2(window.startMinuteOfDay);
    const end = normalizeMinuteOfDay2(window.endMinuteOfDay);
    if (start2 === end) return true;
    if (start2 < end) return minuteOfDay >= start2 && minuteOfDay < end;
    return minuteOfDay >= start2 || minuteOfDay < end;
  }
  function latestObservedServiceState(character, placeId, service) {
    return character.memory.getByType("service-point-observed").filter((memory) => memory.context?.placeId === placeId).filter((memory) => service === void 0 || Array.isArray(memory.context?.services) && memory.context.services.includes(service)).filter((memory) => memory.context?.state === "open" || memory.context?.state === "closed").filter((memory) => typeof memory.context?.minuteOfDay === "number").sort((first, second) => second.lastObservedAt - first.lastObservedAt).map((memory) => ({
      state: memory.context.state,
      observedAt: memory.lastObservedAt,
      minuteOfDay: memory.context.minuteOfDay
    }))[0];
  }
  function hasRecentOpenEvidence(character, placeId, service, time) {
    const observed = latestObservedServiceState(character, placeId, service);
    return observed?.state === "open" && time - observed.observedAt <= RECENT_OPEN_EVIDENCE_MINUTES;
  }
  function observedClosedRetryAt(time, minuteOfDay) {
    if (!Number.isFinite(minuteOfDay)) return time + ORDINARY_CLOSED_RETRY_MINUTES;
    const normalized = normalizeMinuteOfDay2(minuteOfDay);
    if (normalized >= EVENING_CLOSED_RECONSIDERATION_MINUTE || normalized < MORNING_RECONSIDERATION_MINUTE) {
      return morningRetryAt(time, normalized);
    }
    return time + ORDINARY_CLOSED_RETRY_MINUTES;
  }
  function isLateNight(minuteOfDay) {
    if (minuteOfDay === void 0 || !Number.isFinite(minuteOfDay)) return false;
    const normalized = normalizeMinuteOfDay2(minuteOfDay);
    return normalized >= LATE_NIGHT_START_MINUTE || normalized < MORNING_RECONSIDERATION_MINUTE;
  }
  function lateNightRetryAt(time, minuteOfDay) {
    if (!isLateNight(minuteOfDay) || minuteOfDay === void 0) return void 0;
    return morningRetryAt(time, normalizeMinuteOfDay2(minuteOfDay));
  }
  function morningRetryAt(time, normalizedMinuteOfDay) {
    const minutesUntilMorning = normalizedMinuteOfDay < MORNING_RECONSIDERATION_MINUTE ? MORNING_RECONSIDERATION_MINUTE - normalizedMinuteOfDay : MINUTES_PER_DAY16 - normalizedMinuteOfDay + MORNING_RECONSIDERATION_MINUTE;
    return time + Math.max(1, minutesUntilMorning);
  }
  function normalizeMinuteOfDay2(minuteOfDay) {
    return (Math.floor(minuteOfDay) % MINUTES_PER_DAY16 + MINUTES_PER_DAY16) % MINUTES_PER_DAY16;
  }

  // src/services/ServiceDiscovery.ts
  var CURRENT_PERSON_OBSERVATION_MAX_AGE_MINUTES = 1;
  var CURRENT_SERVICE_STATE_MAX_AGE_MINUTES = 5;
  var LEGACY_SERVICE_POINT_PROVIDER_TOLERANCE_METRES = 1.25;
  var SERVICE_PLACE_TOLERANCE_METRES = 5;
  function nearestKnownServicePlace(character, service) {
    return knownServicePlaces(character, service)[0];
  }
  function nearestAvailableKnownServicePlace(character, service, time, minuteOfDay) {
    return knownServicePlaces(character, service).find((place) => isServicePlaceWorthTryingNow(character, place.id, service, time, minuteOfDay));
  }
  function serviceDiscoveryQuery(character, service, placeId, offering, time, minuteOfDay) {
    const place = placeId ? character.knowledge.find(
      (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === placeId && knowledge.polarity === "positive" && knowledge.context?.service === service && knowledge.position !== void 0
    ) : time === void 0 ? nearestKnownServicePlace(character, service) : nearestAvailableKnownServicePlace(character, service, time, minuteOfDay);
    if (!place) return void 0;
    const resolvedPlaceId = "id" in place ? place.id : place.subjectId;
    const expectedContext = {
      service,
      placeId: resolvedPlaceId,
      ...offering !== void 0 ? { offering } : {}
    };
    const provider = character.knowledge.find(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && knowledge.subjectId !== character.id && knowledge.context?.service === service && knowledge.context?.placeId === resolvedPlaceId && (offering === void 0 || knowledge.context?.offering === offering) && (time === void 0 || !hasRecentServiceProviderUnavailable(
        character,
        knowledge.subjectId,
        expectedContext,
        time
      ))
    );
    if (provider && !hasUsablePersonLocation(character, provider.subjectId)) {
      return { type: "person-location", subjectId: provider.subjectId };
    }
    return {
      type: "service-provider",
      subjectId: "*",
      context: expectedContext
    };
  }
  function getObservedServicePoint(character, service, placeId) {
    return character.memory.getByType("service-point-observed").map((memory) => servicePointFromMemory(memory)).filter((point) => point !== void 0).filter((point) => point.services.includes(service)).filter((point) => placeId === void 0 || point.placeId === placeId).sort((first, second) => second.observedAt - first.observedAt)[0];
  }
  function getContextualServicePersonMemory(character, point, query, time) {
    const providerPointId = point.providerActionPointId ?? serviceProviderActionPointId(point.id);
    const recent = character.memory.getByType("person-observed").filter((memory) => time - memory.lastObservedAt <= 1).filter((memory) => isPosition2(memory.context?.position)).filter((memory) => !hasFailedInquiry(character, memory, query, time)).map((memory) => {
      const position = memory.context.position;
      const occupiedIds = occupiedActionPointIds(memory);
      const providerDocked = occupiedIds !== void 0 ? occupiedIds.includes(providerPointId) : distance(position, point.providerPosition) <= LEGACY_SERVICE_POINT_PROVIDER_TOLERANCE_METRES;
      const pointDistance = distance(position, point.position);
      return { memory, providerDocked, pointDistance };
    }).filter((entry) => entry.providerDocked || entry.pointDistance <= SERVICE_PLACE_TOLERANCE_METRES).sort((first, second) => {
      const firstAtProvider = first.providerDocked ? 0 : 1;
      const secondAtProvider = second.providerDocked ? 0 : 1;
      if (firstAtProvider !== secondAtProvider) return firstAtProvider - secondAtProvider;
      return first.pointDistance - second.pointDistance;
    });
    return recent[0]?.memory;
  }
  function hasRecentServicePointWait(character, pointId, time, retryAfterMinutes = 30) {
    return character.memory.getByType("service-point-wait").some(
      (memory) => memory.subjectId === pointId && time - memory.lastObservedAt < retryAfterMinutes
    );
  }
  function rememberServicePointWait(character, pointId, time) {
    character.memory.remember({
      id: `${character.id}:service-point-wait:${pointId}`,
      type: "service-point-wait",
      subjectId: pointId,
      persistence: 30,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 0.5
    });
  }
  function rememberServiceProviderUnavailable(character, providerId, context, time, reason, retryAfterMinutes = 30) {
    const subjectId = serviceProviderAvailabilityKey(providerId, context);
    character.memory.remember({
      id: `${character.id}:service-provider-unavailable:${subjectId}`,
      type: "service-provider-unavailable",
      subjectId,
      persistence: retryAfterMinutes,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 0.75,
      context: {
        providerId,
        service: context.service,
        ...context.placeId !== void 0 ? { placeId: context.placeId } : {},
        ...context.offering !== void 0 ? { offering: context.offering } : {},
        ...context.itemType !== void 0 ? { itemType: context.itemType } : {},
        ...context.foodKind !== void 0 ? { foodKind: context.foodKind } : {},
        reason,
        retryAfterMinutes
      }
    });
  }
  function hasRecentServiceProviderUnavailable(character, providerId, context, time) {
    return character.memory.getByType("service-provider-unavailable").some((memory) => {
      if (memory.context?.providerId !== providerId) return false;
      if (memory.context?.service !== context.service) return false;
      if (memory.context?.placeId !== void 0 && memory.context.placeId !== context.placeId) return false;
      if (memory.context?.offering !== void 0 && memory.context.offering !== context.offering) return false;
      if (memory.context?.itemType !== void 0 && memory.context.itemType !== context.itemType) return false;
      if (memory.context?.foodKind !== void 0 && memory.context.foodKind !== context.foodKind) return false;
      const retryAfter = typeof memory.context?.retryAfterMinutes === "number" ? memory.context.retryAfterMinutes : 30;
      return time - memory.lastObservedAt < retryAfter;
    });
  }
  function isCustomerServiceProviderEligible(character, providerId, context, time) {
    if (providerId === character.id || hasRecentServiceProviderUnavailable(character, providerId, context, time)) {
      return false;
    }
    if (!context.placeId) return true;
    const point = getObservedServicePoint(character, context.service, context.placeId);
    if (point?.state === "closed" && time - point.observedAt <= CURRENT_SERVICE_STATE_MAX_AGE_MINUTES) {
      return false;
    }
    if (point?.providerOccupied === false && time - point.observedAt <= CURRENT_SERVICE_STATE_MAX_AGE_MINUTES) {
      return false;
    }
    const currentProviderObservation = character.memory.getByType("person-observed").filter((memory) => memory.context?.identifiedPersonId === providerId).filter((memory) => time - memory.lastObservedAt <= CURRENT_PERSON_OBSERVATION_MAX_AGE_MINUTES).filter((memory) => isPosition2(memory.context?.position)).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
    if (!currentProviderObservation) return true;
    const observedPosition = currentProviderObservation.context.position;
    if (point) {
      const occupiedIds = occupiedActionPointIds(currentProviderObservation);
      if (occupiedIds !== void 0) {
        return occupiedIds.includes(
          point.providerActionPointId ?? serviceProviderActionPointId(point.id)
        );
      }
      return distance(observedPosition, point.providerPosition) <= LEGACY_SERVICE_POINT_PROVIDER_TOLERANCE_METRES;
    }
    const knownPlace = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === context.placeId && knowledge.polarity === "positive" && knowledge.context?.service === context.service && knowledge.position !== void 0
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    if (!knownPlace?.position) return true;
    return distance(observedPosition, knownPlace.position) <= SERVICE_PLACE_TOLERANCE_METRES;
  }
  function knowledgeQueryContextKey(query) {
    return JSON.stringify(query.context ?? null);
  }
  function knownServicePlaces(character, service) {
    const byPlace = /* @__PURE__ */ new Map();
    for (const knowledge of character.knowledge) {
      if (knowledge.type !== "service-place" || knowledge.polarity !== "positive" || knowledge.context?.service !== service || knowledge.position === void 0) continue;
      byPlace.set(knowledge.subjectId, {
        id: knowledge.subjectId,
        service,
        position: { ...knowledge.position }
      });
    }
    return Array.from(byPlace.values()).sort(
      (first, second) => distance(character.position, first.position) - distance(character.position, second.position)
    );
  }
  function serviceProviderAvailabilityKey(providerId, context) {
    return [
      providerId,
      context.service,
      context.placeId ?? "*",
      context.offering ?? "*",
      context.itemType ?? "*",
      context.foodKind ?? "*"
    ].join(":");
  }
  function servicePointFromMemory(memory) {
    const placeId = memory.context?.placeId;
    const services = memory.context?.services;
    const position = memory.context?.position;
    const providerPosition = memory.context?.providerPosition;
    const customerPosition = memory.context?.customerPosition;
    const providerActionPointId = memory.context?.providerActionPointId;
    const customerActionPointId = memory.context?.customerActionPointId;
    const providerOccupied = memory.context?.providerOccupied;
    const customerOccupied = memory.context?.customerOccupied;
    const state2 = memory.context?.state;
    if (typeof placeId !== "string") return void 0;
    if (!Array.isArray(services) || !services.every(isServiceType)) return void 0;
    if (!isPosition2(position) || !isPosition2(providerPosition) || !isPosition2(customerPosition)) return void 0;
    if (providerActionPointId !== void 0 && typeof providerActionPointId !== "string") return void 0;
    if (customerActionPointId !== void 0 && typeof customerActionPointId !== "string") return void 0;
    if (providerOccupied !== void 0 && typeof providerOccupied !== "boolean") return void 0;
    if (customerOccupied !== void 0 && typeof customerOccupied !== "boolean") return void 0;
    if (state2 !== void 0 && state2 !== "open" && state2 !== "closed") return void 0;
    return {
      id: memory.subjectId,
      placeId,
      services,
      position: { ...position },
      providerPosition: { ...providerPosition },
      customerPosition: { ...customerPosition },
      ...typeof providerActionPointId === "string" ? { providerActionPointId } : {},
      ...typeof customerActionPointId === "string" ? { customerActionPointId } : {},
      ...typeof providerOccupied === "boolean" ? { providerOccupied } : {},
      ...typeof customerOccupied === "boolean" ? { customerOccupied } : {},
      ...state2 !== void 0 ? { state: state2 } : {},
      observedAt: memory.lastObservedAt
    };
  }
  function hasUsablePersonLocation(character, personId) {
    if (personId === character.id) return true;
    if (character.knowledge.some(
      (knowledge) => knowledge.type === "person-location" && knowledge.subjectId === personId && knowledge.polarity === "positive" && knowledge.position !== void 0
    )) return true;
    return character.memory.getByType("person-observed").some(
      (memory) => memory.context?.identifiedPersonId === personId && isPosition2(memory.context?.position)
    );
  }
  function hasFailedInquiry(character, personMemory, query, time) {
    const sourceKeys = [`observation:${personMemory.subjectId}`];
    const identifiedPersonId = personMemory.context?.identifiedPersonId;
    if (typeof identifiedPersonId === "string") sourceKeys.push(`person:${identifiedPersonId}`);
    const contextKey = knowledgeQueryContextKey(query);
    return character.memory.getByType("knowledge-inquiry").some(
      (memory) => memory.context?.knowledgeType === query.type && memory.context?.knowledgeSubjectId === query.subjectId && memory.context?.knowledgeContextKey === contextKey && typeof memory.context?.sourceKey === "string" && sourceKeys.includes(memory.context.sourceKey) && time - memory.lastObservedAt < 180
    );
  }
  function occupiedActionPointIds(memory) {
    const value = memory.context?.occupiedActionPointIds;
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : void 0;
  }
  function isPosition2(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function distance(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  // src/planning/ServicePlans.ts
  function serviceProviderLocationGoal(context) {
    return {
      type: "knowsServiceProviderLocation",
      parameters: { ...context }
    };
  }
  function atServiceProviderLocationGoal(context) {
    return {
      type: "atServiceProviderLocation",
      parameters: { ...context }
    };
  }
  function serviceProviderQueryForGoal(character, goal, time, minuteOfDay) {
    if (goal.parameters?.discoveryMode === "known-only") return void 0;
    const context = serviceContextFromGoal(goal);
    if (!context) return void 0;
    if (time !== void 0 && knownServiceContextRetryAt(character, context, time, minuteOfDay) !== void 0) {
      return void 0;
    }
    const provider = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, context) && knowledge.subjectId !== character.id && (time === void 0 || knowledge.context?.placeId === void 0 || isServicePlaceWorthTryingNow(
        character,
        knowledge.context.placeId,
        context.service,
        time,
        minuteOfDay
      )) && (time === void 0 || isCustomerServiceProviderEligible(
        character,
        knowledge.subjectId,
        knowledge.context ?? context,
        time
      ))
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    if (provider && !hasUsablePersonLocation2(character, provider.subjectId)) {
      return { type: "person-location", subjectId: provider.subjectId };
    }
    return {
      type: "service-provider",
      subjectId: "*",
      context
    };
  }
  function serviceContextFromGoal(goal) {
    const service = goal.parameters?.service;
    const offering = goal.parameters?.offering;
    const placeId = goal.parameters?.placeId;
    const itemType = goal.parameters?.itemType;
    const itemCategory = goal.parameters?.itemCategory;
    const foodKind = goal.parameters?.foodKind;
    if (!isServiceType(service)) return void 0;
    if (offering !== void 0 && !isServiceOfferingType(offering)) return void 0;
    if (placeId !== void 0 && typeof placeId !== "string") return void 0;
    if (itemType !== void 0 && (typeof itemType !== "string" || itemType.length === 0)) return void 0;
    if (itemCategory !== void 0 && !isItemCategory(itemCategory)) return void 0;
    if (foodKind !== void 0 && !isFoodKind(foodKind)) return void 0;
    return {
      service,
      ...offering !== void 0 ? { offering } : {},
      ...typeof placeId === "string" ? { placeId } : {},
      ...typeof itemType === "string" ? { itemType } : {},
      ...isItemCategory(itemCategory) ? { itemCategory } : {},
      ...isFoodKind(foodKind) ? { foodKind } : {}
    };
  }
  var servicePlans = [
    {
      id: "defer-service-provider-visit",
      name: "Wait Until Service May Be Available",
      achieves: { type: "atServiceProviderLocation" },
      kind: "deferral",
      prerequisites: [],
      duration: 0,
      risk: 0,
      cost: 0,
      isAvailable: (context, goal) => {
        if (!goal) return false;
        const serviceContext = serviceContextFromGoal(goal);
        return serviceContext !== void 0 && knownServiceContextRetryAt(
          context.character,
          serviceContext,
          context.time,
          context.minuteOfDay
        ) !== void 0;
      },
      estimate: (goal, context) => {
        const serviceContext = serviceContextFromGoal(goal);
        const retryAt = serviceContext ? knownServiceContextRetryAt(
          context.character,
          serviceContext,
          context.time,
          context.minuteOfDay
        ) : void 0;
        return { duration: retryAt === void 0 ? 0 : Math.max(0, retryAt - context.time) };
      }
    },
    {
      id: "go-to-service-provider-location",
      name: "Go To Service Provider",
      achieves: { type: "atServiceProviderLocation" },
      prerequisites: [],
      getPrerequisites: (goal) => [{
        type: "knowsServiceProviderLocation",
        parameters: goal.parameters ? { ...goal.parameters } : void 0
      }],
      duration: 0,
      risk: 0,
      cost: 0,
      isTargetAvailable: (goal, context, target) => {
        const serviceContext = serviceContextFromGoal(goal);
        if (!serviceContext) return false;
        if (knownServiceContextRetryAt(
          context.character,
          serviceContext,
          context.time,
          context.minuteOfDay
        ) !== void 0) return false;
        if (serviceContext.placeId !== void 0 && !isServicePlaceWorthTryingNow(
          context.character,
          serviceContext.placeId,
          serviceContext.service,
          context.time,
          context.minuteOfDay
        )) return false;
        return isTravelTargetReachable(context, target);
      },
      estimate: (_goal, context, target) => ({
        duration: estimateTravelDuration(context, target)
      })
    },
    {
      id: "ask-service-provider",
      name: "Ask About Service Provider",
      achieves: { type: "knowsServiceProviderLocation" },
      prerequisites: [],
      getPrerequisites: (goal, context) => {
        const query = serviceProviderQueryForGoal(
          context.character,
          goal,
          context.time,
          context.minuteOfDay
        );
        return query ? [{
          type: "withinConversationRange",
          parameters: knowledgeQueryParameters(query)
        }] : [];
      },
      duration: 10,
      risk: 5,
      cost: 0,
      isAvailable: (context, goal) => goal !== void 0 && serviceProviderQueryForGoal(
        context.character,
        goal,
        context.time,
        context.minuteOfDay
      ) !== void 0
    }
  ];
  function hasUsablePersonLocation2(character, personId) {
    if (personId === character.id) return true;
    if (character.knowledge.some(
      (knowledge) => knowledge.type === "person-location" && knowledge.subjectId === personId && knowledge.polarity === "positive" && knowledge.position !== void 0
    )) return true;
    return character.memory.getByType("person-observed").some((memory) => {
      const position = memory.context?.position;
      return memory.context?.identifiedPersonId === personId && typeof position?.x === "number" && typeof position?.y === "number";
    });
  }

  // src/planning/CorePlanningGoals.ts
  function registerCorePlanningGoalHandlers(goalSatisfaction, goalTargets) {
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "hasPerson",
      (goal, context) => getAvailablePersonTargets(goal, context).length > 0
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "knowsServiceProviderLocation",
      (goal, context) => getServiceProviderLocationTargets(goal, context).length > 0
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "knowsWaterSource",
      (_goal, context) => getWaterSourceLocationTarget(context) !== void 0
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "knowsHome",
      (_goal, context) => getHomeLocationTarget(context) !== void 0
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "atServiceProviderLocation",
      (goal, context) => getServiceProviderLocationTargets(goal, context).some((target) => isAtTargetLocation(target, context))
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "atWaterSource",
      (_goal, context) => isAtTargetLocation(getWaterSourceLocationTarget(context), context)
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "atHome",
      (_goal, context) => isAtTargetLocation(getHomeLocationTarget(context), context)
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "atLocation",
      (goal, context) => isAtTargetLocation(getGoalLocationTarget(goal), context)
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "withinConversationRange",
      (goal, context) => getConversationRangeTargets(goal, context).length > 0
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "atPerson",
      (goal, context) => isAtKnownPerson(goal, context)
    );
    registerGoalSatisfactionHandler(
      goalSatisfaction,
      "personArrived",
      (goal, context) => isAtKnownPerson(goal, context)
    );
    registerGoalTargetHandler(
      goalTargets,
      "hasPerson",
      (goal, context) => getAvailablePersonTargets(goal, context)
    );
    registerGoalTargetHandler(
      goalTargets,
      "withinConversationRange",
      (goal, context) => getConversationRangeTargets(goal, context)
    );
    registerGoalTargetHandler(
      goalTargets,
      "knowsKnowledge",
      (goal, context) => getKnowledgeLocationTargets(goal, context)
    );
    registerGoalTargetHandler(
      goalTargets,
      "knowsServiceProviderLocation",
      (goal, context) => getServiceProviderLocationTargets(goal, context)
    );
    registerGoalTargetHandler(
      goalTargets,
      "atServiceProviderLocation",
      (goal, context) => getServiceProviderLocationTargets(goal, context).filter((target) => isAtTargetLocation(target, context))
    );
    registerGoalTargetHandler(
      goalTargets,
      "knowsWaterSource",
      (_goal, context) => asTargets(getWaterSourceLocationTarget(context))
    );
    registerGoalTargetHandler(goalTargets, "atWaterSource", (_goal, context) => {
      const target = getWaterSourceLocationTarget(context);
      return target && isAtTargetLocation(target, context) ? [target] : [];
    });
    registerGoalTargetHandler(
      goalTargets,
      "knowsHome",
      (_goal, context) => asTargets(getHomeLocationTarget(context))
    );
    registerGoalTargetHandler(goalTargets, "atHome", (_goal, context) => {
      const target = getHomeLocationTarget(context);
      return target && isAtTargetLocation(target, context) ? [target] : [];
    });
    registerGoalTargetHandler(goalTargets, "atLocation", (goal, context) => {
      const target = getGoalLocationTarget(goal);
      return target && isAtTargetLocation(target, context) ? [target] : [];
    });
    registerGoalTargetHandler(
      goalTargets,
      "atPerson",
      (goal, context) => isAtKnownPerson(goal, context) ? asTargets(getKnownPersonGoalTarget(goal, context)) : []
    );
    registerGoalTargetHandler(
      goalTargets,
      "personArrived",
      (goal, context) => isAtKnownPerson(goal, context) ? asTargets(getKnownPersonGoalTarget(goal, context)) : []
    );
  }
  function registerGoalSatisfactionHandler(registry, goalType, handler) {
    if (!registry.has(goalType)) registry.register(goalType, handler);
  }
  function registerGoalTargetHandler(registry, goalType, handler) {
    if (!registry.has(goalType)) registry.register(goalType, handler);
  }
  function getServiceProviderLocationTargets(goal, context) {
    const expectedContext = serviceContextFromGoal(goal);
    if (!expectedContext) return [];
    const targets = [];
    for (const knowledge of context.character.knowledge) {
      if (knowledge.type !== "service-provider" || knowledge.polarity !== "positive" || !serviceContextMatches(knowledge.context, expectedContext) || !isKnownProviderFactWorthTrying(knowledge.context, context) || !isCustomerServiceProviderEligible(
        context.character,
        knowledge.subjectId,
        knowledge.context ?? expectedContext,
        context.time
      )) continue;
      const placeId = knowledge.context?.placeId;
      if (placeId && knowledge.context) {
        const point = getObservedServicePoint(
          context.character,
          knowledge.context.service,
          placeId
        );
        if (point) {
          targets.push({
            type: "location",
            subjectId: knowledge.subjectId,
            position: { ...point.customerPosition }
          });
          continue;
        }
        const place = context.character.knowledge.filter(
          (candidate) => candidate.type === "service-place" && candidate.subjectId === placeId && candidate.polarity === "positive" && candidate.context?.service === knowledge.context?.service && candidate.position !== void 0
        ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
        if (place?.position) {
          targets.push({
            type: "location",
            subjectId: knowledge.subjectId,
            position: { ...place.position }
          });
          continue;
        }
      }
      const location = getBestKnownPersonLocation(knowledge.subjectId, context);
      if (!location) continue;
      targets.push({
        type: "location",
        subjectId: knowledge.subjectId,
        position: { ...location }
      });
    }
    return targets;
  }
  function isKnownProviderFactWorthTrying(serviceContext, context) {
    if (!serviceContext?.placeId) return true;
    return isServicePlaceWorthTryingNow(
      context.character,
      serviceContext.placeId,
      serviceContext.service,
      context.time,
      context.minuteOfDay
    );
  }
  function isAtTargetLocation(target, context) {
    if (!target) return false;
    return Math.hypot(
      context.character.position.x - target.position.x,
      context.character.position.y - target.position.y
    ) < 0.1;
  }
  function isAtKnownPerson(goal, context) {
    const personId = goal.parameters?.personId;
    if (typeof personId !== "string") return false;
    const knownLocation = getBestKnownPersonLocation(personId, context);
    if (!knownLocation) return false;
    return Math.hypot(
      context.character.position.x - knownLocation.x,
      context.character.position.y - knownLocation.y
    ) <= CHARACTER_PERSON_APPROACH_RANGE_METRES + 1e-6;
  }
  function getAvailablePersonTargets(goal, context) {
    const query = knowledgeQueryFromParameters(goal.parameters);
    const known = Array.from(context.character.knownPeople).map((id) => createKnownPersonTarget(id, context)).filter((target) => target !== void 0).filter((target) => !hasFailedKnowledgeInquiry(target, query, context));
    const observed = context.character.memory.getByType("person-observed").filter((memory) => memory.context?.identifiedPersonId === void 0).map((memory) => createObservedPersonTarget(memory, context)).filter((target) => target !== void 0).filter((target) => !hasFailedKnowledgeInquiry(target, query, context));
    return [...known, ...observed];
  }
  function getConversationRangeTargets(goal, context) {
    return getAvailablePersonTargets(goal, context).filter((target) => isWithinConversationRange(target.distance));
  }
  function hasFailedKnowledgeInquiry(target, query, context) {
    if (!query) return false;
    const retryAfterMinutes = 180;
    const sourceKeys = getSubjectiveSourceKeys(target, context);
    const contextKey = knowledgeQueryContextKey(query);
    return context.character.memory.getByType("knowledge-inquiry").some(
      (memory) => memory.context?.knowledgeType === query.type && memory.context?.knowledgeSubjectId === query.subjectId && (memory.context?.knowledgeContextKey ?? JSON.stringify(null)) === contextKey && typeof memory.context?.sourceKey === "string" && sourceKeys.includes(memory.context.sourceKey) && context.time - memory.lastObservedAt < retryAfterMinutes
    );
  }
  function getSubjectiveSourceKeys(target, context) {
    const keys = [];
    if (target.personId) {
      keys.push(`person:${target.personId}`);
      for (const memory of context.character.memory.getByType("person-observed")) {
        if (memory.context?.identifiedPersonId === target.personId) {
          keys.push(`observation:${memory.subjectId}`);
        }
      }
    }
    if (target.observationId) keys.push(`observation:${target.observationId}`);
    return keys;
  }
  function asTargets(target) {
    return target ? [target] : [];
  }

  // src/planning/Planner.ts
  var Planner = class {
    constructor(registry, goalSatisfaction = createCoreGoalSatisfactionRegistry(), goalTargets = new GoalTargetRegistry()) {
      this.registry = registry;
      this.goalSatisfaction = goalSatisfaction;
      this.goalTargets = goalTargets;
      registerCorePlanningGoalHandlers(this.goalSatisfaction, this.goalTargets);
    }
    solve(goal, input, resolving = /* @__PURE__ */ new Set()) {
      const context = normalizePlanningContext(input);
      return this.solveWithCache(goal, context, resolving, /* @__PURE__ */ new Map());
    }
    solveWithCache(goal, context, resolving, cache) {
      const goalKey = this.goalKey(goal);
      if (resolving.has(goalKey)) {
        return [];
      }
      const cacheKey = this.planningCacheKey(goalKey, resolving);
      const cached = cache.get(cacheKey);
      if (cached !== void 0) {
        return this.cloneCandidates(cached);
      }
      if (this.isGoalSatisfied(goal, context)) {
        const targets = this.getSatisfiedTargets(goal, context);
        const candidates2 = targets.length === 0 ? [this.createSatisfiedCandidate(goal)] : targets.map((target) => this.createSatisfiedCandidate(goal, target));
        cache.set(cacheKey, this.cloneCandidates(candidates2));
        return candidates2;
      }
      const nextResolving = new Set(resolving);
      nextResolving.add(goalKey);
      const candidates = [];
      for (const plan of this.registry.getPlansFor(goal)) {
        if (plan.isAvailable && !plan.isAvailable(context, goal)) continue;
        let prerequisiteCombinations = [[]];
        let canSolve = true;
        const prerequisites = plan.getPrerequisites?.(goal, context) ?? plan.prerequisites;
        for (const prerequisite of prerequisites) {
          const solutions = this.solveWithCache(prerequisite, context, nextResolving, cache);
          if (solutions.length === 0) {
            canSolve = false;
            break;
          }
          prerequisiteCombinations = prerequisiteCombinations.flatMap(
            (existing) => solutions.map((solution) => [...existing, solution])
          );
        }
        if (!canSolve) continue;
        for (const basePrerequisitePlans of prerequisiteCombinations) {
          const target = this.getPlanTarget(plan, basePrerequisitePlans, context, goal);
          if (plan.isTargetAvailable && !plan.isTargetAvailable(goal, context, target)) continue;
          let targetPrerequisiteCombinations = [basePrerequisitePlans];
          let targetCanSolve = true;
          const targetPrerequisites = plan.getTargetPrerequisites?.(goal, context, target) ?? [];
          for (const prerequisite of targetPrerequisites) {
            const solutions = this.solveWithCache(prerequisite, context, nextResolving, cache);
            if (solutions.length === 0) {
              targetCanSolve = false;
              break;
            }
            targetPrerequisiteCombinations = targetPrerequisiteCombinations.flatMap(
              (existing) => solutions.map((solution) => [...existing, solution])
            );
          }
          if (!targetCanSolve) continue;
          for (const prerequisitePlans of targetPrerequisiteCombinations) {
            const estimate = plan.estimate?.(goal, context, target);
            const duration = this.estimateValue(estimate?.duration, plan.duration, "duration", plan.id);
            const cost = this.estimateValue(estimate?.cost, plan.cost, "cost", plan.id);
            const risk = this.estimateValue(estimate?.risk, plan.risk, "risk", plan.id);
            const expectedNeedRelief = this.estimateNeedRelief(estimate?.needRelief, plan.id);
            candidates.push({
              definition: plan,
              goal,
              prerequisites: prerequisitePlans,
              totalDuration: duration + prerequisitePlans.reduce((total, candidate) => total + candidate.totalDuration, 0),
              totalCost: cost + prerequisitePlans.reduce((total, candidate) => total + candidate.totalCost, 0),
              totalRisk: risk + prerequisitePlans.reduce((total, candidate) => total + candidate.totalRisk, 0),
              expectedNeedRelief,
              satisfied: false,
              target
            });
          }
        }
      }
      const prunedCandidates = this.pruneDominatedCandidates(candidates);
      cache.set(cacheKey, this.cloneCandidates(prunedCandidates));
      return prunedCandidates;
    }
    isGoalSatisfied(goal, input) {
      const context = normalizePlanningContext(input);
      return this.goalSatisfaction.evaluate(goal, context) ?? false;
    }
    createSatisfiedCandidate(goal, target) {
      return {
        definition: null,
        goal,
        prerequisites: [],
        totalDuration: 0,
        totalCost: 0,
        totalRisk: 0,
        satisfied: true,
        target
      };
    }
    getSatisfiedTargets(goal, context) {
      return this.goalTargets.resolveAll(goal, context);
    }
    getPlanTarget(plan, prerequisitePlans, context, goal) {
      const prerequisiteTargets = prerequisitePlans.map((candidate) => candidate.target);
      return plan.resolveTarget ? plan.resolveTarget(goal, context, prerequisiteTargets) : inheritFirstPlanTarget(prerequisiteTargets);
    }
    estimateValue(value, fallback, name, planId) {
      const estimate = value ?? fallback;
      if (!Number.isFinite(estimate) || estimate < 0) {
        throw new Error(`Plan ${planId} ${name} estimate must be a non-negative finite number.`);
      }
      return estimate;
    }
    estimateNeedRelief(value, planId) {
      if (!value) return void 0;
      const result = {};
      for (const need of ["hunger", "thirst", "tiredness"]) {
        const amount = value[need];
        if (amount === void 0) continue;
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(`Plan ${planId} ${need} relief estimate must be a non-negative finite number.`);
        }
        result[need] = amount;
      }
      return Object.keys(result).length > 0 ? result : void 0;
    }
    pruneDominatedCandidates(candidates) {
      const groupedIndices = /* @__PURE__ */ new Map();
      candidates.forEach((candidate, index) => {
        if (!candidate.definition) return;
        let bySignature = groupedIndices.get(candidate.definition);
        if (!bySignature) {
          bySignature = /* @__PURE__ */ new Map();
          groupedIndices.set(candidate.definition, bySignature);
        }
        const signature = JSON.stringify([
          this.planTargetKey(candidate.target),
          this.needReliefKey(candidate.expectedNeedRelief)
        ]);
        const indices = bySignature.get(signature) ?? [];
        indices.push(index);
        bySignature.set(signature, indices);
      });
      const dominated = /* @__PURE__ */ new Set();
      for (const bySignature of groupedIndices.values()) {
        for (const indices of bySignature.values()) {
          for (const index of indices) {
            if (indices.some(
              (otherIndex) => otherIndex !== index && this.dominates(candidates[otherIndex], candidates[index])
            )) {
              dominated.add(index);
            }
          }
        }
      }
      return candidates.filter((_candidate, index) => !dominated.has(index));
    }
    dominates(preferred, other) {
      const noWorse = preferred.totalDuration <= other.totalDuration && preferred.totalCost <= other.totalCost && preferred.totalRisk <= other.totalRisk;
      const strictlyBetter = preferred.totalDuration < other.totalDuration || preferred.totalCost < other.totalCost || preferred.totalRisk < other.totalRisk;
      return noWorse && strictlyBetter;
    }
    planTargetKey(target) {
      if (!target) return JSON.stringify(null);
      if (target.type === "location") {
        return JSON.stringify([
          target.type,
          target.subjectId ?? null,
          target.position.x,
          target.position.y
        ]);
      }
      return JSON.stringify([
        target.type,
        target.personId ?? null,
        target.observationId ?? null,
        target.knowledge,
        target.position.x,
        target.position.y,
        target.distance
      ]);
    }
    needReliefKey(needRelief) {
      return JSON.stringify([
        needRelief?.hunger ?? null,
        needRelief?.thirst ?? null,
        needRelief?.tiredness ?? null
      ]);
    }
    cloneCandidates(candidates) {
      return candidates.map((candidate) => this.cloneCandidate(candidate));
    }
    cloneCandidate(candidate) {
      return {
        ...candidate,
        prerequisites: candidate.prerequisites.map((prerequisite) => this.cloneCandidate(prerequisite)),
        expectedNeedRelief: candidate.expectedNeedRelief ? { ...candidate.expectedNeedRelief } : void 0,
        target: this.clonePlanTarget(candidate.target)
      };
    }
    clonePlanTarget(target) {
      if (!target) return void 0;
      if (target.type === "person") {
        return {
          ...target,
          position: { ...target.position }
        };
      }
      return {
        ...target,
        position: { ...target.position }
      };
    }
    planningCacheKey(goalKey, resolving) {
      return JSON.stringify([goalKey, Array.from(resolving).sort()]);
    }
    goalKey(goal) {
      return `${goal.type}:${JSON.stringify(goal.parameters ?? {})}`;
    }
  };

  // src/planning/PlannerRegistry.ts
  var PlannerRegistry = class {
    constructor() {
      this.plans = [];
    }
    register(plan) {
      this.plans.push(plan);
    }
    registerMany(plans) {
      for (const plan of plans) {
        this.register(plan);
      }
    }
    getPlansFor(goal) {
      return this.plans.filter(
        (plan) => this.goalMatches(plan.achieves, goal)
      );
    }
    goalMatches(achieved, requested) {
      if (achieved.type !== requested.type) {
        return false;
      }
      if (!achieved.parameters) {
        return true;
      }
      if (!requested.parameters) {
        return true;
      }
      for (const [key, value] of Object.entries(requested.parameters)) {
        if (achieved.parameters[key] !== value) {
          return false;
        }
      }
      return true;
    }
  };

  // src/planning/FoodPlans.ts
  var LEGACY_FOOD_PRICE = 3;
  var LEGACY_FOOD_DURATION = 30;
  var LEGACY_FOOD_HUNGER_RELIEF = 70;
  var PREPARED_MEAL_HUNGER_RELIEF = 90;
  var KNOWN_ONLY_ACQUISITION = "known-only";
  var FOOD_PLACE_INSPECTION_RADIUS_METRES = 6;
  var FOOD_PLACE_INSPECTION_POINT_TOLERANCE_METRES = 1;
  var FOOD_PLACE_EXTERIOR_DOOR_MIN_RADIUS_METRES = FOOD_PLACE_INSPECTION_RADIUS_METRES / 2;
  var FOOD_PLACE_EXTERIOR_DOOR_MAX_RADIUS_METRES = FOOD_PLACE_INSPECTION_RADIUS_METRES + 2;
  function isFoodProviderGoal(goal) {
    return goal !== void 0 && serviceContextFromGoal(goal)?.service === "food";
  }
  function availableFoodServicePlace(context, goal) {
    const requestedPlaceId = goal ? serviceContextFromGoal(goal)?.placeId : void 0;
    if (requestedPlaceId) {
      const place = context.character.knowledge.filter(
        (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === requestedPlaceId && knowledge.polarity === "positive" && knowledge.context?.service === "food" && knowledge.position !== void 0
      ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
      if (!place?.position || !isServicePlaceWorthTryingNow(
        context.character,
        requestedPlaceId,
        "food",
        context.time,
        context.minuteOfDay
      )) return void 0;
      return { id: requestedPlaceId, position: { ...place.position } };
    }
    return nearestAvailableKnownServicePlace(
      context.character,
      "food",
      context.time,
      context.minuteOfDay
    );
  }
  function availableFoodServicePoint(context, goal) {
    const place = availableFoodServicePlace(context, goal);
    if (!place) return void 0;
    const point = getObservedServicePoint(context.character, "food", place.id);
    return point ? { place, point } : void 0;
  }
  function hasVisibleFoodAdvertising(context, placeId) {
    const hasReadableOffering = context.character.knowledge.some(
      (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === placeId && knowledge.polarity === "positive" && knowledge.context?.service === "food" && knowledge.context?.offering !== void 0
    );
    if (hasReadableOffering) return true;
    return context.character.memory.getByType("place-observed").some(
      (memory) => memory.context?.knownPlaceId === placeId && memory.context?.hasAdvertisedServiceOfferings === true
    );
  }
  function advertisedFoodPlaceForGoal(context, goal) {
    const place = availableFoodServicePlace(context, goal);
    if (!place) return void 0;
    return hasVisibleFoodAdvertising(context, place.id) ? place : void 0;
  }
  function observedFoodPlaceDoorEntryPosition(place, context) {
    const candidates = context.character.navigationKnowledge.getAllBarriers().filter(
      (knowledge) => knowledge.barrier.type === "door" && knowledge.barrier.state === "open"
    ).map((knowledge) => {
      const first = {
        x: knowledge.first.x + 0.5,
        y: knowledge.first.y + 0.5
      };
      const second = {
        x: knowledge.second.x + 0.5,
        y: knowledge.second.y + 0.5
      };
      const firstDistance = Math.hypot(
        first.x - place.position.x,
        first.y - place.position.y
      );
      const secondDistance = Math.hypot(
        second.x - place.position.x,
        second.y - place.position.y
      );
      const innerDistance = Math.min(firstDistance, secondDistance);
      const outerDistance = Math.max(firstDistance, secondDistance);
      if (innerDistance < FOOD_PLACE_EXTERIOR_DOOR_MIN_RADIUS_METRES || outerDistance > FOOD_PLACE_EXTERIOR_DOOR_MAX_RADIUS_METRES) return void 0;
      const inside = firstDistance <= secondDistance ? first : second;
      return {
        position: inside,
        distanceFromCharacter: Math.hypot(
          inside.x - context.character.position.x,
          inside.y - context.character.position.y
        )
      };
    }).filter((candidate) => candidate !== void 0).sort((first, second) => first.distanceFromCharacter - second.distanceFromCharacter);
    return candidates[0]?.position;
  }
  function advertisedFoodInspectionPosition(place, context) {
    const knownDoorEntry = observedFoodPlaceDoorEntryPosition(place, context);
    if (knownDoorEntry) return knownDoorEntry;
    const inspectionPoints = [
      {
        x: place.position.x,
        y: place.position.y - FOOD_PLACE_INSPECTION_RADIUS_METRES
      },
      {
        x: place.position.x + FOOD_PLACE_INSPECTION_RADIUS_METRES,
        y: place.position.y
      },
      {
        x: place.position.x,
        y: place.position.y + FOOD_PLACE_INSPECTION_RADIUS_METRES
      },
      {
        x: place.position.x - FOOD_PLACE_INSPECTION_RADIUS_METRES,
        y: place.position.y
      }
    ];
    const ranked = inspectionPoints.map((position, index) => ({
      index,
      position,
      distance: Math.hypot(
        position.x - context.character.position.x,
        position.y - context.character.position.y
      )
    })).sort((first, second) => first.distance - second.distance);
    const nearest = ranked[0];
    if (nearest.distance <= FOOD_PLACE_INSPECTION_POINT_TOLERANCE_METRES) {
      return inspectionPoints[(nearest.index + 1) % inspectionPoints.length];
    }
    return nearest.position;
  }
  function servicePlaceInteractionTarget(goal, context) {
    const pointTarget = availableFoodServicePoint(context, goal);
    if (pointTarget) {
      return {
        place: pointTarget.place,
        position: { ...pointTarget.point.customerPosition }
      };
    }
    const place = advertisedFoodPlaceForGoal(context, goal);
    return place ? {
      place,
      position: advertisedFoodInspectionPosition(place, context)
    } : void 0;
  }
  function servicePlacePrerequisites(goal, context) {
    const target = servicePlaceInteractionTarget(goal, context);
    return target ? [{
      type: "atLocation",
      parameters: {
        subjectId: target.place.id,
        position: { ...target.position }
      }
    }] : [];
  }
  function isAtServicePlace(goal, context) {
    const target = servicePlaceInteractionTarget(goal, context);
    return !!target && Math.hypot(
      target.position.x - context.character.position.x,
      target.position.y - context.character.position.y
    ) <= 0.1;
  }
  function canPrepareOwnMeal(context) {
    const character = context.character;
    return character.activities.some((activity) => activity.id === "prepared-meal-service") && character.physical.getAll().some((possession) => possession.item.type === "meal-stock");
  }
  function canAttemptEating(context) {
    const edibleFoods = context.character.physical.getAll().filter(
      (possession) => isDirectlyEdibleFood(possession.item)
    );
    return edibleFoods.length === 0 || edibleFoods.some(
      (possession) => canFitFoodPortion(context.character.fullness, possession.item)
    );
  }
  function eatingDuration(goal) {
    switch (goal.parameters?.mealSize) {
      case "main":
        return 30;
      case "small":
        return 15;
      default:
        return 5;
    }
  }
  function isPlannedMeal(goal) {
    return typeof goal.parameters?.opportunityId === "string";
  }
  function isKnownOnlyFoodAcquisition(goal) {
    return goal.parameters?.acquisitionMode === KNOWN_ONLY_ACQUISITION;
  }
  function knownFoodOfferingTerms(context, target) {
    const subjectId = target?.type === "location" ? target.subjectId : target?.type === "person" ? target.personId : void 0;
    if (!subjectId) return void 0;
    const facts = context.character.knowledge.filter(
      (knowledge) => knowledge.subjectId === subjectId && knowledge.polarity === "positive" && knowledge.type === "service-provider" && knowledge.context?.service === "food"
    ).sort((first, second) => {
      const firstHasTerms = first.context?.terms ? 0 : 1;
      const secondHasTerms = second.context?.terms ? 0 : 1;
      if (firstHasTerms !== secondHasTerms) return firstHasTerms - secondHasTerms;
      return second.learnedAt - first.learnedAt;
    });
    return facts[0]?.context?.terms;
  }
  function nearestUnresolvedAdvertisedFoodPlace(context) {
    const byPlace = /* @__PURE__ */ new Map();
    for (const knowledge of context.character.knowledge) {
      if (knowledge.type !== "service-place" || knowledge.polarity !== "positive" || knowledge.context?.service !== "food" || knowledge.position === void 0) continue;
      if (!hasVisibleFoodAdvertising(context, knowledge.subjectId)) continue;
      if (!isServicePlaceWorthTryingNow(
        context.character,
        knowledge.subjectId,
        "food",
        context.time,
        context.minuteOfDay
      )) continue;
      const expected = { service: "food", placeId: knowledge.subjectId };
      const providerKnown = context.character.knowledge.some(
        (candidate) => candidate.type === "service-provider" && candidate.polarity === "positive" && candidate.subjectId !== context.character.id && serviceContextMatches(candidate.context, expected)
      );
      if (providerKnown) continue;
      const existing = byPlace.get(knowledge.subjectId);
      byPlace.set(knowledge.subjectId, {
        place: {
          id: knowledge.subjectId,
          position: { ...knowledge.position }
        },
        terms: knowledge.context.terms ?? existing?.terms
      });
    }
    return Array.from(byPlace.values()).sort((first, second) => {
      const firstDistance = Math.hypot(
        first.place.position.x - context.character.position.x,
        first.place.position.y - context.character.position.y
      );
      const secondDistance = Math.hypot(
        second.place.position.x - context.character.position.x,
        second.place.position.y - context.character.position.y
      );
      return firstDistance - secondDistance;
    })[0];
  }
  function resolvePersonPlanTarget(goal, context, prerequisiteTargets) {
    return getKnownPersonGoalTarget(goal, context) ?? inheritFirstPlanTarget(prerequisiteTargets);
  }
  var foodPlans = [
    {
      id: "eat-food",
      name: "Eat Food",
      achieves: { type: "eatFood" },
      prerequisites: [],
      getPrerequisites: (goal) => [{
        type: "hasFood",
        ...isPlannedMeal(goal) ? { parameters: { acquisitionMode: KNOWN_ONLY_ACQUISITION } } : {}
      }],
      isAvailable: (context) => canAttemptEating(context),
      duration: 5,
      risk: 0,
      cost: 0,
      estimate: (goal) => ({ duration: eatingDuration(goal) })
    },
    {
      id: "prepare-meal-for-self",
      name: "Prepare Meal For Self",
      achieves: { type: "hasFood" },
      prerequisites: [],
      duration: 10,
      risk: 1,
      cost: 0,
      isAvailable: (context) => canPrepareOwnMeal(context),
      estimate: () => ({
        needRelief: { hunger: PREPARED_MEAL_HUNGER_RELIEF }
      })
    },
    {
      id: "buy-food",
      name: "Buy Food",
      achieves: { type: "hasFood" },
      prerequisites: [],
      getPrerequisites: (goal) => [atServiceProviderLocationGoal({
        service: "food",
        ...isKnownOnlyFoodAcquisition(goal) ? { discoveryMode: "known-only" } : {}
      })],
      getTargetPrerequisites: (_goal, context, target) => [{
        type: "hasMoney",
        parameters: { amount: knownFoodOfferingTerms(context, target)?.price ?? LEGACY_FOOD_PRICE }
      }],
      duration: LEGACY_FOOD_DURATION,
      risk: 5,
      cost: LEGACY_FOOD_PRICE,
      estimate: (_goal, context, target) => {
        const terms = knownFoodOfferingTerms(context, target);
        return {
          duration: terms?.expectedDuration ?? LEGACY_FOOD_DURATION,
          cost: terms?.price ?? LEGACY_FOOD_PRICE,
          needRelief: {
            hunger: terms?.effects?.hungerRelief ?? LEGACY_FOOD_HUNGER_RELIEF,
            ...terms?.effects?.thirstRelief !== void 0 ? { thirst: terms.effects.thirstRelief } : {}
          }
        };
      }
    },
    {
      id: "investigate-advertised-food-provider",
      name: "Investigate Advertised Food Place",
      achieves: { type: "atServiceProviderLocation" },
      prerequisites: [],
      getPrerequisites: (_goal, context) => {
        const advertised = nearestUnresolvedAdvertisedFoodPlace(context);
        return advertised ? [serviceProviderLocationGoal({
          service: "food",
          placeId: advertised.place.id
        })] : [];
      },
      // The advertised building is only a discovery destination. Once contextual
      // discovery identifies the real provider, propagate that subjective target
      // upward so the normal buy-food plan purchases from the learned person.
      resolveTarget: (_goal, _context, prerequisiteTargets) => inheritFirstPlanTarget(prerequisiteTargets),
      duration: 0,
      risk: 0,
      cost: 0,
      isAvailable: (context, goal) => isFoodProviderGoal(goal) && goal.parameters?.discoveryMode !== "known-only" && nearestUnresolvedAdvertisedFoodPlace(context) !== void 0
    },
    {
      id: "go-to-person",
      name: "Go To Person",
      achieves: { type: "atPerson" },
      prerequisites: [{ type: "hasPerson" }],
      duration: 5,
      risk: 0,
      cost: 0,
      resolveTarget: resolvePersonPlanTarget,
      isTargetAvailable: (_goal, context, target) => isTravelTargetReachable(context, target),
      estimate: (_goal, context, target) => ({
        duration: estimateTravelDuration(context, target)
      }),
      isAvailable: (context) => context.character.knownPeople.size > 0 || context.character.memory.getByType("person-observed").length > 0
    },
    {
      id: "wait-for-person",
      name: "Wait For Person",
      achieves: { type: "personArrived" },
      prerequisites: [{ type: "hasPerson" }],
      duration: 30,
      risk: 0,
      cost: 0,
      resolveTarget: resolvePersonPlanTarget
    },
    {
      id: "ask-food-service-context",
      name: "Ask Who Is Serving Here",
      achieves: { type: "knowsServiceProviderLocation" },
      prerequisites: [],
      getPrerequisites: (goal, context) => servicePlacePrerequisites(goal, context),
      duration: 5,
      risk: 1,
      cost: 0,
      isAvailable: (context, goal) => {
        if (!isFoodProviderGoal(goal)) return false;
        const target = availableFoodServicePoint(context, goal);
        if (!target) {
          const advertised = advertisedFoodPlaceForGoal(context, goal);
          return !!advertised && !isAtServicePlace(goal, context);
        }
        if (!isAtServicePlace(goal, context)) return true;
        const query = serviceDiscoveryQuery(
          context.character,
          "food",
          target.place.id,
          void 0,
          context.time,
          context.minuteOfDay
        );
        return !!query && !!getContextualServicePersonMemory(context.character, target.point, query, context.time);
      }
    },
    {
      id: "wait-at-food-service-point",
      name: "Wait At Food Service Point",
      achieves: { type: "knowsServiceProviderLocation" },
      prerequisites: [],
      getPrerequisites: (goal, context) => servicePlacePrerequisites(goal, context),
      duration: 10,
      risk: 2,
      cost: 0,
      isAvailable: (context, goal) => {
        if (!isFoodProviderGoal(goal)) return false;
        const target = availableFoodServicePoint(context, goal);
        if (!target || !isAtServicePlace(goal, context)) return false;
        const query = serviceDiscoveryQuery(
          context.character,
          "food",
          target.place.id,
          void 0,
          context.time,
          context.minuteOfDay
        );
        if (!query || hasRecentServicePointWait(context.character, target.point.id, context.time)) return false;
        return !getContextualServicePersonMemory(context.character, target.point, query, context.time);
      }
    }
  ];

  // src/planning/TradePlans.ts
  var tradePlans = [
    {
      id: "offer-goods-for-sale",
      name: "Offer Goods For Sale",
      achieves: { type: "offerGoodsForSale" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = goodsOfferGoalParameters(goal);
        if (!parameters || parameters.requestId) return [];
        return [{
          type: "atServiceProviderLocation",
          parameters: {
            service: parameters.service,
            offering: parameters.offering,
            // Exact item types historically did not qualify provider knowledge.
            // Category-based goods do, because the category is the advertised
            // interchangeable use rather than the concrete item's identity.
            ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {}
          }
        }];
      },
      isAvailable: (context, goal) => {
        const parameters = goodsOfferGoalParameters(goal);
        if (!parameters) return false;
        if (parameters.requestId) {
          const request = context.character.requests.getOutgoingById(parameters.requestId, context.time);
          return request?.status === "pending" || request?.status === "accepted";
        }
        return countStock(context, selector(parameters)) >= parameters.quantity;
      },
      duration: 5,
      risk: 1,
      cost: 0
    },
    {
      id: "serve-goods-offer",
      name: "Serve Goods Offer",
      achieves: { type: "serveGoodsOffer" },
      prerequisites: [],
      isAvailable: (context, goal) => {
        const parameters = serveGoodsOfferGoalParameters(goal);
        if (!parameters) return false;
        const request = context.character.requests.getIncomingById(parameters.requestId, context.time);
        return request?.status === "pending" || request?.status === "accepted";
      },
      duration: 5,
      risk: 1,
      cost: 0
    }
  ];
  function goodsOfferGoalParameters(goal) {
    const p = goal?.parameters;
    if (!p || !isServiceType(p.service) || !isServiceOfferingType(p.offering)) return void 0;
    if (p.itemType !== void 0 && (typeof p.itemType !== "string" || p.itemType.length === 0)) return void 0;
    if (p.itemCategory !== void 0 && !isItemCategory(p.itemCategory)) return void 0;
    if (p.itemType === void 0 && p.itemCategory === void 0) return void 0;
    if (!Number.isInteger(p.quantity) || p.quantity <= 0) return void 0;
    if (p.requestId !== void 0 && typeof p.requestId !== "string") return void 0;
    return {
      service: p.service,
      offering: p.offering,
      ...typeof p.itemType === "string" ? { itemType: p.itemType } : {},
      ...isItemCategory(p.itemCategory) ? { itemCategory: p.itemCategory } : {},
      quantity: p.quantity,
      ...typeof p.requestId === "string" ? { requestId: p.requestId } : {}
    };
  }
  function serveGoodsOfferGoalParameters(goal) {
    const p = goal?.parameters;
    if (!p || typeof p.requestId !== "string") return void 0;
    if (!Number.isInteger(p.maxUnitPrice) || p.maxUnitPrice < 0) return void 0;
    if (typeof p.storageContainerId !== "string" || !isPosition3(p.storagePosition)) return void 0;
    return {
      requestId: p.requestId,
      maxUnitPrice: p.maxUnitPrice,
      storageContainerId: p.storageContainerId,
      storagePosition: { ...p.storagePosition }
    };
  }
  function selector(parameters) {
    return {
      ...parameters.itemType !== void 0 ? { itemType: parameters.itemType } : {},
      ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {}
    };
  }
  function countStock(context, itemSelector2) {
    return context.character.physical.getAll().filter((possession) => itemMatchesSelector(possession.item, itemSelector2)).length;
  }
  function isPosition3(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }

  // src/planning/SellerPlans.ts
  var sellerPlans = [
    {
      id: "serve-purchase-request",
      name: "Serve Purchase Request",
      achieves: { type: "servePurchaseRequest" },
      prerequisites: [],
      duration: 10,
      risk: 0,
      cost: 0
    },
    {
      id: "serve-prepared-meal-request",
      name: "Prepare And Serve Meal",
      achieves: { type: "servePreparedMealRequest" },
      prerequisites: [],
      duration: 20,
      risk: 0,
      cost: 0
    },
    {
      id: "serve-served-drink-request",
      name: "Pour And Serve Drink",
      achieves: { type: "serveServedDrinkRequest" },
      prerequisites: [],
      duration: 3,
      risk: 0,
      cost: 0
    },
    ...tradePlans
  ];

  // src/planning/WaterPlans.ts
  var WATER_TYPE3 = "water";
  var waterPlans = [
    {
      id: "drink-water",
      name: "Drink Carried Water",
      achieves: { type: "drinkWater" },
      prerequisites: [{ type: "hasWater", parameters: { amount: 1 } }],
      duration: 1,
      risk: 0,
      cost: 0,
      // If no water is currently carried, do not recursively fill a container
      // just to drink it immediately. A full stomach also makes drinking this
      // standard portion temporarily unavailable until digestion frees capacity.
      isAvailable: (context) => context.character.canDrinkWater(1) && findCarriedContainerWithLiquid(
        context.character.physical.getAll(),
        WATER_TYPE3,
        1
      ) !== void 0
    },
    {
      id: "drink-water",
      name: "Drink From Water Source",
      achieves: { type: "drinkWater" },
      prerequisites: [{ type: "atWaterSource" }],
      duration: 1,
      risk: 0,
      cost: 0,
      // When water is already carried, travelling to another source is a
      // dominated way to satisfy thirst and may be very expensive to prove
      // unreachable behind a barred door. Physical execution already tops up
      // carried containers when the character happens to drink beside a source.
      isAvailable: (context) => context.character.canDrinkWater(1) && findCarriedContainerWithLiquid(
        context.character.physical.getAll(),
        WATER_TYPE3,
        1
      ) === void 0
    },
    {
      id: "collect-water",
      name: "Fill Water Container",
      achieves: { type: "hasWater" },
      prerequisites: [{ type: "atWaterSource" }, { type: "hasWaterContainer" }],
      duration: 1,
      risk: 0,
      cost: 0,
      isAvailable: (context) => findCarriedFillableLiquidContainer(
        context.character.physical.getAll(),
        WATER_TYPE3
      ) !== void 0
    },
    {
      id: "go-to-water-source",
      name: "Go To Water Source",
      achieves: { type: "atWaterSource" },
      prerequisites: [knowledgeGoal({ type: "water-source", subjectId: "*" })],
      duration: 0,
      risk: 0,
      cost: 0,
      resolveTarget: (_goal, _context, prerequisiteTargets) => inheritFirstLocationTarget(prerequisiteTargets),
      isTargetAvailable: (_goal, context, target) => isTravelTargetReachable(context, target),
      estimate: (_goal, context, target) => ({
        duration: estimateTravelDuration(context, target)
      })
    },
    {
      id: "go-to-location",
      name: "Go To Location",
      achieves: { type: "atLocation" },
      prerequisites: [],
      duration: 0,
      risk: 0,
      cost: 0,
      resolveTarget: (goal) => getGoalLocationTarget(goal),
      isTargetAvailable: (_goal, context, target) => isTravelTargetReachable(context, target),
      estimate: (_goal, context, target) => ({
        duration: estimateTravelDuration(context, target)
      })
    }
  ];

  // src/services/DrinkServiceDiscovery.ts
  function nearestRecognisedDrinkServicePlace(character) {
    return character.memory.getByType("place-observed").filter((memory) => {
      const services = memory.context?.recognisedServices;
      return Array.isArray(services) && services.includes("drink") && isPosition4(memory.context?.position);
    }).map((memory) => ({
      id: typeof memory.context?.knownPlaceId === "string" ? memory.context.knownPlaceId : memory.subjectId,
      position: { ...memory.context.position }
    })).sort(
      (first, second) => distance2(character.position, first.position) - distance2(character.position, second.position)
    )[0];
  }
  function getObservedDrinkServicePoint(character, place) {
    return character.memory.getByType("service-point-observed").map((memory) => {
      const placeId = memory.context?.placeId;
      const services = memory.context?.services;
      const position = memory.context?.position;
      const providerPosition = memory.context?.providerPosition;
      const customerPosition = memory.context?.customerPosition;
      if (typeof placeId !== "string") return void 0;
      if (!Array.isArray(services)) return void 0;
      const recognisedServices = services.filter(isServiceType);
      if (!recognisedServices.includes("drink")) return void 0;
      if (!isPosition4(position) || !isPosition4(providerPosition) || !isPosition4(customerPosition)) return void 0;
      return {
        id: memory.subjectId,
        placeId,
        services: recognisedServices,
        position: { ...position },
        providerPosition: { ...providerPosition },
        customerPosition: { ...customerPosition },
        observedAt: memory.lastObservedAt
      };
    }).filter((point) => point !== void 0).filter((point) => !place || distance2(point.position, place.position) <= 10).sort((first, second) => second.observedAt - first.observedAt)[0];
  }
  function drinkServiceDiscoveryQuery(character, placeId) {
    const provider = character.knowledge.find(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && knowledge.context?.service === "drink" && knowledge.context?.offering === "served-drink" && knowledge.context?.placeId === placeId
    );
    if (provider && !hasUsablePersonLocation3(character, provider.subjectId)) {
      return { type: "person-location", subjectId: provider.subjectId };
    }
    return {
      type: "service-provider",
      subjectId: "*",
      context: { service: "drink", placeId, offering: "served-drink" }
    };
  }
  function hasUsablePersonLocation3(character, personId) {
    if (character.knowledge.some(
      (knowledge) => knowledge.type === "person-location" && knowledge.subjectId === personId && knowledge.polarity === "positive" && knowledge.position !== void 0
    )) return true;
    return character.memory.getByType("person-observed").some(
      (memory) => memory.context?.identifiedPersonId === personId && isPosition4(memory.context?.position)
    );
  }
  function isPosition4(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function distance2(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  // src/planning/DrinkPlans.ts
  var servedDrinkProviderGoal = knowledgeGoal({
    type: "service-provider",
    subjectId: "*",
    context: { service: "drink", offering: "served-drink" }
  });
  function serviceTarget(context) {
    const place = nearestRecognisedDrinkServicePlace(context.character);
    if (!place) return void 0;
    const point = getObservedDrinkServicePoint(context.character, place);
    return {
      place,
      position: point?.customerPosition ?? place.position
    };
  }
  function servicePlacePrerequisites2(context) {
    const target = serviceTarget(context);
    return target ? [{
      type: "atLocation",
      parameters: { subjectId: target.place.id, position: { ...target.position } }
    }] : [];
  }
  function isAtServiceContext(context) {
    const target = serviceTarget(context);
    return !!target && Math.hypot(
      target.position.x - context.character.position.x,
      target.position.y - context.character.position.y
    ) <= 0.1;
  }
  var drinkPlans = [
    {
      id: "drink-served-drink",
      name: "Drink Served Drink",
      achieves: { type: "drinkWater" },
      prerequisites: [{ type: "hasDrink" }],
      duration: 1,
      risk: 0,
      cost: 0
    },
    {
      id: "buy-served-drink",
      name: "Buy Served Drink",
      achieves: { type: "hasDrink" },
      prerequisites: [
        servedDrinkProviderGoal,
        { type: "hasMoney", parameters: { amount: 2 } }
      ],
      duration: 10,
      risk: 2,
      cost: 2
    },
    {
      id: "ask-drink-service-context",
      name: "Ask Who Is Serving Drinks Here",
      achieves: servedDrinkProviderGoal,
      prerequisites: [],
      getPrerequisites: (_goal, context) => servicePlacePrerequisites2(context),
      duration: 5,
      risk: 1,
      cost: 0,
      isAvailable: (context) => {
        const place = nearestRecognisedDrinkServicePlace(context.character);
        if (!place) return false;
        if (!isAtServiceContext(context)) return true;
        const point = getObservedDrinkServicePoint(context.character, place);
        if (!point) return false;
        const query = drinkServiceDiscoveryQuery(context.character, point.placeId);
        return !!query && !!getContextualServicePersonMemory(context.character, point, query, context.time);
      }
    },
    {
      id: "wait-at-drink-service-point",
      name: "Wait At Drink Service Point",
      achieves: servedDrinkProviderGoal,
      prerequisites: [],
      getPrerequisites: (_goal, context) => servicePlacePrerequisites2(context),
      duration: 10,
      risk: 2,
      cost: 0,
      isAvailable: (context) => {
        const place = nearestRecognisedDrinkServicePlace(context.character);
        if (!place || !isAtServiceContext(context)) return false;
        const point = getObservedDrinkServicePoint(context.character, place);
        if (!point || hasRecentServicePointWait(context.character, point.id, context.time)) return false;
        const query = drinkServiceDiscoveryQuery(context.character, point.placeId);
        return !!query && !getContextualServicePersonMemory(context.character, point, query, context.time);
      }
    }
  ];

  // src/planning/SleepPlans.ts
  var accommodationProviderGoal = knowledgeGoal({
    type: "service-provider",
    subjectId: "*",
    context: { service: "accommodation", offering: "room-day" }
  });
  var accommodationProviderLocationGoal = atServiceProviderLocationGoal({
    service: "accommodation",
    offering: "room-day"
  });
  var sleepPlans = [
    {
      id: "sleep",
      name: "Sleep At Home",
      achieves: { type: "rested" },
      prerequisites: [{ type: "atHome" }],
      duration: 8 * 60,
      risk: 0,
      cost: 0
    },
    {
      id: "sleep-rented-room",
      name: "Sleep In Rented Room",
      achieves: { type: "rested" },
      prerequisites: [{ type: "atAccommodation" }],
      duration: 8 * 60,
      risk: 0,
      cost: 0
    },
    {
      id: "go-home",
      name: "Go Home",
      achieves: { type: "atHome" },
      prerequisites: [{ type: "knowsHome" }],
      duration: 0,
      risk: 0,
      cost: 0,
      resolveTarget: (_goal, context) => getHomeLocationTarget(context),
      isTargetAvailable: (_goal, context, target) => isTravelTargetReachable(context, target),
      estimate: (_goal, context, target) => ({
        duration: estimateTravelDuration(context, target)
      })
    },
    {
      id: "go-to-accommodation",
      name: "Go To Rented Room",
      achieves: { type: "atAccommodation" },
      prerequisites: [{ type: "hasAccommodation" }],
      duration: 0,
      risk: 0,
      cost: 0,
      resolveTarget: (_goal, context) => getActiveAccommodationTarget(context),
      isTargetAvailable: (_goal, context, target) => isTravelTargetReachable(context, target),
      estimate: (_goal, context, target) => ({
        duration: estimateTravelDuration(context, target)
      })
    },
    {
      id: "rent-room",
      name: "Rent Room For A Day",
      achieves: { type: "hasAccommodation" },
      prerequisites: [accommodationProviderGoal, accommodationProviderLocationGoal],
      getTargetPrerequisites: (_goal, context, target) => [{
        type: "hasMoney",
        parameters: { amount: knownAccommodationPrice(context, target) }
      }],
      resolveTarget: (_goal, _context, prerequisiteTargets) => prerequisiteTargets[1],
      duration: 5,
      risk: 1,
      cost: DEFAULT_ROOM_DAY_PRICE,
      estimate: (_goal, context, target) => ({
        cost: knownAccommodationPrice(context, target)
      })
    }
  ];

  // src/planning/SocialPlans.ts
  var socialPlans = [
    {
      id: "small-talk",
      name: "Talk To Person",
      achieves: { type: "socialized" },
      prerequisites: [],
      getPrerequisites: () => [{ type: "withinConversationRange" }],
      duration: 5,
      risk: 0,
      cost: 0
    }
  ];

  // src/planning/DoorPlans.ts
  var doorPlans = [
    {
      id: "set-door-security",
      name: "Operate Door",
      achieves: { type: "setDoorSecurity" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = doorGoalParameters(goal);
        if (!parameters) return [];
        return [{
          type: "atLocation",
          parameters: {
            subjectId: `${parameters.doorId}-inside`,
            position: { ...parameters.position }
          }
        }];
      },
      isAvailable: (_context, goal) => doorGoalParameters(goal) !== void 0,
      duration: 1,
      risk: 0,
      cost: 0
    }
  ];
  function doorGoalParameters(goal) {
    if (!goal) return void 0;
    const doorId = goal.parameters?.doorId;
    const desiredState = goal.parameters?.desiredState;
    const position = goal.parameters?.position;
    if (typeof doorId !== "string") return void 0;
    if (desiredState !== "open" && desiredState !== "barred") return void 0;
    if (!isPosition5(position)) return void 0;
    return { doorId, desiredState, position };
  }
  function isPosition5(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  }

  // src/planning/ActionExecution.ts
  function startAction(character, world2, type, expectedDuration, tolerance, isComplete, options = {}) {
    character.currentAction = {
      id: `${character.id}-${type}-${world2.time}`,
      type,
      startedAt: world2.time,
      expectedDuration,
      expectedAt: world2.time + expectedDuration,
      tolerance,
      expiresAt: world2.time + expectedDuration + tolerance,
      status: "active",
      interruptionPolicy: options.interruptionPolicy ?? "atomic",
      isComplete,
      onTick: options.onTick,
      shouldInterrupt: options.shouldInterrupt,
      onInterrupt: options.onInterrupt
    };
    logSimulation(world2, "event", `${character.name} starts ${type}; expected ${expectedDuration}m`);
    return { status: "started" };
  }

  // src/agriculture/AgriculturalWork.ts
  var AGRICULTURAL_WORK_MINUTES = {
    plough: 4,
    sow: 1,
    hoe: 1,
    harvest: 2
  };
  var AGRICULTURAL_WORK_TOLERANCE_MINUTES = 2;
  var AGRICULTURAL_INTERACTION_RANGE_METRES = 1.5;
  function startAgriculturalWork(character, world2, request, options = {}) {
    if (character.currentAction) return { status: "failed" };
    const tile = world2.agriculture.getTile(request.x, request.y);
    if (!tile || !isWithinAgriculturalInteractionRange(character, request.x, request.y)) {
      return { status: "failed" };
    }
    if (!canPerformAgriculturalWork(world2, request)) return { status: "failed" };
    const duration = AGRICULTURAL_WORK_MINUTES[request.type];
    let elapsed = 0;
    let completed = false;
    return startAction(
      character,
      world2,
      `${request.type}-field-tile`,
      duration,
      AGRICULTURAL_WORK_TOLERANCE_MINUTES,
      () => completed,
      {
        interruptionPolicy: "interruptible",
        onTick: (minutes) => {
          if (completed) return;
          if (!isWithinAgriculturalInteractionRange(character, request.x, request.y)) return;
          elapsed += minutes;
          if (elapsed < duration) return;
          if (!canPerformAgriculturalWork(world2, request)) return;
          const harvest = applyAgriculturalWork(world2, request, options);
          options.onComplete?.(request, world2.time, harvest);
          completed = true;
        }
      }
    );
  }
  function canPerformAgriculturalWork(world2, request) {
    switch (request.type) {
      case "plough":
        return world2.agriculture.canPloughTile(request.x, request.y);
      case "sow":
        return world2.agriculture.canSowTile(request.x, request.y, request.crop);
      case "hoe":
        return world2.agriculture.canHoeTile(request.x, request.y);
      case "harvest":
        return world2.agriculture.canHarvestTile(request.x, request.y);
    }
  }
  function applyAgriculturalWork(world2, request, options) {
    switch (request.type) {
      case "plough":
        world2.agriculture.ploughTile(request.x, request.y, world2.time);
        return void 0;
      case "sow":
        world2.agriculture.sowTile(request.x, request.y, request.crop, world2.time);
        return void 0;
      case "hoe":
        world2.agriculture.hoeTile(request.x, request.y, world2.time);
        return void 0;
      case "harvest": {
        const harvest = world2.agriculture.harvestTile(request.x, request.y, world2.time);
        options.onHarvest?.(harvest);
        return harvest;
      }
    }
  }
  function isWithinAgriculturalInteractionRange(character, x, y) {
    const dx = character.position.x - (x + 0.5);
    const dy = character.position.y - (y + 0.5);
    return Math.hypot(dx, dy) <= AGRICULTURAL_INTERACTION_RANGE_METRES;
  }

  // src/planning/AgriculturePlans.ts
  var agriculturePlans = [{
    id: "perform-agricultural-work",
    name: "Work Field Tile",
    achieves: { type: "performAgriculturalWork" },
    prerequisites: [],
    getPrerequisites: (goal) => {
      const parameters = agriculturalWorkGoalParameters(goal);
      if (!parameters) return [];
      return [{
        type: "atLocation",
        parameters: {
          subjectId: `field-tile-${parameters.x}-${parameters.y}`,
          position: { ...parameters.position }
        }
      }];
    },
    resolveTarget: (_goal, _context, prerequisiteTargets) => inheritFirstLocationTarget(prerequisiteTargets),
    isAvailable: (context, goal) => {
      const parameters = agriculturalWorkGoalParameters(goal);
      if (!parameters) return false;
      return context.time + AGRICULTURAL_WORK_MINUTES[parameters.workType] <= parameters.finishBy;
    },
    duration: 0,
    risk: 0,
    cost: 0,
    estimate: (goal) => {
      const parameters = agriculturalWorkGoalParameters(goal);
      return {
        duration: parameters ? AGRICULTURAL_WORK_MINUTES[parameters.workType] : 0
      };
    }
  }];
  function agriculturalWorkGoalParameters(goal) {
    if (!goal || goal.type !== "performAgriculturalWork" || !goal.parameters) return void 0;
    const p = goal.parameters;
    if (typeof p.activityId !== "string" || !isWorkType(p.workType) || !isGridCoordinate(p.x) || !isGridCoordinate(p.y) || !isPosition6(p.position) || !isNonNegativeNumber(p.finishBy)) return void 0;
    if (p.workType === "sow") {
      if (!isCropKind(p.crop)) return void 0;
      return {
        activityId: p.activityId,
        workType: p.workType,
        x: p.x,
        y: p.y,
        position: { ...p.position },
        finishBy: p.finishBy,
        crop: p.crop
      };
    }
    if (p.crop !== void 0) return void 0;
    return {
      activityId: p.activityId,
      workType: p.workType,
      x: p.x,
      y: p.y,
      position: { ...p.position },
      finishBy: p.finishBy
    };
  }
  function isWorkType(value) {
    return value === "plough" || value === "sow" || value === "hoe" || value === "harvest";
  }
  function isCropKind(value) {
    return value === "wheat" || value === "rye" || value === "barley" || value === "oats" || value === "peas" || value === "beans" || value === "carrot";
  }
  function isGridCoordinate(value) {
    return typeof value === "number" && Number.isInteger(value);
  }
  function isNonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }
  function isPosition6(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && Number.isFinite(candidate.x) && typeof candidate.y === "number" && Number.isFinite(candidate.y);
  }

  // src/planning/ProcessingPlans.ts
  var processingPlans = [
    {
      id: "request-material-processing",
      name: "Request Material Processing",
      achieves: { type: "obtainProcessedMaterial" },
      prerequisites: [],
      getPrerequisites: (goal, context) => {
        const parameters = processingGoalParameters(goal);
        if (!parameters || parameters.requestId) return [];
        if (!knownProvider(context, parameters)) return [];
        return [{ type: "atPerson", parameters: { personId: parameters.providerId } }];
      },
      resolveTarget: (goal, context, prerequisiteTargets) => {
        const parameters = processingGoalParameters(goal);
        if (!parameters || parameters.requestId) return void 0;
        return createKnownPersonTarget(parameters.providerId, context) ?? prerequisiteTargets.find((target) => target?.type === "person" && target.personId === parameters.providerId);
      },
      getTargetPrerequisites: (goal, context, target) => {
        const parameters = processingGoalParameters(goal);
        if (!parameters || parameters.requestId) return [];
        const price = knownTerms(context, parameters, target)?.price;
        return typeof price === "number" ? [{ type: "hasMoney", parameters: { amount: price } }] : [];
      },
      isAvailable: (context, goal) => {
        const parameters = processingGoalParameters(goal);
        return parameters !== void 0 && (parameters.requestId !== void 0 || knownProvider(context, parameters) !== void 0);
      },
      duration: 0,
      risk: 2,
      cost: 0,
      estimate: (goal, context, target) => {
        const parameters = processingGoalParameters(goal);
        if (!parameters) return {};
        const terms = knownTerms(context, parameters, target);
        return { duration: terms?.expectedDuration ?? 0, cost: terms?.price ?? 0 };
      }
    },
    {
      id: "fulfil-material-processing-request",
      name: "Fulfil Material Processing Request",
      achieves: { type: "fulfilMaterialProcessingRequest" },
      prerequisites: [],
      getPrerequisites: (goal, context) => {
        const parameters = processingFulfilmentGoalParameters(goal);
        if (!parameters) return [];
        const request = context.character.requests.getIncomingById(parameters.requestId, context.time);
        if (request?.status !== "accepted") return [];
        if (request.fulfilment?.stage === "ready-for-return") {
          return [{ type: "atLocation", parameters: { subjectId: parameters.returnActionPointId, position: { ...parameters.returnPosition } } }];
        }
        if (request.fulfilment?.stage === "awaiting-processing" || request.fulfilment?.stage === "processing") {
          return [{ type: "atLocation", parameters: { subjectId: parameters.workActionPointId, position: { ...parameters.workPosition } } }];
        }
        return [];
      },
      isAvailable: (context, goal) => {
        const parameters = processingFulfilmentGoalParameters(goal);
        if (!parameters) return false;
        const request = context.character.requests.getIncomingById(parameters.requestId, context.time);
        return request?.status === "pending" || request?.status === "accepted";
      },
      duration: 0,
      risk: 1,
      cost: 0,
      estimate: (goal, context) => {
        const parameters = processingFulfilmentGoalParameters(goal);
        if (!parameters) return {};
        const request = context.character.requests.getIncomingById(parameters.requestId, context.time);
        return request?.status === "accepted" && request.fulfilment?.stage === "awaiting-processing" ? { duration: parameters.expectedDuration } : { duration: 0 };
      }
    }
  ];
  function knownProvider(context, parameters) {
    return context.character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === parameters.providerId && knowledge.polarity === "positive" && knowledge.context?.service === parameters.service && knowledge.context?.offering === parameters.offering && (parameters.inputItemCategory === void 0 || knowledge.context?.itemCategory === parameters.inputItemCategory)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
  }
  function knownTerms(context, parameters, target) {
    const providerId = target?.type === "person" && target.personId ? target.personId : parameters.providerId;
    return context.character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.context?.service === parameters.service && knowledge.context?.offering === parameters.offering && (parameters.inputItemCategory === void 0 || knowledge.context?.itemCategory === parameters.inputItemCategory)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0]?.context?.terms;
  }
  function processingDefinitionGoalParameters(goal) {
    if (!goal) return void 0;
    const p = goal.parameters;
    if (!p || !isServiceType(p.service) || !isServiceOfferingType(p.offering)) return void 0;
    if (p.inputItemType !== void 0 && (typeof p.inputItemType !== "string" || p.inputItemType.length === 0)) return void 0;
    if (p.inputItemCategory !== void 0 && !isItemCategory(p.inputItemCategory)) return void 0;
    if (p.inputItemType === void 0 && p.inputItemCategory === void 0) return void 0;
    if (!isPositiveInteger2(p.inputCount) || typeof p.outputItemType !== "string" || !isPositiveInteger2(p.outputCount)) return void 0;
    return {
      service: p.service,
      offering: p.offering,
      ...typeof p.inputItemType === "string" ? { inputItemType: p.inputItemType } : {},
      ...isItemCategory(p.inputItemCategory) ? { inputItemCategory: p.inputItemCategory } : {},
      inputCount: p.inputCount,
      outputItemType: p.outputItemType,
      outputCount: p.outputCount
    };
  }
  function processingGoalParameters(goal) {
    const base = processingDefinitionGoalParameters(goal);
    const p = goal?.parameters;
    if (!base || !p || typeof p.providerId !== "string") return void 0;
    if (p.requestId !== void 0 && typeof p.requestId !== "string") return void 0;
    return { ...base, providerId: p.providerId, ...typeof p.requestId === "string" ? { requestId: p.requestId } : {} };
  }
  function processingFulfilmentGoalParameters(goal) {
    const base = processingDefinitionGoalParameters(goal);
    const p = goal?.parameters;
    if (!base || !p || typeof p.requestId !== "string") return void 0;
    if (!isNonNegativeInteger2(p.price) || !isPositiveNumber2(p.expectedDuration)) return void 0;
    if (typeof p.workActionPointId !== "string" || !isPosition7(p.workPosition)) return void 0;
    if (typeof p.returnActionPointId !== "string" || !isPosition7(p.returnPosition)) return void 0;
    return {
      ...base,
      requestId: p.requestId,
      price: p.price,
      expectedDuration: p.expectedDuration,
      workActionPointId: p.workActionPointId,
      workPosition: { ...p.workPosition },
      returnActionPointId: p.returnActionPointId,
      returnPosition: { ...p.returnPosition }
    };
  }
  function isPosition7(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function isPositiveInteger2(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
  }
  function isNonNegativeInteger2(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }
  function isPositiveNumber2(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  // src/planning/FoodPreservationPlans.ts
  var foodPreservationPlans = [{
    id: "preserve-surplus-food",
    name: "Preserve Surplus Food",
    achieves: { type: "preserveSurplusFood" },
    prerequisites: [],
    getPrerequisites: (goal) => {
      const parameters = surplusFoodPreservationGoalParameters(goal);
      return parameters ? [{
        type: "atLocation",
        parameters: {
          subjectId: parameters.workActionPointId,
          position: { ...parameters.workPosition }
        }
      }] : [];
    },
    isAvailable: (context, goal) => {
      const parameters = surplusFoodPreservationGoalParameters(goal);
      return parameters !== void 0 && context.time + parameters.durationMinutes <= parameters.finishBy;
    },
    duration: 0,
    risk: 1,
    cost: 0,
    estimate: (goal) => ({
      duration: surplusFoodPreservationGoalParameters(goal)?.durationMinutes ?? 0
    })
  }];
  function surplusFoodPreservationGoalParameters(goal) {
    const p = goal?.parameters;
    if (!p) return void 0;
    if (typeof p.recipeId !== "string" || typeof p.workActionPointId !== "string" || !isPosition8(p.workPosition) || typeof p.storageContainerId !== "string" || typeof p.outputType !== "string" || !isFoodKind(p.outputFoodKind)) return void 0;
    const inputItemType = typeof p.inputItemType === "string" && p.inputItemType.length > 0 ? p.inputItemType : void 0;
    const inputItemCategory = isItemCategory(p.inputItemCategory) ? p.inputItemCategory : void 0;
    if (!inputItemType && !inputItemCategory) return void 0;
    if (p.inputItemCategory !== void 0 && !inputItemCategory) return void 0;
    if (p.inputFoodKind !== void 0 && !isFoodKind(p.inputFoodKind)) return void 0;
    if (!isNonNegativeInteger3(p.reserveInputStock)) return void 0;
    if (p.outputHungerRelief !== void 0 && !isPositiveNumber3(p.outputHungerRelief)) return void 0;
    if (p.outputStomachVolume !== void 0 && !isPositiveNumber3(p.outputStomachVolume)) return void 0;
    if (!isPositiveNumber3(p.durationMinutes) || !isNonNegativeNumber2(p.finishBy)) return void 0;
    return {
      recipeId: p.recipeId,
      workActionPointId: p.workActionPointId,
      workPosition: { ...p.workPosition },
      storageContainerId: p.storageContainerId,
      ...inputItemType ? { inputItemType } : {},
      ...inputItemCategory ? { inputItemCategory } : {},
      ...isFoodKind(p.inputFoodKind) ? { inputFoodKind: p.inputFoodKind } : {},
      reserveInputStock: p.reserveInputStock,
      outputType: p.outputType,
      outputFoodKind: p.outputFoodKind,
      ...typeof p.outputHungerRelief === "number" ? { outputHungerRelief: p.outputHungerRelief } : {},
      ...typeof p.outputStomachVolume === "number" ? { outputStomachVolume: p.outputStomachVolume } : {},
      durationMinutes: p.durationMinutes,
      finishBy: p.finishBy
    };
  }
  function isPosition8(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  }
  function isPositiveNumber3(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }
  function isNonNegativeNumber2(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }
  function isNonNegativeInteger3(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }

  // src/planning/StagedWorkplacePlans.ts
  var stagedWorkplacePlans = [
    ...foodPreservationPlans,
    {
      id: "manage-staged-workplace-production",
      name: "Manage Staged Workplace Production",
      achieves: { type: "manageStagedWorkplaceProduction" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = stagedWorkplaceProductionGoalParameters(goal);
        if (!parameters || parameters.operation === "wait") return [];
        return [{
          type: "atLocation",
          parameters: {
            subjectId: parameters.workActionPointId,
            position: { ...parameters.workPosition }
          }
        }];
      },
      isAvailable: (context, goal) => {
        const parameters = stagedWorkplaceProductionGoalParameters(goal);
        if (!parameters) return false;
        if (parameters.operation === "wait") return parameters.readyAt !== void 0;
        return context.time + parameters.stageActiveMinutes <= parameters.finishBy;
      },
      duration: 0,
      risk: 1,
      cost: 0,
      estimate: (goal, context) => {
        const parameters = stagedWorkplaceProductionGoalParameters(goal);
        if (!parameters) return { duration: 0 };
        return {
          duration: parameters.operation === "wait" ? Math.max(0, (parameters.readyAt ?? context.time) - context.time) : parameters.stageActiveMinutes
        };
      }
    }
  ];
  function stagedWorkplaceProductionGoalParameters(goal) {
    if (!goal) return void 0;
    const p = goal.parameters;
    if (!p) return void 0;
    const operation = p.operation;
    if (operation !== "start" && operation !== "advance" && operation !== "wait") return void 0;
    if (typeof p.recipeId !== "string" || typeof p.workActionPointId !== "string" || !isPosition9(p.workPosition) || typeof p.outputContainerId !== "string" || typeof p.outputType !== "string" || typeof p.liquidRoomResourceId !== "string" || typeof p.liquidType !== "string") return void 0;
    const inputItemType = typeof p.inputItemType === "string" && p.inputItemType.length > 0 ? p.inputItemType : void 0;
    const inputItemCategory = isItemCategory(p.inputItemCategory) ? p.inputItemCategory : void 0;
    if (!inputItemType && !inputItemCategory) return void 0;
    if (p.inputItemCategory !== void 0 && !inputItemCategory) return void 0;
    const secondaryInputItemType = typeof p.secondaryInputItemType === "string" && p.secondaryInputItemType.length > 0 ? p.secondaryInputItemType : void 0;
    const secondaryInputItemCategory = isItemCategory(p.secondaryInputItemCategory) ? p.secondaryInputItemCategory : void 0;
    const hasSecondaryInput = p.secondaryInputItemType !== void 0 || p.secondaryInputItemCategory !== void 0 || p.secondaryInputFoodKind !== void 0 || p.secondaryInputCountPerBatch !== void 0;
    if (hasSecondaryInput) {
      if (!secondaryInputItemType && !secondaryInputItemCategory) return void 0;
      if (p.secondaryInputItemCategory !== void 0 && !secondaryInputItemCategory) return void 0;
      if (p.secondaryInputFoodKind !== void 0 && !isFoodKind(p.secondaryInputFoodKind)) return void 0;
      if (!isPositiveInteger3(p.secondaryInputCountPerBatch)) return void 0;
    }
    if (p.outputFoodKind !== void 0 && !isFoodKind(p.outputFoodKind)) return void 0;
    if (p.outputDishId !== void 0 && (typeof p.outputDishId !== "string" || p.outputDishId.length === 0)) return void 0;
    if (p.outputHungerRelief !== void 0 && !isPositiveNumber4(p.outputHungerRelief)) return void 0;
    if (p.outputHydrationRelief !== void 0 && !isNonNegativeNumber3(p.outputHydrationRelief)) return void 0;
    if (p.outputStomachVolume !== void 0 && !isPositiveNumber4(p.outputStomachVolume)) return void 0;
    if (p.outputShelfLifeMinutes !== void 0 && !isPositiveNumber4(p.outputShelfLifeMinutes)) return void 0;
    if (p.inputFoodKind !== void 0 && !isFoodKind(p.inputFoodKind)) return void 0;
    if (!isPositiveInteger3(p.targetStock) || !isPositiveInteger3(p.outputCountPerBatch) || !isPositiveInteger3(p.inputCountPerBatch) || !isPositiveNumber4(p.liquidAmountPerBatch) || !isNonNegativeNumber3(p.finishBy) || !isNonNegativeInteger4(p.stageIndex) || typeof p.stageId !== "string" || !isPositiveNumber4(p.stageActiveMinutes) || !isNonNegativeNumber3(p.passiveMinutesAfter)) return void 0;
    if (p.jobItemId !== void 0 && typeof p.jobItemId !== "string") return void 0;
    if (p.readyAt !== void 0 && !isNonNegativeNumber3(p.readyAt)) return void 0;
    if ((operation === "advance" || operation === "wait") && typeof p.jobItemId !== "string") return void 0;
    if (operation === "wait" && typeof p.readyAt !== "number") return void 0;
    if (!Array.isArray(p.stages) || p.stages.length === 0) return void 0;
    const stages = [];
    for (const value of p.stages) {
      if (!value || typeof value !== "object") return void 0;
      const stage = value;
      if (typeof stage.id !== "string" || !isPositiveNumber4(stage.activeMinutes) || !isNonNegativeNumber3(stage.passiveMinutesAfter)) return void 0;
      stages.push({
        id: stage.id,
        activeMinutes: stage.activeMinutes,
        passiveMinutesAfter: stage.passiveMinutesAfter
      });
    }
    if (p.stageIndex >= stages.length || stages[p.stageIndex].id !== p.stageId) return void 0;
    return {
      operation,
      recipeId: p.recipeId,
      workActionPointId: p.workActionPointId,
      workPosition: { ...p.workPosition },
      outputContainerId: p.outputContainerId,
      outputType: p.outputType,
      ...isFoodKind(p.outputFoodKind) ? { outputFoodKind: p.outputFoodKind } : {},
      ...typeof p.outputDishId === "string" ? { outputDishId: p.outputDishId } : {},
      ...typeof p.outputHungerRelief === "number" ? { outputHungerRelief: p.outputHungerRelief } : {},
      ...typeof p.outputHydrationRelief === "number" ? { outputHydrationRelief: p.outputHydrationRelief } : {},
      ...typeof p.outputStomachVolume === "number" ? { outputStomachVolume: p.outputStomachVolume } : {},
      ...typeof p.outputShelfLifeMinutes === "number" ? { outputShelfLifeMinutes: p.outputShelfLifeMinutes } : {},
      targetStock: p.targetStock,
      outputCountPerBatch: p.outputCountPerBatch,
      ...inputItemType ? { inputItemType } : {},
      ...inputItemCategory ? { inputItemCategory } : {},
      ...isFoodKind(p.inputFoodKind) ? { inputFoodKind: p.inputFoodKind } : {},
      inputCountPerBatch: p.inputCountPerBatch,
      ...secondaryInputItemType ? { secondaryInputItemType } : {},
      ...secondaryInputItemCategory ? { secondaryInputItemCategory } : {},
      ...isFoodKind(p.secondaryInputFoodKind) ? { secondaryInputFoodKind: p.secondaryInputFoodKind } : {},
      ...typeof p.secondaryInputCountPerBatch === "number" ? {
        secondaryInputCountPerBatch: p.secondaryInputCountPerBatch
      } : {},
      liquidRoomResourceId: p.liquidRoomResourceId,
      liquidType: p.liquidType,
      liquidAmountPerBatch: p.liquidAmountPerBatch,
      stages,
      finishBy: p.finishBy,
      stageIndex: p.stageIndex,
      stageId: p.stageId,
      stageActiveMinutes: p.stageActiveMinutes,
      passiveMinutesAfter: p.passiveMinutesAfter,
      ...typeof p.jobItemId === "string" ? { jobItemId: p.jobItemId } : {},
      ...typeof p.readyAt === "number" ? { readyAt: p.readyAt } : {}
    };
  }
  function isPosition9(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  }
  function isPositiveInteger3(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
  }
  function isNonNegativeInteger4(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }
  function isPositiveNumber4(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }
  function isNonNegativeNumber3(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  // src/planning/WorkplacePlans.ts
  var workplacePlans = [
    ...agriculturePlans,
    ...stagedWorkplacePlans,
    ...processingPlans,
    {
      id: "set-service-point-state",
      name: "Open Or Close Service Point",
      achieves: { type: "setServicePointState" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = servicePointStateGoalParameters(goal);
        if (!parameters) return [];
        return [{
          type: "atLocation",
          parameters: {
            subjectId: `${parameters.servicePointId}:provider`,
            position: { ...parameters.position }
          }
        }];
      },
      isAvailable: (_context, goal) => servicePointStateGoalParameters(goal) !== void 0,
      duration: 1,
      risk: 0,
      cost: 0
    },
    {
      id: "produce-workplace-stock",
      name: "Produce Workplace Stock",
      achieves: { type: "produceWorkplaceStock" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = workplaceProductionGoalParameters(goal);
        return parameters ? [{
          type: "atLocation",
          parameters: {
            subjectId: parameters.workActionPointId,
            position: { ...parameters.workPosition }
          }
        }] : [];
      },
      isAvailable: (context, goal) => {
        const parameters = workplaceProductionGoalParameters(goal);
        if (!parameters) return false;
        return parameters.finishBy === void 0 || context.time + parameters.durationMinutes <= parameters.finishBy;
      },
      duration: 0,
      risk: 1,
      cost: 0,
      estimate: (goal) => ({
        duration: workplaceProductionGoalParameters(goal)?.durationMinutes ?? 0
      })
    },
    {
      id: "take-workplace-carrier",
      name: "Take Workplace Carrier",
      achieves: { type: "hasWorkplaceCarrier" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = workplaceCarrierGoalParameters(goal);
        return parameters ? [{
          type: "atLocation",
          parameters: {
            subjectId: parameters.carrierHomeContainerId,
            position: { ...parameters.storagePosition }
          }
        }] : [];
      },
      isAvailable: (context, goal) => {
        const parameters = workplaceCarrierGoalParameters(goal);
        if (!parameters) return false;
        return context.character.physical.get(parameters.carrierItemId)?.item.solidContainer !== void 0;
      },
      duration: 1,
      risk: 0,
      cost: 0
    },
    {
      id: "buy-workplace-stock",
      name: "Buy Workplace Stock",
      achieves: { type: "procureWorkplaceStock" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = workplaceProcurementGoalParameters(goal);
        return parameters ? [
          {
            type: "hasWorkplaceCarrier",
            parameters: {
              carrierItemId: parameters.carrierItemId,
              carrierHomeContainerId: parameters.carrierHomeContainerId,
              storagePosition: { ...parameters.storagePosition }
            }
          },
          atServiceProviderLocationGoal({
            service: parameters.service,
            ...parameters.offering !== void 0 ? { offering: parameters.offering } : {},
            ...parameters.itemType !== void 0 ? { itemType: parameters.itemType } : {},
            ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {},
            ...parameters.foodKind !== void 0 ? { foodKind: parameters.foodKind } : {}
          })
        ] : [];
      },
      // The first prerequisite deliberately acquires the basket so it executes
      // before travel. The transaction itself must still target the supplier,
      // which is the second prerequisite rather than inheriting the kitchen target.
      resolveTarget: (_goal, _context, prerequisiteTargets) => prerequisiteTargets[1],
      getTargetPrerequisites: (goal, context, target) => {
        const parameters = workplaceProcurementGoalParameters(goal);
        if (!parameters) return [];
        const unitPrice = knownProcurementUnitPrice(context.character.knowledge, parameters, target);
        return [{
          type: "hasMoney",
          parameters: {
            amount: (unitPrice ?? parameters.maxUnitPrice) * parameters.quantity
          }
        }];
      },
      isTargetAvailable: (goal, context, target) => {
        const parameters = workplaceProcurementGoalParameters(goal);
        if (!parameters) return false;
        const unitPrice = knownProcurementUnitPrice(context.character.knowledge, parameters, target);
        return unitPrice === void 0 || unitPrice <= parameters.maxUnitPrice;
      },
      isAvailable: (context, goal) => {
        const parameters = workplaceProcurementGoalParameters(goal);
        if (!parameters) return false;
        const carrier = context.character.physical.get(parameters.carrierItemId);
        if (!carrier?.item.solidContainer) return false;
        return countWorkplaceStock(context.character.physical.getAll(), parameters) < parameters.targetStock;
      },
      duration: 5,
      risk: 2,
      cost: 0,
      estimate: (goal, context, target) => {
        const parameters = workplaceProcurementGoalParameters(goal);
        if (!parameters) return { duration: 0, cost: 0 };
        const unitPrice = knownProcurementUnitPrice(context.character.knowledge, parameters, target);
        return {
          duration: 5,
          cost: (unitPrice ?? parameters.maxUnitPrice) * parameters.quantity
        };
      }
    },
    {
      id: "refill-workplace-liquid-reserve",
      name: "Refill Workplace Liquid Reserve",
      achieves: { type: "refillWorkplaceLiquidReserve" },
      prerequisites: [],
      isAvailable: (_context, goal) => workplaceLiquidReserveGoalParameters(goal) !== void 0,
      duration: 0,
      risk: 1,
      cost: 0
    },
    {
      id: "refill-personal-water-reserve",
      name: "Refill Personal Water From Room Reserve",
      achieves: { type: "refillPersonalWaterReserve" },
      prerequisites: [],
      getPrerequisites: (goal) => {
        const parameters = personalWaterReserveGoalParameters(goal);
        return parameters ? [{
          type: "atLocation",
          parameters: {
            subjectId: parameters.roomId,
            position: { ...parameters.roomPosition }
          }
        }] : [];
      },
      isAvailable: (_context, goal) => personalWaterReserveGoalParameters(goal) !== void 0,
      duration: 1,
      risk: 0,
      cost: 0
    }
  ];
  function servicePointStateGoalParameters(goal) {
    if (!goal) return void 0;
    const servicePointId = goal.parameters?.servicePointId;
    const desiredState = goal.parameters?.desiredState;
    const position = goal.parameters?.position;
    if (typeof servicePointId !== "string") return void 0;
    if (desiredState !== "open" && desiredState !== "closed") return void 0;
    if (!isPosition10(position)) return void 0;
    return { servicePointId, desiredState, position };
  }
  function workplaceProductionGoalParameters(goal) {
    if (!goal) return void 0;
    const p = goal.parameters;
    if (!p || typeof p.recipeId !== "string" || typeof p.workActionPointId !== "string" || !isPosition10(p.workPosition)) return void 0;
    if (typeof p.outputContainerId !== "string" || typeof p.outputType !== "string") return void 0;
    if (p.outputFoodKind !== void 0 && !isFoodKind(p.outputFoodKind)) return void 0;
    if (p.outputHungerRelief !== void 0 && !isPositiveNumber5(p.outputHungerRelief)) return void 0;
    if (p.outputStomachVolume !== void 0 && !isPositiveNumber5(p.outputStomachVolume)) return void 0;
    if (!isPositiveInteger4(p.targetStock) || !isPositiveInteger4(p.outputCountPerBatch)) return void 0;
    if (typeof p.inputItemType !== "string" || !isPositiveInteger4(p.inputCountPerBatch)) return void 0;
    if (typeof p.liquidRoomResourceId !== "string" || typeof p.liquidType !== "string") return void 0;
    if (!isPositiveNumber5(p.liquidAmountPerBatch) || !isPositiveNumber5(p.durationMinutes)) return void 0;
    if (p.finishBy !== void 0 && !isNonNegativeNumber4(p.finishBy)) return void 0;
    return {
      recipeId: p.recipeId,
      workActionPointId: p.workActionPointId,
      workPosition: { ...p.workPosition },
      outputContainerId: p.outputContainerId,
      outputType: p.outputType,
      ...isFoodKind(p.outputFoodKind) ? { outputFoodKind: p.outputFoodKind } : {},
      ...typeof p.outputHungerRelief === "number" ? { outputHungerRelief: p.outputHungerRelief } : {},
      ...typeof p.outputStomachVolume === "number" ? { outputStomachVolume: p.outputStomachVolume } : {},
      targetStock: p.targetStock,
      outputCountPerBatch: p.outputCountPerBatch,
      inputItemType: p.inputItemType,
      inputCountPerBatch: p.inputCountPerBatch,
      liquidRoomResourceId: p.liquidRoomResourceId,
      liquidType: p.liquidType,
      liquidAmountPerBatch: p.liquidAmountPerBatch,
      durationMinutes: p.durationMinutes,
      ...typeof p.finishBy === "number" ? { finishBy: p.finishBy } : {}
    };
  }
  function workplaceCarrierGoalParameters(goal) {
    const p = goal?.parameters;
    if (!p || typeof p.carrierItemId !== "string" || typeof p.carrierHomeContainerId !== "string") {
      return void 0;
    }
    if (!isPosition10(p.storagePosition)) return void 0;
    return {
      carrierItemId: p.carrierItemId,
      carrierHomeContainerId: p.carrierHomeContainerId,
      storagePosition: { ...p.storagePosition }
    };
  }
  function workplaceProcurementGoalParameters(goal) {
    const p = goal?.parameters;
    if (!p || !isServiceType(p.service)) return void 0;
    if (p.offering !== void 0 && !isServiceOfferingType(p.offering)) return void 0;
    const itemType = typeof p.itemType === "string" && p.itemType.length > 0 ? p.itemType : void 0;
    const itemCategory = isItemCategory(p.itemCategory) ? p.itemCategory : void 0;
    if (!itemType && !itemCategory) return void 0;
    if (p.itemCategory !== void 0 && !itemCategory) return void 0;
    if (p.foodKind !== void 0 && !isFoodKind(p.foodKind)) return void 0;
    if (!isPositiveInteger4(p.quantity) || !isPositiveInteger4(p.targetStock)) return void 0;
    if (!Number.isInteger(p.maxUnitPrice) || p.maxUnitPrice < 0) return void 0;
    if (typeof p.carrierItemId !== "string" || typeof p.carrierHomeContainerId !== "string" || typeof p.storageContainerId !== "string" || !isPosition10(p.storagePosition)) return void 0;
    return {
      service: p.service,
      ...isServiceOfferingType(p.offering) ? { offering: p.offering } : {},
      ...itemType ? { itemType } : {},
      ...itemCategory ? { itemCategory } : {},
      ...isFoodKind(p.foodKind) ? { foodKind: p.foodKind } : {},
      quantity: p.quantity,
      targetStock: p.targetStock,
      maxUnitPrice: p.maxUnitPrice,
      carrierItemId: p.carrierItemId,
      carrierHomeContainerId: p.carrierHomeContainerId,
      storageContainerId: p.storageContainerId,
      storagePosition: { ...p.storagePosition }
    };
  }
  function workplaceLiquidReserveGoalParameters(goal) {
    if (!goal) return void 0;
    const p = goal.parameters;
    if (!p || typeof p.reserveId !== "string" || typeof p.roomId !== "string" || !isPosition10(p.roomPosition) || typeof p.bucketItemId !== "string") return void 0;
    if (typeof p.sourceId !== "string" || !isPosition10(p.sourcePosition)) return void 0;
    if (typeof p.liquidType !== "string" || !isPositiveNumber5(p.targetAmount)) return void 0;
    return {
      reserveId: p.reserveId,
      roomId: p.roomId,
      roomPosition: { ...p.roomPosition },
      bucketItemId: p.bucketItemId,
      sourceId: p.sourceId,
      sourcePosition: { ...p.sourcePosition },
      liquidType: p.liquidType,
      targetAmount: p.targetAmount
    };
  }
  function personalWaterReserveGoalParameters(goal) {
    if (!goal) return void 0;
    const p = goal.parameters;
    if (!p || typeof p.sourceRoomResourceId !== "string" || typeof p.roomId !== "string" || !isPosition10(p.roomPosition) || typeof p.portableItemId !== "string") return void 0;
    if (!isPositiveNumber5(p.targetAmount)) return void 0;
    return {
      sourceRoomResourceId: p.sourceRoomResourceId,
      roomId: p.roomId,
      roomPosition: { ...p.roomPosition },
      portableItemId: p.portableItemId,
      targetAmount: p.targetAmount
    };
  }
  function knownProcurementUnitPrice(knowledge, parameters, target) {
    const providerId = target?.type === "location" ? target.subjectId : target?.type === "person" ? target.personId : void 0;
    if (!providerId) return void 0;
    const expected = {
      service: parameters.service,
      ...parameters.offering !== void 0 ? { offering: parameters.offering } : {},
      ...parameters.itemType !== void 0 ? { itemType: parameters.itemType } : {},
      ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {},
      ...parameters.foodKind !== void 0 ? { foodKind: parameters.foodKind } : {}
    };
    return knowledge.filter(
      (fact) => fact.type === "service-provider" && fact.subjectId === providerId && fact.polarity === "positive" && serviceContextMatches(fact.context, expected)
    ).sort((first, second) => (second.context?.terms?.price !== void 0 ? 1 : 0) - (first.context?.terms?.price !== void 0 ? 1 : 0))[0]?.context?.terms?.price;
  }
  function countWorkplaceStock(possessions, parameters) {
    return possessions.filter(
      (possession) => possession.location.type === "container" && possession.location.containerId === parameters.storageContainerId && itemMatchesSelector(possession.item, parameters)
    ).length;
  }
  function isPosition10(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && typeof candidate.y === "number";
  }
  function isPositiveInteger4(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
  }
  function isPositiveNumber5(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }
  function isNonNegativeNumber4(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  // src/planning/HuntingPlans.ts
  var huntingPlans = [
    {
      id: "hunt-hookcrest",
      name: "Hunt Hookcrest",
      achieves: { type: "huntHookcrest" },
      prerequisites: [],
      getPrerequisites: (goal) => locationPrerequisite(huntHookcrestGoalParameters(goal)),
      resolveTarget: (_goal, _context, prerequisiteTargets) => inheritFirstLocationTarget(prerequisiteTargets),
      isAvailable: (context, goal) => {
        const parameters = huntHookcrestGoalParameters(goal);
        if (!parameters) return false;
        const bow = context.character.physical.get(parameters.bowItemId);
        return bow?.location.type === "hand" || bow?.location.type === "equipped";
      },
      duration: 20,
      risk: 5,
      cost: 0
    },
    {
      id: "dress-hookcrest",
      name: "Dress Hookcrest",
      achieves: { type: "dressHookcrest" },
      prerequisites: [],
      getPrerequisites: (goal) => locationPrerequisite(dressHookcrestGoalParameters(goal)),
      resolveTarget: (_goal, _context, prerequisiteTargets) => inheritFirstLocationTarget(prerequisiteTargets),
      isAvailable: (context, goal) => {
        const parameters = dressHookcrestGoalParameters(goal);
        return parameters !== void 0 && context.character.physical.has(parameters.carcassItemId);
      },
      duration: 10,
      risk: 1,
      cost: 0
    },
    {
      id: "butcher-hookcrest",
      name: "Butcher Hookcrest",
      achieves: { type: "butcherHookcrest" },
      prerequisites: [],
      getPrerequisites: (goal) => locationPrerequisite(butcherHookcrestGoalParameters(goal)),
      resolveTarget: (_goal, _context, prerequisiteTargets) => inheritFirstLocationTarget(prerequisiteTargets),
      isAvailable: (context, goal) => {
        const parameters = butcherHookcrestGoalParameters(goal);
        return parameters !== void 0 && context.character.physical.has(parameters.carcassItemId);
      },
      duration: 15,
      risk: 1,
      cost: 0
    }
  ];
  function huntHookcrestGoalParameters(goal) {
    if (!goal || goal.type !== "huntHookcrest" || !goal.parameters) return void 0;
    const p = goal.parameters;
    if (typeof p.activityId !== "string" || typeof p.habitatId !== "string" || p.speciesId !== "hookcrest" || !isPosition11(p.position) || typeof p.bowItemId !== "string" || typeof p.carrierSlot !== "string") return void 0;
    return {
      activityId: p.activityId,
      habitatId: p.habitatId,
      speciesId: p.speciesId,
      position: { ...p.position },
      bowItemId: p.bowItemId,
      carrierSlot: p.carrierSlot
    };
  }
  function dressHookcrestGoalParameters(goal) {
    if (!goal || goal.type !== "dressHookcrest" || !goal.parameters) return void 0;
    const p = goal.parameters;
    if (typeof p.activityId !== "string" || typeof p.carcassItemId !== "string" || typeof p.carrierSlot !== "string" || typeof p.facilityId !== "string" || typeof p.actionPointId !== "string" || !isPosition11(p.position)) return void 0;
    return {
      activityId: p.activityId,
      carcassItemId: p.carcassItemId,
      carrierSlot: p.carrierSlot,
      facilityId: p.facilityId,
      actionPointId: p.actionPointId,
      position: { ...p.position }
    };
  }
  function butcherHookcrestGoalParameters(goal) {
    if (!goal || goal.type !== "butcherHookcrest" || !goal.parameters) return void 0;
    const p = goal.parameters;
    if (typeof p.activityId !== "string" || typeof p.carcassItemId !== "string" || typeof p.facilityId !== "string" || typeof p.actionPointId !== "string" || !isPosition11(p.position) || typeof p.outputContainerId !== "string" || !Number.isInteger(p.yieldCount) || p.yieldCount <= 0) return void 0;
    return {
      activityId: p.activityId,
      carcassItemId: p.carcassItemId,
      facilityId: p.facilityId,
      actionPointId: p.actionPointId,
      position: { ...p.position },
      outputContainerId: p.outputContainerId,
      yieldCount: p.yieldCount
    };
  }
  function locationPrerequisite(parameters) {
    if (!parameters) return [];
    return [{
      type: "atLocation",
      parameters: {
        subjectId: parameters.habitatId ?? parameters.actionPointId,
        position: { ...parameters.position }
      }
    }];
  }
  function isPosition11(value) {
    if (!value || typeof value !== "object") return false;
    const candidate = value;
    return typeof candidate.x === "number" && Number.isFinite(candidate.x) && typeof candidate.y === "number" && Number.isFinite(candidate.y);
  }

  // src/activities/PreparedMealServiceActivity.ts
  var PreparedMealServiceActivity = class {
    constructor() {
      this.id = "prepared-meal-service";
      this.name = "Prepare And Serve Meals";
    }
    getIntents({ character, time }) {
      const requests = character.requests.getIncoming(time).filter((request2) => this.isPreparedMealRequest(request2)).filter((request2) => request2.status === "pending" || request2.status === "accepted").sort((first, second) => {
        if (first.status === "accepted" && second.status !== "accepted") return -1;
        if (second.status === "accepted" && first.status !== "accepted") return 1;
        return first.createdAt - second.createdAt;
      });
      const request = requests[0];
      if (!request) return [];
      return [{
        id: `${character.id}:activity:${this.id}:request:${request.id}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "servePreparedMealRequest",
          parameters: { requestId: request.id }
        },
        priority: request.status === "accepted" ? 80 : 30
      }];
    }
    isPreparedMealRequest(request) {
      return request.type === "prepared-meal" && request.parameters?.service === "food" && request.parameters?.offering === "prepared-meal";
    }
  };

  // src/activities/ServedDrinkServiceActivity.ts
  var ServedDrinkServiceActivity = class {
    constructor() {
      this.id = "served-drink-service";
      this.name = "Pour And Serve Drinks";
    }
    getIntents({ character, time }) {
      const requests = character.requests.getIncoming(time).filter((request2) => this.isServedDrinkRequest(request2)).filter((request2) => request2.status === "pending" || request2.status === "accepted").sort((first, second) => {
        if (first.status === "accepted" && second.status !== "accepted") return -1;
        if (second.status === "accepted" && first.status !== "accepted") return 1;
        return first.createdAt - second.createdAt;
      });
      const request = requests[0];
      if (!request) return [];
      return [{
        id: `${character.id}:activity:${this.id}:request:${request.id}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "serveServedDrinkRequest",
          parameters: { requestId: request.id }
        },
        priority: request.status === "accepted" ? 80 : 30
      }];
    }
    isServedDrinkRequest(request) {
      return request.type === "served-drink" && request.parameters?.service === "drink" && request.parameters?.offering === "served-drink";
    }
  };

  // src/perception/PerceptionSystem.ts
  var NAVIGATION_BARRIER_RECOGNITION_RANGE_METRES = 15;
  var NAVIGATION_BARRIER_VISIBILITY_OFFSET_METRES = 0.01;
  var PerceptionSystem = class {
    constructor(perception = new Perception()) {
      this.perception = perception;
      this.objectPerceptionLevels = /* @__PURE__ */ new Map();
    }
    update(world2) {
      const visibilityMultiplier = world2.dayNightEnvironmentEnabled ? visualRangeMultiplier(world2.minuteOfDay) : 1;
      for (const observer of world2.characters) {
        observer.memory.decay(world2.time);
        this.recordNavigationObservations(observer, world2, visibilityMultiplier);
        this.recordRoomResourceObservations(observer, world2);
        for (const subject of world2.characters) {
          if (!world2.navigation.isLineClear(observer.position, subject.position, "vision")) {
            continue;
          }
          const observation = this.perception.observe(
            observer,
            subject,
            world2.time,
            visibilityMultiplier
          );
          if (observation) {
            this.recordObservation(observer, subject, observation, world2);
          }
        }
        for (const object of world2.objects) {
          if (object.kind !== "building" && !world2.navigation.isLineClear(observer.position, object.position, "vision")) {
            continue;
          }
          const observation = this.perception.observeObject(
            observer,
            object,
            world2.time,
            visibilityMultiplier
          );
          if (observation) {
            this.recordObjectObservation(observer, observation, world2);
          }
        }
      }
    }
    recordRoomResourceObservations(observer, world2) {
      const room6 = world2.getRoomAtPosition(observer.position);
      if (!room6) return;
      for (const resource of world2.roomResources.getLiquidsInRoom(room6.id)) {
        rememberRoomLiquidResource(observer, resource, world2.time);
      }
    }
    recordNavigationObservations(observer, world2, visibilityMultiplier) {
      const recognitionRange = NAVIGATION_BARRIER_RECOGNITION_RANGE_METRES * visibilityMultiplier;
      for (const edge of world2.navigation.getBarrierEdges()) {
        const midpoint = this.barrierMidpoint(edge, world2);
        const distance10 = Math.hypot(
          midpoint.x - observer.position.x,
          midpoint.y - observer.position.y
        );
        if (distance10 > recognitionRange) continue;
        const visiblePoint = this.visibleSidePoint(observer.position, midpoint);
        if (!world2.navigation.isLineClear(observer.position, visiblePoint, "vision")) continue;
        observer.navigationKnowledge.observeBarrier(
          edge.first,
          edge.second,
          edge.barrier,
          "perception",
          world2.time,
          1
        );
      }
    }
    barrierMidpoint(edge, world2) {
      const first = world2.navigation.cellCentre(edge.first);
      const second = world2.navigation.cellCentre(edge.second);
      return {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2
      };
    }
    visibleSidePoint(observer, midpoint) {
      const dx = observer.x - midpoint.x;
      const dy = observer.y - midpoint.y;
      const distance10 = Math.hypot(dx, dy);
      if (distance10 === 0) return { ...midpoint };
      const offset = Math.min(NAVIGATION_BARRIER_VISIBILITY_OFFSET_METRES, distance10);
      return {
        x: midpoint.x + dx / distance10 * offset,
        y: midpoint.y + dy / distance10 * offset
      };
    }
    recordObservation(observer, subject, observation, world2) {
      const existing = observer.memory.getAll().find(
        (memory2) => memory2.type === "person-observed" && memory2.subjectId === observation.observationId
      );
      const previousLevel = existing?.context?.perceptionLevel;
      const levelChanged = previousLevel !== observation.level;
      const context = {
        perceptionLevel: observation.level,
        distance: observation.distance,
        identified: observation.level === "identification",
        position: { ...observation.position },
        observationId: observation.observationId,
        // Occupancy is recorded only for a person who is actually being seen.
        // The objective subject id is used internally at this perception boundary
        // but is not exposed unless normal identity perception already did so.
        occupiedActionPointIds: world2.getOccupiedActionPointIds(subject.id)
      };
      if (observation.subjectId !== void 0) {
        context.identifiedPersonId = observation.subjectId;
      }
      const memory = {
        id: `${observer.id}:${observation.observationId}`,
        type: "person-observed",
        subjectId: observation.observationId,
        persistence: 60,
        confidence: this.confidenceFor(observation.level),
        createdAt: existing?.createdAt ?? observation.observedAt,
        lastObservedAt: observation.observedAt,
        importance: 1,
        context
      };
      observer.memory.remember(memory);
      if (levelChanged) {
        const verb = observation.level === "detection" ? "observes" : observation.level === "recognition" ? "recognises" : "identifies";
        const subjectLabel = observation.subjectId ?? "person";
        logSimulation(
          world2,
          "debug",
          `${observer.name} ${verb} ${subjectLabel} at ${observation.distance.toFixed(1)}m`
        );
      }
    }
    recordObjectObservation(observer, observation, world2) {
      const key = `${observation.observerId}:${observation.objectId}`;
      const previousLevel = this.objectPerceptionLevels.get(key);
      const levelChanged = previousLevel !== observation.level;
      this.objectPerceptionLevels.set(key, observation.level);
      if (observation.kind === "building") {
        this.recordPlaceObservation(observer, observation);
      }
      if (observation.level !== "detection" && observation.servicePoint) {
        this.recordServicePointObservation(observer, observation, world2);
      }
      if (observation.level !== "detection" && observation.recognisableServices?.length) {
        const confidence = this.confidenceFor(observation.level);
        for (const service of observation.recognisableServices) {
          const existing = observer.knowledge.find(
            (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === observation.objectId && knowledge.polarity === "positive" && knowledge.context?.service === service && knowledge.context?.offering === void 0 && knowledge.context?.itemType === void 0 && knowledge.context?.foodKind === void 0
          );
          if (!existing || existing.sourceType === "perception" || confidence >= existing.confidence) {
            observer.addKnowledge({
              type: "service-place",
              subjectId: observation.objectId,
              polarity: "positive",
              position: { ...observation.position },
              context: { service },
              sourceType: "perception",
              sourceId: observation.objectId,
              learnedAt: observation.observedAt,
              confidence
            });
          }
        }
      }
      if (observation.level === "identification" && observation.advertisedServiceOfferings?.length) {
        for (const descriptor of observation.advertisedServiceOfferings) {
          observer.addKnowledge({
            type: "service-place",
            subjectId: observation.objectId,
            polarity: "positive",
            position: { ...observation.position },
            context: {
              service: descriptor.service,
              placeId: observation.objectId,
              offering: descriptor.offering,
              ...descriptor.itemType !== void 0 ? { itemType: descriptor.itemType } : {},
              ...descriptor.foodKind !== void 0 ? { foodKind: descriptor.foodKind } : {},
              ...descriptor.terms !== void 0 ? {
                terms: {
                  ...descriptor.terms.price !== void 0 ? { price: descriptor.terms.price } : {},
                  ...descriptor.terms.expectedDuration !== void 0 ? { expectedDuration: descriptor.terms.expectedDuration } : {},
                  ...descriptor.terms.effects !== void 0 ? { effects: { ...descriptor.terms.effects } } : {}
                }
              } : {}
            },
            sourceType: "perception",
            sourceId: observation.objectId,
            learnedAt: observation.observedAt,
            confidence: 1
          });
        }
      }
      if (observation.level === "identification" && observation.advertisedServiceHours?.length) {
        for (const descriptor of observation.advertisedServiceHours) {
          observer.addKnowledge({
            type: "service-hours",
            subjectId: observation.objectId,
            polarity: "positive",
            context: {
              service: descriptor.service,
              hours: descriptor.windows.map((window) => ({ ...window }))
            },
            sourceType: "perception",
            sourceId: observation.objectId,
            learnedAt: observation.observedAt,
            confidence: 1
          });
        }
      }
      if (observation.kind === "fountain" && observation.level !== "detection") {
        const confidence = this.confidenceFor(observation.level);
        const existing = observer.knowledge.find(
          (knowledge) => knowledge.type === "water-source" && knowledge.subjectId === observation.objectId && knowledge.polarity === "positive"
        );
        if (!existing || existing.sourceType === "perception" || confidence >= existing.confidence) {
          observer.addKnowledge({
            type: "water-source",
            subjectId: observation.objectId,
            polarity: "positive",
            position: { ...observation.position },
            sourceType: "perception",
            sourceId: observation.objectId,
            learnedAt: observation.observedAt,
            confidence
          });
        }
      }
      if (levelChanged) {
        const verb = observation.level === "identification" ? "identifies" : observation.level === "recognition" ? "recognises" : "observes";
        const saleDescription = observation.displayedForSale ? " (displayed for sale)" : "";
        const placeDescription = observation.level !== "detection" && observation.recognisablePlaceType ? ` ${observation.recognisablePlaceType}` : "";
        const servicePointDescription = observation.level !== "detection" && observation.servicePoint ? ` service-point(${observation.servicePoint.services.join(",")}${observation.servicePointState ? `,${observation.servicePointState}` : ""})` : "";
        logSimulation(
          world2,
          "debug",
          `${observation.observerId} ${verb}${placeDescription} ${observation.kind} ${observation.objectId}${servicePointDescription} at ${observation.distance.toFixed(1)}m${saleDescription}`
        );
      }
    }
    recordPlaceObservation(observer, observation) {
      const existing = observer.memory.getByType("place-observed").find(
        (memory) => memory.subjectId === observation.observationId
      );
      const hasExistingPlaceKnowledge = observer.knowledge.some(
        (knowledge) => knowledge.type === "home-location" && knowledge.subjectId === observation.objectId && knowledge.polarity === "positive"
      );
      const publiclyRecognised = observation.level !== "detection" && (observation.recognisablePlaceType !== void 0 || (observation.recognisableServices?.length ?? 0) > 0);
      const knownPlaceId = hasExistingPlaceKnowledge || publiclyRecognised ? observation.objectId : void 0;
      const context = {
        perceptionLevel: observation.level,
        distance: observation.distance,
        position: { ...observation.position },
        observationId: observation.observationId,
        visualSize: observation.visualSize ?? "small"
      };
      if (observation.level !== "detection") {
        context.recognisedKind = "building";
        if (observation.recognisablePlaceType) {
          context.recognisedPlaceType = observation.recognisablePlaceType;
        }
        if (observation.recognisableServices?.length) {
          context.recognisedServices = [...observation.recognisableServices];
        }
        if (observation.hasAdvertisedServiceOfferings) {
          context.hasAdvertisedServiceOfferings = true;
        }
      }
      if (knownPlaceId) {
        context.knownPlaceId = knownPlaceId;
      }
      observer.memory.remember({
        id: `${observer.id}:${observation.observationId}`,
        type: "place-observed",
        subjectId: observation.observationId,
        persistence: 10080,
        confidence: this.confidenceFor(observation.level),
        createdAt: existing?.createdAt ?? observation.observedAt,
        lastObservedAt: observation.observedAt,
        importance: observation.visualSize === "large" ? 1 : 0.6,
        context
      });
    }
    recordServicePointObservation(observer, observation, world2) {
      const servicePoint = observation.servicePoint;
      if (!servicePoint) return;
      const existing = observer.memory.getByType("service-point-observed").find(
        (memory) => memory.subjectId === observation.objectId
      );
      const providerActionPoint = serviceProviderActionPoint(observation.objectId, servicePoint);
      const customerActionPoint = serviceCustomerActionPoint(observation.objectId, servicePoint);
      observer.memory.remember({
        id: `${observer.id}:service-point:${observation.objectId}`,
        type: "service-point-observed",
        subjectId: observation.objectId,
        persistence: 10080,
        confidence: this.confidenceFor(observation.level),
        createdAt: existing?.createdAt ?? observation.observedAt,
        lastObservedAt: observation.observedAt,
        importance: 0.8,
        context: {
          perceptionLevel: observation.level,
          position: { ...observation.position },
          placeId: servicePoint.placeId,
          services: [...servicePoint.services],
          providerPosition: { ...servicePoint.providerPosition },
          customerPosition: { ...servicePoint.customerPosition },
          providerActionPointId: providerActionPoint.id,
          customerActionPointId: customerActionPoint.id,
          providerOccupied: world2.resourceUsage.occupancy(providerActionPoint.id) > 0,
          customerOccupied: world2.resourceUsage.occupancy(customerActionPoint.id) > 0,
          minuteOfDay: world2.minuteOfDay,
          ...observation.servicePointState ? { state: observation.servicePointState } : {}
        }
      });
    }
    confidenceFor(level) {
      switch (level) {
        case "identification":
          return 1;
        case "recognition":
          return 0.75;
        case "detection":
          return 0.5;
      }
    }
  };

  // src/perception/FixtureNavigationPerception.ts
  var FIXTURE_NAVIGATION_RECOGNITION_RANGE_METRES = 15;
  var FixtureNavigationPerception = class {
    update(world2) {
      const visibilityMultiplier = world2.dayNightEnvironmentEnabled ? visualRangeMultiplier(world2.minuteOfDay) : 1;
      const recognitionRange = FIXTURE_NAVIGATION_RECOGNITION_RANGE_METRES * visibilityMultiplier;
      for (const observer of world2.characters) {
        for (const object of world2.objects) {
          const obstruction = world2.getFixtureObstruction(object);
          if (!obstruction) continue;
          for (const cell of fixtureObstructionCells(obstruction)) {
            const cellObstruction = {
              origin: { ...cell },
              width: 1,
              height: 1
            };
            const visiblePoint = fixtureVisibleSidePoint(observer.position, cellObstruction);
            const distance10 = Math.hypot(
              visiblePoint.x - observer.position.x,
              visiblePoint.y - observer.position.y
            );
            if (distance10 > recognitionRange) continue;
            if (!world2.navigation.isLineClear(observer.position, visiblePoint, "vision")) continue;
            observer.navigationKnowledge.observeBlockedCell(
              cell,
              "perception",
              world2.time,
              1
            );
          }
        }
      }
    }
  };

  // src/planning/PlanExecutionRegistry.ts
  var PlanExecutionRegistry = class {
    constructor() {
      this.handlers = /* @__PURE__ */ new Map();
    }
    register(planId, handler) {
      if (this.handlers.has(planId)) {
        throw new Error(`Plan execution handler already registered for ${planId}`);
      }
      this.handlers.set(planId, handler);
    }
    has(planId) {
      return this.handlers.has(planId);
    }
    execute(plan, character, world2) {
      const planId = plan.definition?.id;
      if (!planId) return void 0;
      return this.handlers.get(planId)?.(plan, character, world2);
    }
  };

  // src/planning/BasicNeedsExecution.ts
  var WATER_TYPE4 = "water";
  var CASUAL_SOURCE_DRINK_THRESHOLD = 30;
  var MEAL_MEMORY_PERSISTENCE_MINUTES = 2 * 24 * 60;
  var FOOD_POCKET_SLOT = "food-pocket";
  var BREAD_PORTION_PREPARATION_MINUTES = 2;
  var PACKED_MEAL_PREPARATION_MINUTES = 5;
  var PACKED_MEAL_EATING_MINUTES = 10;
  var PACKED_MEAL_HUNGER_RELIEF = 115;
  var PACKED_MEAL_STOMACH_VOLUME = 45;
  var PACKED_MEAL_SHELF_LIFE_MINUTES = 24 * 60;
  function registerBasicNeedsHandlers(registry) {
    registerIfMissing(
      registry,
      "eat-food",
      (plan, character, world2) => eatFood(plan, character, world2)
    );
    registerIfMissing(
      registry,
      "prepare-packed-meal",
      (plan, character, world2) => preparePackedMealForLater(plan, character, world2)
    );
    registerIfMissing(
      registry,
      "drink-water",
      (_plan, character, world2) => drinkWater(character, world2)
    );
    registerIfMissing(
      registry,
      "collect-water",
      (plan, character, world2) => plan.target?.type === "location" ? collectWater(character, world2, plan.target) : { status: "failed" }
    );
    registerIfMissing(
      registry,
      "sleep",
      (_plan, character, world2) => sleep(character, world2)
    );
    registerIfMissing(
      registry,
      "sleep-rented-room",
      (_plan, character, world2) => sleep(character, world2)
    );
  }
  function registerIfMissing(registry, planId, handler) {
    if (!registry.has(planId)) registry.register(planId, handler);
  }
  function eatFood(plan, character, world2) {
    if (plan.executionState?.eatFoodCompleted === true) return { status: "completed" };
    const mealSize = plan.goal?.parameters?.mealSize;
    const preparedFoodItemId = typeof plan.executionState?.preparedFoodItemId === "string" ? plan.executionState.preparedFoodItemId : void 0;
    const preparedFood = preparedFoodItemId ? character.physical.get(preparedFoodItemId) : void 0;
    if (!preparedFood && mealSize !== "small") {
      const ingredients = carriedBreadAndDriedMeat(character);
      if (ingredients) {
        return startPackedMealPreparation(plan, character, world2, ingredients.breadId, ingredients.meatId);
      }
    }
    const foods = character.physical.getAll().filter(
      (possession) => isDirectlyEdibleFood(possession.item) && canFitFoodPortion(character.fullness, possession.item)
    );
    if (foods.length === 0) return { status: "failed" };
    const carriedFirst = [
      ...foods.filter(isCarriedPossession),
      ...foods.filter((possession) => !isCarriedPossession(possession))
    ];
    const orderedFoods = mealSize === "main" ? [...carriedFirst].sort(
      (first, second) => (getDirectFoodHungerRelief(second.item) ?? 0) - (getDirectFoodHungerRelief(first.item) ?? 0)
    ) : mealSize === "small" ? [...carriedFirst].sort(
      (first, second) => (getDirectFoodHungerRelief(first.item) ?? 0) - (getDirectFoodHungerRelief(second.item) ?? 0)
    ) : carriedFirst;
    const food = preparedFood && foods.some((candidate) => candidate.item.id === preparedFood.item.id) ? preparedFood : orderedFoods[0];
    if (!food) return { status: "failed" };
    if (isWholeBreadLoaf(food.item)) {
      if (!isCarriedPossession(food)) return { status: "failed" };
      return startBreadPortionPreparation(plan, character, world2, food.item.id);
    }
    const duration = foodEatingDuration(food.item);
    const packedMeal = isBreadAndDriedMeatPackedMeal(food.item);
    const tableMeal = food.item.food?.kind === "prepared-meal" && !packedMeal;
    const completesAt = world2.time + duration;
    let releasedSeat = false;
    const releaseDiningSeat = () => {
      if (releasedSeat || !tableMeal) return;
      releasedSeat = true;
      world2.resourceUsage.releaseAll(character.id);
    };
    logSimulation(
      world2,
      "event",
      tableMeal ? `${character.name} begins eating a prepared meal at the table` : packedMeal ? `${character.name} begins eating a packed bread and dried meat meal` : `${character.name} begins eating ${food.item.food?.kind ?? "food"}`
    );
    return startAction(
      character,
      world2,
      packedMeal ? "eat-packed-meal" : `eat-${food.item.food?.kind ?? "food"}`,
      duration,
      Math.max(2, Math.ceil(duration / 2)),
      () => {
        if (world2.time < completesAt) return false;
        const current = character.physical.get(food.item.id);
        if (!current || !canFitFoodPortion(character.fullness, current.item)) {
          releaseDiningSeat();
          return true;
        }
        if (!character.beginDigestingFood(current.item)) {
          releaseDiningSeat();
          return true;
        }
        const remainingServings = consumeFoodServing(current.item);
        if (remainingServings <= 0) character.physical.remove(current.item.id);
        rememberMeal(
          character,
          current.item.id,
          current.item.food?.kind ?? "food",
          mealSize,
          world2.time,
          current.item.food?.dishId
        );
        plan.executionState = {
          ...plan.executionState ?? {},
          eatFoodCompleted: true
        };
        releaseDiningSeat();
        const remainingLabel = remainingServings > 0 ? ` (${remainingServings} serving${remainingServings === 1 ? "" : "s"} remain)` : "";
        logSimulation(
          world2,
          "event",
          tableMeal ? `${character.name} finishes the prepared meal and leaves the table` : packedMeal ? `${character.name} finishes the packed bread and dried meat meal` : `${character.name} finishes eating ${current.item.food?.kind ?? "food"}${remainingLabel}`
        );
        return true;
      },
      {
        interruptionPolicy: "interruptible",
        onInterrupt: releaseDiningSeat
      }
    );
  }
  function startBreadPortionPreparation(plan, character, world2, loafId) {
    const readyAt = world2.time + BREAD_PORTION_PREPARATION_MINUTES;
    logSimulation(world2, "event", `${character.name} begins cutting a portion from ${loafId}`);
    return startAction(
      character,
      world2,
      "cut-bread-portion",
      BREAD_PORTION_PREPARATION_MINUTES,
      2,
      () => {
        if (world2.time < readyAt) return false;
        const loaf = character.physical.get(loafId);
        if (!loaf || !isCarriedPossession(loaf) || !isWholeBreadLoaf(loaf.item)) return true;
        const hungerRelief = getDirectFoodHungerRelief(loaf.item);
        const hydrationRelief = getDirectFoodHydrationRelief(loaf.item);
        const stomachVolume = getFoodStomachVolume(loaf.item);
        if (hungerRelief === void 0 || stomachVolume === void 0) return true;
        const remaining = consumeFoodServing(loaf.item);
        if (remaining <= 0) character.physical.remove(loaf.item.id);
        const portionId = `${loafId}-portion-${readyAt}`;
        character.physical.add({
          id: portionId,
          type: "food",
          size: "small",
          physical: { carryHands: 1, useHands: 1 },
          food: {
            kind: "bread",
            dishId: BREAD_PORTION_DISH_ID,
            servings: { total: 1, remaining: 1 },
            stomachVolume,
            directlyEdible: {
              hungerRelief,
              ...hydrationRelief !== void 0 && hydrationRelief > 0 ? { hydrationRelief } : {}
            },
            ...loaf.item.food?.spoilage ? {
              spoilage: { ...loaf.item.food.spoilage }
            } : {}
          }
        }, { type: "equipped", slot: FOOD_POCKET_SLOT });
        plan.executionState = {
          ...plan.executionState ?? {},
          preparedFoodItemId: portionId
        };
        logSimulation(
          world2,
          "event",
          `${character.name} cuts one bread portion; ${remaining} loaf serving${remaining === 1 ? "" : "s"} remain`
        );
        return true;
      },
      { interruptionPolicy: "interruptible" }
    );
  }
  function carriedBreadAndDriedMeat(character) {
    const carried = character.physical.getAll().filter(isCarriedPossession);
    const bread = carried.find(
      (possession) => possession.item.food?.kind === "bread" && isDirectlyEdibleFood(possession.item)
    );
    const meat = carried.find(
      (possession) => possession.item.food?.kind === "dried-meat" && isDirectlyEdibleFood(possession.item)
    );
    return bread && meat ? { breadId: bread.item.id, meatId: meat.item.id } : void 0;
  }
  function preparePackedMealForLater(plan, character, world2) {
    const preparedId = typeof plan.executionState?.preparedFoodItemId === "string" ? plan.executionState.preparedFoodItemId : void 0;
    if (preparedId && character.physical.get(preparedId)) return { status: "completed" };
    if (character.physical.getAll().some(
      (possession) => isCarriedPossession(possession) && isBreadAndDriedMeatPackedMeal(possession.item)
    )) return { status: "completed" };
    const ingredients = carriedBreadAndDriedMeat(character);
    return ingredients ? startPackedMealPreparation(plan, character, world2, ingredients.breadId, ingredients.meatId) : { status: "failed" };
  }
  function startPackedMealPreparation(plan, character, world2, breadId, meatId) {
    const readyAt = world2.time + PACKED_MEAL_PREPARATION_MINUTES;
    logSimulation(world2, "event", `${character.name} begins making a bread and dried meat packed meal`);
    return startAction(
      character,
      world2,
      "prepare-packed-meal",
      PACKED_MEAL_PREPARATION_MINUTES,
      2,
      () => {
        if (world2.time < readyAt) return false;
        const bread = character.physical.get(breadId);
        const meat = character.physical.get(meatId);
        if (!bread || !meat || !isCarriedPossession(bread) || !isCarriedPossession(meat) || bread.item.food?.kind !== "bread" || meat.item.food?.kind !== "dried-meat" || !isDirectlyEdibleFood(bread.item) || !isDirectlyEdibleFood(meat.item)) return true;
        consumePossessedServing(character, bread.item);
        consumePossessedServing(character, meat.item);
        const mealId = `${character.id}-${BREAD_AND_DRIED_MEAT_DISH_ID}-${readyAt}`;
        character.physical.add({
          id: mealId,
          type: "food",
          size: "small",
          physical: { carryHands: 1, useHands: 1 },
          food: {
            kind: "prepared-meal",
            dishId: BREAD_AND_DRIED_MEAT_DISH_ID,
            servings: { total: 1, remaining: 1 },
            stomachVolume: PACKED_MEAL_STOMACH_VOLUME,
            directlyEdible: { hungerRelief: PACKED_MEAL_HUNGER_RELIEF },
            spoilage: {
              ageMinutes: 0,
              shelfLifeMinutes: PACKED_MEAL_SHELF_LIFE_MINUTES
            }
          }
        }, { type: "equipped", slot: FOOD_POCKET_SLOT });
        plan.executionState = {
          ...plan.executionState ?? {},
          preparedFoodItemId: mealId
        };
        logSimulation(
          world2,
          "event",
          `${character.name} packs a bread and dried meat meal into their food pocket`
        );
        return true;
      },
      { interruptionPolicy: "interruptible" }
    );
  }
  function consumePossessedServing(character, item) {
    if (consumeFoodServing(item) <= 0) character.physical.remove(item.id);
  }
  function rememberMeal(character, subjectId, foodKind, mealSize, time, dishId) {
    character.memory.remember({
      id: `${character.id}:meal-consumed:${subjectId}:${time}`,
      type: "meal-consumed",
      subjectId,
      persistence: MEAL_MEMORY_PERSISTENCE_MINUTES,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 0.8,
      context: {
        foodKind,
        mealSize: typeof mealSize === "string" ? mealSize : "unscheduled",
        ...dishId ? { dishId } : {}
      }
    });
  }
  function foodEatingDuration(item) {
    if (isBreadAndDriedMeatPackedMeal(item)) return PACKED_MEAL_EATING_MINUTES;
    switch (item.food?.kind) {
      case "prepared-meal":
        return 30;
      case "bread":
        return 10;
      case "dried-meat":
        return 8;
      case "portable":
        return 8;
      case "fruit":
      case "vegetable":
        return 5;
      default:
        return 5;
    }
  }
  function drinkWater(character, world2) {
    const fountain = findLocalFountain(character, world2);
    const roomReserve = findLocalOwnedRoomWaterReserve(character, world2);
    const fixedReserve = findLocalOwnedWaterReserve(character, world2);
    const carried = findCarriedContainerWithLiquid(character.physical.getAll(), WATER_TYPE4, 1);
    if (carried) {
      if (!character.canDrinkWater(1)) return { status: "failed" };
      if (consumeLiquid(carried, WATER_TYPE4, 1) <= 0) return { status: "failed" };
      if (!character.beginDigestingWater(carried.id, 1)) return { status: "failed" };
      logSimulation(
        world2,
        "event",
        `${character.name} drinks from ${carried.id} (${getLiquidAmount(carried, WATER_TYPE4)}/${carried.liquidContainer.capacity} remaining)`
      );
      if (fountain) {
        fillAllCarriedFromFountain(character, world2, fountain.id);
      } else if (roomReserve) {
        refillCarriedFromRoomReserve(character, world2, roomReserve);
      } else if (fixedReserve) {
        refillCarriedFromReserve(character, world2, fixedReserve);
      }
      return { status: "completed" };
    }
    if (roomReserve) {
      if (!character.canDrinkWater(1)) return { status: "failed" };
      if (world2.roomResources.consumeLiquid(roomReserve.id, 1) <= 0) return { status: "failed" };
      if (!character.beginDigestingWater(roomReserve.id, 1)) return { status: "failed" };
      rememberRoomLiquidResource(character, roomReserve, world2.time);
      logSimulation(
        world2,
        "event",
        `${character.name} drinks from ${roomReserve.id} (${roomReserve.amount}/${roomReserve.capacity} remaining)`
      );
      return { status: "completed" };
    }
    if (fixedReserve) {
      if (!character.canDrinkWater(1)) return { status: "failed" };
      if (consumeLiquid(fixedReserve, WATER_TYPE4, 1) <= 0) return { status: "failed" };
      if (!character.beginDigestingWater(fixedReserve.id, 1)) return { status: "failed" };
      logSimulation(
        world2,
        "event",
        `${character.name} drinks from ${fixedReserve.id} (${getLiquidAmount(fixedReserve, WATER_TYPE4)}/${fixedReserve.liquidContainer.capacity} remaining)`
      );
      return { status: "completed" };
    }
    if (!fountain) return { status: "failed" };
    if (!character.beginDigestingWater(fountain.id, 1)) return { status: "failed" };
    logSimulation(world2, "event", `${character.name} drinks directly from ${fountain.id}`);
    fillAllCarriedFromFountain(character, world2, fountain.id);
    return { status: "completed" };
  }
  function sleep(character, world2) {
    if (character.tiredness <= 20) return { status: "completed" };
    const bed = findAccessibleBed(character, world2);
    if (!bed?.usableResource) return { status: "failed" };
    if (Math.hypot(bed.position.x - character.position.x, bed.position.y - character.position.y) > 0.1) {
      return { status: "failed" };
    }
    if (!world2.resourceUsage.claim(bed.id, character.id, bed.usableResource.capacity)) {
      return { status: "failed" };
    }
    let released = false;
    const releaseBed = () => {
      if (released) return;
      released = true;
      world2.resourceUsage.release(bed.id, character.id);
    };
    logSimulation(world2, "event", `${character.name} uses ${bed.id} to sleep`);
    return startAction(character, world2, "sleep", 8 * 60, 4 * 60, () => {
      const complete = character.tiredness <= 20;
      if (complete) releaseBed();
      return complete;
    }, {
      interruptionPolicy: "interruptible",
      onTick: (minutes) => {
        character.tiredness = Math.max(
          0,
          character.tiredness - character.sleepRecoveryPerMinute * minutes
        );
      },
      shouldInterrupt: () => character.dailyAgenda?.items.some(
        (item) => item.status === "planned" && world2.time >= item.plannedStart
      ) ?? false,
      onInterrupt: releaseBed
    });
  }
  function findAccessibleBed(character, world2) {
    const rental = world2.accommodation.getActiveRental(character.id, world2.time);
    if (rental) {
      return world2.objects.find(
        (object) => object.usableResource?.type === "bed" && object.usableResource.roomId === rental.roomId
      );
    }
    const homeId = character.homeId;
    if (!homeId) return void 0;
    return world2.objects.find((object) => {
      const resource = object.usableResource;
      if (resource?.type !== "bed" || resource.placeId !== homeId) return false;
      return resource.roomId === void 0 || world2.accommodation.hasRoomAccess(character.id, resource.roomId, world2.time);
    });
  }
  function collectWater(character, world2, target) {
    if (!target.subjectId) return { status: "failed" };
    const sourceObject = world2.getObject(target.subjectId);
    const fountain = sourceObject?.kind === "fountain" && Math.hypot(sourceObject.position.x - character.position.x, sourceObject.position.y - character.position.y) <= 0.1 ? sourceObject : void 0;
    const roomReserve = fountain ? void 0 : findLocalOwnedRoomWaterReserve(character, world2, target.subjectId);
    const fixedReserve = fountain || roomReserve ? void 0 : findLocalOwnedWaterReserve(character, world2, target.subjectId);
    if (!fountain && !roomReserve && !fixedReserve) return { status: "failed" };
    if (character.thirst >= CASUAL_SOURCE_DRINK_THRESHOLD && character.canDrinkWater(1)) {
      if (fountain && character.beginDigestingWater(fountain.id, 1)) {
        logSimulation(world2, "event", `${character.name} drinks directly from ${fountain.id}`);
      } else if (roomReserve && world2.roomResources.consumeLiquid(roomReserve.id, 1) > 0) {
        if (!character.beginDigestingWater(roomReserve.id, 1)) return { status: "failed" };
        rememberRoomLiquidResource(character, roomReserve, world2.time);
        logSimulation(
          world2,
          "event",
          `${character.name} drinks from ${roomReserve.id} (${roomReserve.amount}/${roomReserve.capacity} remaining)`
        );
      } else if (fixedReserve && consumeLiquid(fixedReserve, WATER_TYPE4, 1) > 0) {
        if (!character.beginDigestingWater(fixedReserve.id, 1)) return { status: "failed" };
        logSimulation(
          world2,
          "event",
          `${character.name} drinks from ${fixedReserve.id} (${getLiquidAmount(fixedReserve, WATER_TYPE4)}/${fixedReserve.liquidContainer.capacity} remaining)`
        );
      }
    }
    const fillable = findCarriedFillableLiquidContainer(character.physical.getAll(), WATER_TYPE4);
    if (!fillable) {
      return findCarriedContainerWithLiquid(character.physical.getAll(), WATER_TYPE4, 1) ? { status: "completed" } : { status: "failed" };
    }
    if (fountain) {
      fillAllCarriedFromFountain(character, world2, fountain.id);
    } else if (roomReserve) {
      refillCarriedFromRoomReserve(character, world2, roomReserve);
    } else if (fixedReserve) {
      refillCarriedFromReserve(character, world2, fixedReserve);
    }
    return findCarriedContainerWithLiquid(character.physical.getAll(), WATER_TYPE4, 1) ? { status: "completed" } : { status: "failed" };
  }
  function findLocalFountain(character, world2) {
    return world2.objects.find(
      (object) => object.kind === "fountain" && Math.hypot(object.position.x - character.position.x, object.position.y - character.position.y) <= 0.1
    );
  }
  function findLocalOwnedRoomWaterReserve(character, world2, expectedResourceId) {
    const room6 = world2.getRoomAtPosition(character.position);
    if (!room6) return void 0;
    return world2.roomResources.getLiquidsInRoom(room6.id).find(
      (resource) => resource.liquidType === WATER_TYPE4 && resource.amount >= 1 && resource.ownerId === character.id && (!expectedResourceId || resource.id === expectedResourceId)
    );
  }
  function findLocalOwnedWaterReserve(character, world2, expectedItemId) {
    for (const possession of character.physical.getAll()) {
      if (isCarriedPossession(possession)) continue;
      if (expectedItemId && possession.item.id !== expectedItemId) continue;
      if (getLiquidAmount(possession.item, WATER_TYPE4) < 1) continue;
      if (possession.location.type !== "container") continue;
      const containerId = possession.location.containerId;
      const storage = world2.objects.find(
        (object) => object.containerId === containerId && Math.hypot(
          object.position.x - character.position.x,
          object.position.y - character.position.y
        ) <= 0.1
      );
      if (storage) return possession.item;
    }
    return void 0;
  }
  function fillAllCarriedFromFountain(character, world2, sourceId) {
    for (const possession of character.physical.getAll().filter(isCarriedPossession)) {
      const container = possession.item.liquidContainer;
      if (!container || container.contents && container.contents.type !== WATER_TYPE4) continue;
      const added = fillLiquidContainer(possession.item, WATER_TYPE4);
      if (added <= 0) continue;
      logSimulation(
        world2,
        "event",
        `${character.name} fills ${possession.item.id} from ${sourceId} (${getLiquidAmount(possession.item, WATER_TYPE4)}/${container.capacity})`
      );
    }
  }
  function refillCarriedFromRoomReserve(character, world2, reserve) {
    let changed = false;
    for (const possession of character.physical.getAll().filter(isCarriedPossession)) {
      const container = possession.item.liquidContainer;
      if (!container || container.contents && container.contents.type !== WATER_TYPE4) continue;
      const current = getLiquidAmount(possession.item, WATER_TYPE4);
      const needed = container.capacity - current;
      if (needed <= 0) continue;
      const transferred = world2.roomResources.consumeLiquid(reserve.id, needed);
      if (transferred <= 0) break;
      container.contents = { type: WATER_TYPE4, amount: current + transferred };
      changed = true;
      logSimulation(
        world2,
        "event",
        `${character.name} fills ${possession.item.id} from ${reserve.id} (${getLiquidAmount(possession.item, WATER_TYPE4)}/${container.capacity})`
      );
      if (reserve.amount <= 0) break;
    }
    if (changed) rememberRoomLiquidResource(character, reserve, world2.time);
  }
  function refillCarriedFromReserve(character, world2, reserve) {
    for (const possession of character.physical.getAll().filter(isCarriedPossession)) {
      const container = possession.item.liquidContainer;
      if (!container || container.contents && container.contents.type !== WATER_TYPE4) continue;
      const current = getLiquidAmount(possession.item, WATER_TYPE4);
      const needed = container.capacity - current;
      if (needed <= 0) continue;
      const transferred = transferLiquid(reserve, possession.item, WATER_TYPE4, needed);
      if (transferred <= 0) break;
      logSimulation(
        world2,
        "event",
        `${character.name} fills ${possession.item.id} from ${reserve.id} (${getLiquidAmount(possession.item, WATER_TYPE4)}/${container.capacity})`
      );
      if (getLiquidAmount(reserve, WATER_TYPE4) <= 0) break;
    }
  }

  // src/planning/SubjectivePersonExecution.ts
  var CURRENT_OBSERVATION_POSITION_TOLERANCE_METRES = 0.1;
  function resolveSubjectivePersonTarget(character, world2, target) {
    if (target.personId) {
      return world2.characters.find((candidate) => candidate.id === target.personId);
    }
    if (!target.observationId) return void 0;
    const observation = character.memory.getByType("person-observed").find(
      (memory) => memory.subjectId === target.observationId && memory.lastObservedAt === world2.time
    );
    if (!observation) return void 0;
    const position = observation.context?.position;
    if (!isPosition12(position)) return void 0;
    const identifiedPersonId = observation.context?.identifiedPersonId;
    if (typeof identifiedPersonId === "string") {
      const identified = world2.characters.find((candidate) => candidate.id === identifiedPersonId);
      if (!identified) return void 0;
      return distanceBetween(identified.position, position) <= CURRENT_OBSERVATION_POSITION_TOLERANCE_METRES ? identified : void 0;
    }
    const physicallyMatching = world2.characters.filter((candidate) => candidate.id !== character.id).filter(
      (candidate) => distanceBetween(candidate.position, position) <= CURRENT_OBSERVATION_POSITION_TOLERANCE_METRES
    );
    return physicallyMatching.length === 1 ? physicallyMatching[0] : void 0;
  }
  function isPosition12(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function distanceBetween(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  // src/planning/KnowledgeInteractionExecution.ts
  function registerKnowledgeInteractionHandlers(registry, social) {
    registerIfMissing2(
      registry,
      "ask-person",
      (plan, character, world2) => plan.target?.type === "person" ? askPerson(character, world2, plan.target, social) : { status: "failed" }
    );
    registerIfMissing2(
      registry,
      "ask-knowledge",
      (plan, character, world2) => plan.target?.type === "person" ? askForKnowledge(plan, character, world2, plan.target, social) : { status: "failed" }
    );
  }
  function registerIfMissing2(registry, planId, handler) {
    if (!registry.has(planId)) registry.register(planId, handler);
  }
  function askForKnowledge(plan, character, world2, target, social) {
    const query = knowledgeQueryFromParameters(plan.goal?.parameters);
    if (!query) return { status: "failed" };
    const person = resolveSubjectivePersonTarget(character, world2, target);
    if (!person) return { status: "failed" };
    const result = social.askPerson(character, person, query, world2);
    return result.type === "out-of-range" ? { status: "failed" } : { status: "completed" };
  }
  function askPerson(character, world2, target, social) {
    const person = resolveSubjectivePersonTarget(character, world2, target);
    if (!person) return { status: "failed" };
    const providerQuery = {
      type: "service-provider",
      subjectId: "*",
      context: { service: "food" }
    };
    const providerResult = social.askPerson(character, person, providerQuery, world2);
    if (providerResult.type === "out-of-range") return { status: "failed" };
    if (providerResult.type !== "information") return { status: "completed" };
    const locationResult = social.askPerson(
      character,
      person,
      { type: "person-location", subjectId: providerResult.query.subjectId },
      world2
    );
    return locationResult.type === "out-of-range" ? { status: "failed" } : { status: "completed" };
  }

  // src/planning/LocationExecution.ts
  function registerLocationHandlers(registry, movement) {
    registerIfMissing3(
      registry,
      "go-to-water-source",
      (plan, character, world2) => plan.target?.type === "location" ? goToLocation(character, world2, plan.target, movement) : { status: "failed" }
    );
    registerIfMissing3(
      registry,
      "go-home",
      (plan, character, world2) => plan.target?.type === "location" ? goHome(character, world2, plan.target, movement) : { status: "failed" }
    );
    registerIfMissing3(
      registry,
      "go-to-location",
      (plan, character, world2) => plan.target?.type === "location" ? goToLocation(character, world2, plan.target, movement) : { status: "failed" }
    );
    registerIfMissing3(
      registry,
      "go-to-accommodation",
      (plan, character, world2) => plan.target?.type === "location" ? goToLocation(character, world2, plan.target, movement) : { status: "failed" }
    );
  }
  function registerIfMissing3(registry, planId, handler) {
    if (!registry.has(planId)) registry.register(planId, handler);
  }
  function goHome(character, world2, target, movement) {
    if (!target.subjectId) return { status: "failed" };
    const home = world2.getObject(target.subjectId);
    if (!home || home.kind !== "building" || !isInsideBuilding(target.position, home)) {
      return { status: "failed" };
    }
    const rememberedDistance = Math.hypot(
      target.position.x - character.position.x,
      target.position.y - character.position.y
    );
    if (rememberedDistance <= 0.1) return { status: "completed" };
    const travelDuration = movement.estimateTravelDuration(character, target.position, world2);
    if (travelDuration === void 0) return { status: "failed" };
    movement.start(character, target.position);
    return startAction(
      character,
      world2,
      `go-home:${target.subjectId}`,
      travelDuration,
      Math.max(0.5, travelDuration * 0.5),
      () => Math.hypot(
        target.position.x - character.position.x,
        target.position.y - character.position.y
      ) <= 0.1 && isInsideBuilding(target.position, home)
    );
  }
  function goToLocation(character, world2, target, movement) {
    const distance10 = Math.hypot(
      target.position.x - character.position.x,
      target.position.y - character.position.y
    );
    if (distance10 <= 0.1) return { status: "completed" };
    const travelDuration = movement.estimateTravelDuration(character, target.position, world2);
    if (travelDuration === void 0) return { status: "failed" };
    movement.start(character, target.position);
    return startAction(
      character,
      world2,
      `go-to-location:${target.subjectId ?? "unknown"}`,
      travelDuration,
      travelDuration * 0.5,
      () => Math.hypot(
        target.position.x - character.position.x,
        target.position.y - character.position.y
      ) <= 0.1
    );
  }
  function isInsideBuilding(position, building) {
    const footprint = building.physicalFootprint;
    if (!footprint) {
      return Math.hypot(
        position.x - building.position.x,
        position.y - building.position.y
      ) <= 0.1;
    }
    const cellX = Math.floor(position.x);
    const cellY = Math.floor(position.y);
    return cellX >= footprint.origin.x && cellX < footprint.origin.x + footprint.width && cellY >= footprint.origin.y && cellY < footprint.origin.y + footprint.height;
  }

  // src/planning/PersonMovementExecution.ts
  function registerPersonMovementHandlers(registry, movement) {
    registerIfMissing4(
      registry,
      "search-for-person",
      (plan, character, world2) => searchForPerson(plan, character, world2, movement)
    );
    registerIfMissing4(
      registry,
      "go-to-person",
      (plan, character, world2) => plan.target?.type === "person" ? goToPerson(character, world2, plan.target, movement) : { status: "failed" }
    );
    registerIfMissing4(
      registry,
      "go-to-conversation-range",
      (plan, character, world2) => plan.target?.type === "person" ? goToConversationRange(character, world2, plan.target, movement) : { status: "failed" }
    );
    registerIfMissing4(
      registry,
      "wait-for-person",
      (plan, character, world2) => plan.target?.type === "person" ? waitForPerson(character, world2, plan.target) : { status: "failed" }
    );
  }
  function registerIfMissing4(registry, planId, handler) {
    if (!registry.has(planId)) registry.register(planId, handler);
  }
  function searchForPerson(plan, character, world2, movement) {
    let state2 = plan.executionState?.personSearch;
    if (!state2) {
      state2 = {
        pattern: createPersonSearchPattern(character, world2.time, character.position),
        waypointIndex: 0,
        initialObservationIds: character.memory.getByType("person-observed").map((memory) => memory.subjectId)
      };
      plan.executionState = {
        ...plan.executionState ?? {},
        personSearch: state2
      };
      const searchDescription = state2.pattern.strategy === "environmental-lead" ? `${character.name} searches toward a prominent observed place for signs of people` : `${character.name} explores unfamiliar nearby territory for a person`;
      logSimulation(world2, "event", searchDescription);
    }
    const found = findNewSearchPersonTarget(state2, character);
    if (found) {
      plan.target = found;
      character.movementTarget = void 0;
      logSimulation(world2, "event", `${character.name} finds someone while searching`);
      return { status: "completed" };
    }
    if (state2.waypointIndex >= state2.pattern.waypoints.length) {
      rememberFailedPersonSearch(character, world2.time, state2.pattern);
      logSimulation(world2, "event", `${character.name} finishes searching the area without finding anyone`);
      return { status: "failed" };
    }
    const waypoint = state2.pattern.waypoints[state2.waypointIndex];
    const legNumber = state2.waypointIndex + 1;
    state2.waypointIndex += 1;
    const expectedDuration = movement.estimateTravelDuration(character, waypoint, world2);
    if (expectedDuration === void 0) {
      rememberBlockedPersonSearch(character, world2.time, state2.pattern, waypoint);
      logSimulation(world2, "decision", `${character.name} cannot reach the next person-search area; search will be reconsidered later`);
      return { status: "failed" };
    }
    movement.start(character, waypoint);
    return startAction(
      character,
      world2,
      `search-for-person:${legNumber}/${state2.pattern.waypoints.length}`,
      expectedDuration,
      Math.max(0.5, expectedDuration * 0.5),
      () => {
        const discovered = findNewSearchPersonTarget(state2, character);
        if (discovered) {
          plan.target = discovered;
          character.movementTarget = void 0;
          return true;
        }
        return Math.hypot(
          waypoint.x - character.position.x,
          waypoint.y - character.position.y
        ) <= 0.1;
      }
    );
  }
  function findNewSearchPersonTarget(state2, character) {
    const memory = character.memory.getByType("person-observed").filter((candidate) => !state2.initialObservationIds.includes(candidate.subjectId)).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
    const position = memory?.context?.position;
    if (!memory || !isPosition13(position)) return void 0;
    const personId = memory.context?.identifiedPersonId;
    if (typeof personId === "string") {
      return {
        type: "person",
        personId,
        knowledge: "known",
        position: { ...position },
        distance: Math.hypot(
          position.x - character.position.x,
          position.y - character.position.y
        )
      };
    }
    return {
      type: "person",
      observationId: memory.subjectId,
      knowledge: "observed",
      position: { ...position },
      distance: Math.hypot(
        position.x - character.position.x,
        position.y - character.position.y
      )
    };
  }
  function waitForPerson(character, world2, target) {
    if (target.personId && !world2.characters.some((candidate) => candidate.id === target.personId)) {
      return { status: "failed" };
    }
    const arrived = () => {
      const current = resolveSubjectivePersonTarget(character, world2, target);
      return !!current && isWithinPersonApproachRange(character, current.position, world2);
    };
    if (arrived()) return { status: "completed" };
    return startAction(
      character,
      world2,
      `wait-for-person:${targetLabel(target)}`,
      30,
      15,
      arrived
    );
  }
  function goToPerson(character, world2, target, movement) {
    if (target.personId && !world2.characters.some((candidate) => candidate.id === target.personId)) {
      return { status: "failed" };
    }
    const rememberedDistance = Math.hypot(
      target.position.x - character.position.x,
      target.position.y - character.position.y
    );
    const person = resolveSubjectivePersonTarget(character, world2, target);
    if (rememberedDistance <= CHARACTER_PERSON_APPROACH_RANGE_METRES + 1e-6 && person && isWithinPersonApproachRange(character, person.position, world2)) {
      return { status: "completed" };
    }
    const travelDuration = movement.estimateApproachDuration(
      character,
      target.position,
      CHARACTER_PERSON_APPROACH_RANGE_METRES,
      world2
    );
    if (travelDuration === void 0) return { status: "failed" };
    movement.startWithinRangeOfPosition(
      character,
      target.position,
      CHARACTER_PERSON_APPROACH_RANGE_METRES
    );
    return startAction(
      character,
      world2,
      `go-to-person:${targetLabel(target)}`,
      travelDuration,
      Math.max(0.5, travelDuration * 0.5),
      () => {
        const current = resolveSubjectivePersonTarget(character, world2, target);
        if (!current) return false;
        const reachedRememberedPosition = Math.hypot(
          target.position.x - character.position.x,
          target.position.y - character.position.y
        ) <= CHARACTER_PERSON_APPROACH_RANGE_METRES + 1e-6;
        return reachedRememberedPosition && isWithinPersonApproachRange(character, current.position, world2);
      }
    );
  }
  function goToConversationRange(character, world2, target, movement) {
    if (target.personId && !world2.characters.some((candidate) => candidate.id === target.personId)) {
      return { status: "failed" };
    }
    const rememberedDistance = Math.hypot(
      target.position.x - character.position.x,
      target.position.y - character.position.y
    );
    const person = resolveSubjectivePersonTarget(character, world2, target);
    if (isWithinConversationRange(rememberedDistance) && person && arePositionsWithinConversationRange(character.position, person.position, world2)) {
      return { status: "completed" };
    }
    const travelDuration = movement.estimateApproachDuration(
      character,
      target.position,
      CONVERSATION_RANGE_METRES,
      world2
    );
    if (travelDuration === void 0) return { status: "failed" };
    movement.startWithinRangeOfPosition(
      character,
      target.position,
      CONVERSATION_RANGE_METRES
    );
    return startAction(
      character,
      world2,
      `go-to-conversation-range:${targetLabel(target)}`,
      travelDuration,
      Math.max(0.5, travelDuration * 0.5),
      () => {
        const current = resolveSubjectivePersonTarget(character, world2, target);
        return !!current && arePositionsWithinConversationRange(
          character.position,
          current.position,
          world2
        );
      }
    );
  }
  function isWithinPersonApproachRange(character, personPosition, world2) {
    const distance10 = Math.hypot(
      personPosition.x - character.position.x,
      personPosition.y - character.position.y
    );
    return distance10 <= CHARACTER_PERSON_APPROACH_RANGE_METRES + 1e-6 && arePositionsWithinConversationRange(character.position, personPosition, world2);
  }
  function isPosition13(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function targetLabel(target) {
    return target.personId ?? target.observationId ?? "unknown-person";
  }

  // src/services/ServiceInteractionTarget.ts
  var EXPECTED_PROVIDER_POSITION_TOLERANCE_METRES = 1.25;
  var OBSERVATION_PHYSICAL_MATCH_TOLERANCE_METRES = 0.1;
  var IDENTITY_CHECK_RETRY_MINUTES = 30;
  function resolveServiceInteractionTarget(character, target, world2, social, serviceContext) {
    const providerId = target.subjectId;
    if (!providerId || providerId === character.id) return { status: "not-observed" };
    if (serviceContext && !isCustomerServiceProviderEligible(character, providerId, serviceContext, world2.time)) {
      return { status: "not-observed" };
    }
    if (character.knownPeople.has(providerId)) {
      const observed = character.memory.getByType("person-observed").filter((memory) => memory.lastObservedAt === world2.time).filter((memory) => memory.context?.identifiedPersonId === providerId).filter((memory) => isPosition14(memory.context?.position)).filter((memory) => isWithinConversationRange(distance3(character.position, memory.context.position))).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
      if (!observed) return { status: "not-observed" };
      const observedPosition2 = observed.context.position;
      const provider = world2.characters.find((candidate2) => candidate2.id === providerId);
      if (!provider) return { status: "not-observed" };
      if (distance3(provider.position, observedPosition2) > OBSERVATION_PHYSICAL_MATCH_TOLERANCE_METRES) {
        return { status: "not-observed" };
      }
      if (!isWithinConversationRange(distance3(character.position, provider.position))) {
        return { status: "not-observed" };
      }
      return { status: "ready", provider };
    }
    const observation = character.memory.getByType("person-observed").filter((memory) => memory.lastObservedAt === world2.time).filter((memory) => memory.context?.identifiedPersonId === void 0).filter((memory) => isPosition14(memory.context?.position)).filter((memory) => {
      const position = memory.context.position;
      return distance3(position, target.position) <= EXPECTED_PROVIDER_POSITION_TOLERANCE_METRES && isWithinConversationRange(distance3(character.position, position));
    }).filter((memory) => !hasRecentIdentityCheck(character, providerId, memory.subjectId, world2.time)).sort((first, second) => {
      const firstPosition = first.context.position;
      const secondPosition = second.context.position;
      return distance3(firstPosition, target.position) - distance3(secondPosition, target.position);
    })[0];
    if (!observation) return { status: "not-observed" };
    const observedPosition = observation.context.position;
    const observationTarget = {
      type: "person",
      observationId: observation.subjectId,
      knowledge: "observed",
      position: { ...observedPosition },
      distance: distance3(character.position, observedPosition)
    };
    const candidate = resolveSubjectivePersonTarget(character, world2, observationTarget);
    if (!candidate) return { status: "not-observed" };
    if (!isWithinConversationRange(distance3(character.position, candidate.position))) {
      return { status: "not-observed" };
    }
    social.greet(character, candidate, world2);
    if (character.knownPeople.has(providerId)) {
      return { status: "ready", provider: candidate };
    }
    rememberIdentityCheck(character, providerId, observation.subjectId, world2.time);
    return { status: "identity-checked" };
  }
  function hasRecentIdentityCheck(character, providerId, observationId, time) {
    return character.memory.getByType("person-identity-check").some(
      (memory) => memory.context?.providerId === providerId && memory.context?.observationId === observationId && time - memory.lastObservedAt < IDENTITY_CHECK_RETRY_MINUTES
    );
  }
  function rememberIdentityCheck(character, providerId, observationId, time) {
    character.memory.remember({
      id: `${character.id}:person-identity-check:${providerId}:${observationId}`,
      type: "person-identity-check",
      subjectId: `${providerId}:${observationId}`,
      persistence: IDENTITY_CHECK_RETRY_MINUTES,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 0.75,
      context: { providerId, observationId }
    });
  }
  function isPosition14(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function distance3(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  // src/planning/PurchaseExecution.ts
  var MINUTES_PER_DAY17 = 24 * 60;
  var MORNING_RECONSIDERATION_MINUTE2 = 6 * 60;
  function registerPurchaseHandlers(registry, commerce, social, accessibility, movement) {
    registerIfMissing5(
      registry,
      "buy-food",
      (plan, character, world2) => buyFood(plan, character, world2, social)
    );
    registerIfMissing5(
      registry,
      "serve-purchase-request",
      (plan, character, world2) => servePurchaseRequest(plan, character, world2, commerce, social, accessibility, movement)
    );
  }
  function registerIfMissing5(registry, planId, handler) {
    if (!registry.has(planId)) registry.register(planId, handler);
  }
  function buyFood(plan, character, world2, social) {
    const target = plan.target;
    if (target?.type !== "location" || target.subjectId === void 0) {
      return { status: "failed" };
    }
    const providerId = target.subjectId;
    const serviceContext = foodServiceContext(character, providerId);
    const existingRequestId = plan.executionState?.purchaseRequestId;
    if (typeof existingRequestId === "string") {
      const existingRequest = character.requests.getOutgoingById(existingRequestId, world2.time);
      if (!existingRequest) return { status: "failed" };
      if (existingRequest.status === "completed") {
        return character.physical.getAll().some((possession) => isDirectlyEdibleFood(possession.item)) ? { status: "completed" } : { status: "failed" };
      }
      if (isTerminalFailure(existingRequest)) {
        rememberRefusal(character, providerId, serviceContext, existingRequest, world2.time);
        return { status: "failed" };
      }
      return waitForPurchaseRequest(plan, character, world2, existingRequest.id, providerId, serviceContext);
    }
    const resolved = resolveServiceInteractionTarget(character, target, world2, social, serviceContext);
    if (resolved.status === "identity-checked") return { status: "failed" };
    if (resolved.status === "not-observed") {
      rememberServiceProviderUnavailable(
        character,
        providerId,
        serviceContext,
        world2.time,
        "not-found",
        15
      );
      return { status: "failed" };
    }
    const seller = resolved.provider;
    const request = social.sendRequest(
      character,
      seller,
      "purchase",
      { itemType: "food", quantity: 1, unitPrice: 3 },
      world2,
      45
    );
    if (!request) return { status: "failed" };
    plan.executionState = {
      ...plan.executionState ?? {},
      purchaseRequestId: request.id
    };
    logSimulation(world2, "event", `${character.name} requests food from ${seller.name}`);
    return waitForPurchaseRequest(plan, character, world2, request.id, providerId, serviceContext);
  }
  function waitForPurchaseRequest(plan, buyer, world2, requestId, providerId, serviceContext) {
    const isFinished = () => {
      const request = buyer.requests.getOutgoingById(requestId, world2.time);
      if (!request) {
        plan.failed = true;
        return true;
      }
      if (request.status === "completed") return true;
      if (isTerminalFailure(request)) {
        rememberRefusal(buyer, providerId, serviceContext, request, world2.time);
        plan.failed = true;
        return true;
      }
      return false;
    };
    if (isFinished()) {
      return plan.failed ? { status: "failed" } : { status: "completed" };
    }
    return startAction(
      buyer,
      world2,
      `wait-for-purchase:${requestId}`,
      30,
      15,
      isFinished
    );
  }
  function servePurchaseRequest(plan, seller, world2, commerce, social, accessibility, movement) {
    const requestId = plan.goal?.parameters?.requestId;
    if (typeof requestId !== "string") return { status: "failed" };
    const request = seller.requests.getIncomingById(requestId, world2.time);
    if (!request || isTerminalFailure(request)) return { status: "failed" };
    if (request.status === "completed") return { status: "completed" };
    if (request.type !== "purchase") return { status: "failed" };
    const buyer = world2.characters.find((candidate) => candidate.id === request.fromCharacterId);
    if (!buyer) {
      seller.requests.updateIncomingStatus(requestId, "cancelled");
      return { status: "failed" };
    }
    const requestedItemType = request.parameters?.itemType;
    const requestedItemCategory = request.parameters?.itemCategory;
    const requestedFoodKind = request.parameters?.foodKind;
    const quantity = request.parameters?.quantity;
    const unitPrice = request.parameters?.unitPrice;
    const destinationContainerId = request.parameters?.destinationContainerId;
    const itemType = typeof requestedItemType === "string" && requestedItemType.length > 0 ? requestedItemType : void 0;
    const itemCategory = isItemCategory(requestedItemCategory) ? requestedItemCategory : void 0;
    if (!itemType && !itemCategory || requestedItemCategory !== void 0 && !itemCategory || requestedFoodKind !== void 0 && !isFoodKind(requestedFoodKind) || !Number.isInteger(quantity) || quantity <= 0 || typeof unitPrice !== "number" || destinationContainerId !== void 0 && typeof destinationContainerId !== "string") {
      seller.requests.updateIncomingStatus(requestId, "refused");
      return { status: "failed" };
    }
    const foodKind = isFoodKind(requestedFoodKind) ? requestedFoodKind : void 0;
    const selector2 = {
      ...itemType ? { itemType } : {},
      ...itemCategory ? { itemCategory } : {},
      ...foodKind ? { foodKind } : {}
    };
    const itemLabel = itemType ?? itemCategory;
    const purchaseQuantity = quantity;
    if (typeof destinationContainerId === "string") {
      const destination = buyer.physical.get(destinationContainerId);
      if (!destination?.item.solidContainer || !accessibility.canAccess(buyer, destination)) {
        seller.requests.updateIncomingStatus(requestId, "refused");
        return { status: "failed" };
      }
    }
    const distance10 = Math.hypot(
      buyer.position.x - seller.position.x,
      buyer.position.y - seller.position.y
    );
    let items = seller.physical.getAll().filter((possession) => itemMatchesRequest(possession.item, selector2)).slice(0, purchaseQuantity);
    if (items.length < purchaseQuantity) {
      const sellerContext = foodServiceContext(seller, seller.id);
      const buyerContext = purchaseServiceContext(buyer, seller.id, selector2);
      const toldBuyer = isWithinConversationRange(distance10) && social.respondToRequest(seller, buyer, requestId, "refused", world2);
      if (!toldBuyer) {
        seller.requests.updateIncomingStatus(requestId, "refused");
      }
      if (isBroadFoodSelector(selector2) && items.length === 0) {
        markOwnedServicePointSoldOut(seller, sellerContext, itemLabel, world2);
        if (toldBuyer && buyerContext.placeId) {
          rememberServicePlaceUnavailable(
            buyer,
            buyerContext.placeId,
            world2.time,
            nextMorningRetryAt(world2.time, world2.minuteOfDay)
          );
        }
      }
      logSimulation(
        world2,
        "event",
        `${seller.name} cannot serve request ${requestId}; needs ${purchaseQuantity} ${itemLabel}, has ${items.length}`
      );
      return { status: "failed" };
    }
    if (request.status === "pending") {
      if (!isWithinConversationRange(distance10)) {
        seller.requests.updateIncomingStatus(requestId, "cancelled");
        return { status: "failed" };
      }
      if (!social.respondToRequest(seller, buyer, requestId, "accepted", world2)) {
        return { status: "failed" };
      }
      logSimulation(world2, "event", `${seller.name} accepts ${buyer.name}'s purchase request`);
    }
    items = items.map((item) => seller.physical.get(item.item.id)).filter((item) => item !== void 0);
    if (items.length < purchaseQuantity) return { status: "failed" };
    const inaccessible = items.find((item) => !accessibility.canAccess(seller, item));
    if (inaccessible) {
      const retrieval = retrieveGoods(seller, inaccessible, { ...buyer.position }, world2, accessibility, movement);
      return retrieval.status === "started" ? { status: "started" } : { status: "failed" };
    }
    const result = commerce.purchase(
      {
        buyer,
        seller,
        itemId: itemLabel,
        ...itemCategory ? { itemCategory } : {},
        quantity: purchaseQuantity,
        unitPrice,
        specificItemIds: items.map((item) => item.item.id),
        ...typeof destinationContainerId === "string" ? {
          destination: { type: "container", containerId: destinationContainerId }
        } : {}
      },
      world2
    );
    if (!result.success) {
      const currentDistance = Math.hypot(
        buyer.position.x - seller.position.x,
        buyer.position.y - seller.position.y
      );
      if (isWithinConversationRange(currentDistance)) {
        social.respondToRequest(seller, buyer, requestId, "refused", world2);
      } else {
        seller.requests.updateIncomingStatus(requestId, "cancelled");
      }
      logSimulation(
        world2,
        "event",
        `${seller.name} cannot complete request ${requestId}: ${result.reason ?? "purchase failed"}`
      );
      return { status: "failed" };
    }
    if (isBroadFoodSelector(selector2) && !seller.physical.getAll().some((possession) => itemMatchesRequest(possession.item, selector2))) {
      markOwnedServicePointSoldOut(
        seller,
        foodServiceContext(seller, seller.id),
        itemLabel,
        world2
      );
    }
    if (!social.respondToRequest(seller, buyer, requestId, "completed", world2)) {
      return { status: "failed" };
    }
    logSimulation(world2, "event", `${seller.name} serves ${buyer.name}'s purchase request`);
    return { status: "completed" };
  }
  function itemMatchesRequest(item, selector2) {
    if (!itemMatchesSelector(item, selector2)) return false;
    if (isBroadFoodSelector(selector2)) return isDirectlyEdibleFood(item);
    return true;
  }
  function isBroadFoodSelector(selector2) {
    return selector2.itemType === "food" && selector2.itemCategory === void 0 && selector2.foodKind === void 0;
  }
  function foodServiceContext(character, providerId) {
    const fact = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.context?.service === "food"
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    return fact?.context ?? { service: "food" };
  }
  function purchaseServiceContext(character, providerId, selector2) {
    const expected = {
      service: "food",
      ...selector2.itemType !== void 0 ? { itemType: selector2.itemType } : {},
      ...selector2.itemCategory !== void 0 ? { itemCategory: selector2.itemCategory } : {},
      ...selector2.foodKind !== void 0 ? { foodKind: selector2.foodKind } : {}
    };
    const fact = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, expected)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    return fact?.context ?? expected;
  }
  function markOwnedServicePointSoldOut(seller, context, itemType, world2) {
    const placeId = context.placeId;
    if (!placeId) return;
    const object = world2.getObject(placeId);
    if (!object?.servicePoint || object.ownerId !== seller.id) return;
    object.servicePoint.state = "closed";
    const existing = seller.memory.getByType("service-point-operation").find((memory) => memory.subjectId === placeId);
    seller.memory.remember({
      id: `${seller.id}:service-point-operation:${placeId}`,
      type: "service-point-operation",
      subjectId: placeId,
      persistence: 10080,
      confidence: 1,
      createdAt: existing?.createdAt ?? world2.time,
      lastObservedAt: world2.time,
      importance: 1,
      context: {
        state: "closed",
        soldOutItemType: itemType,
        soldOutAt: world2.time
      }
    });
    logSimulation(world2, "event", `${seller.name} closes service point ${placeId} after selling out of ${itemType}`);
  }
  function nextMorningRetryAt(time, minuteOfDay) {
    const normalized = (Math.floor(minuteOfDay) % MINUTES_PER_DAY17 + MINUTES_PER_DAY17) % MINUTES_PER_DAY17;
    const delta = normalized < MORNING_RECONSIDERATION_MINUTE2 ? MORNING_RECONSIDERATION_MINUTE2 - normalized : MINUTES_PER_DAY17 - normalized + MORNING_RECONSIDERATION_MINUTE2;
    return time + Math.max(1, delta);
  }
  function rememberRefusal(buyer, providerId, context, request, time) {
    if (request.status !== "refused") return;
    rememberServiceProviderUnavailable(buyer, providerId, context, time, "refused", 30);
  }
  function isTerminalFailure(request) {
    return request.status === "refused" || request.status === "cancelled" || request.status === "expired";
  }
  function retrieveGoods(seller, possession, returnPosition, world2, accessibility, movement) {
    if (possession.location.type !== "container" || seller.movementSpeed <= 0) {
      return { status: "failed" };
    }
    const container = world2.getObject(possession.location.containerId);
    if (!container) return { status: "failed" };
    const outboundDuration = movement.estimateTravelDurationBetween(
      seller.position,
      container.position,
      seller.movementSpeed,
      world2
    );
    const returnDuration = movement.estimateTravelDurationBetween(
      container.position,
      returnPosition,
      seller.movementSpeed,
      world2
    );
    if (outboundDuration === void 0 || returnDuration === void 0) {
      return { status: "failed" };
    }
    const expectedDuration = outboundDuration + returnDuration;
    let retrieved = false;
    movement.start(seller, container.position);
    startAction(
      seller,
      world2,
      `retrieve-goods:${possession.item.id}`,
      expectedDuration,
      Math.max(1, expectedDuration * 0.5),
      () => {
        if (!retrieved) {
          const atContainer = Math.hypot(
            seller.position.x - container.position.x,
            seller.position.y - container.position.y
          ) <= 0.1;
          if (!atContainer || !accessibility.canAccess(seller, possession)) {
            return false;
          }
          const leftOccupied = seller.physical.getAll().some(
            (item) => item.location.type === "hand" && item.location.hand === "left"
          );
          const hand = leftOccupied ? "right" : "left";
          seller.physical.move(possession.item.id, { type: "hand", hand });
          retrieved = true;
          logSimulation(
            world2,
            "event",
            `${seller.name} retrieves ${possession.item.id} from ${container.id}`
          );
          movement.start(seller, returnPosition);
        }
        return Math.hypot(
          seller.position.x - returnPosition.x,
          seller.position.y - returnPosition.y
        ) <= 0.1;
      }
    );
    return { status: "started", expectedDuration };
  }

  // src/services/AccommodationExecution.ts
  var MINUTES_PER_DAY18 = 24 * 60;
  function registerAccommodationHandlers(registry, commerce, social) {
    if (registry.has("rent-room")) return;
    registry.register("rent-room", (plan, character, world2) => {
      const target = plan.target;
      if (target?.type !== "location" || !target.subjectId) return { status: "failed" };
      const providerId = target.subjectId;
      const providerFact = character.knowledge.find(
        (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.context?.service === "accommodation" && knowledge.context?.offering === "room-day" && typeof knowledge.context.placeId === "string"
      );
      const placeId = providerFact?.context?.placeId;
      if (!placeId) return { status: "failed" };
      const resolved = resolveServiceInteractionTarget(character, target, world2, social);
      if (resolved.status !== "ready") return { status: "failed" };
      const provider = resolved.provider;
      const room6 = world2.accommodation.getAvailableRentableRooms(placeId, world2.time)[0];
      if (!room6?.rental) return { status: "failed" };
      const bed = world2.objects.find(
        (object) => object.usableResource?.type === "bed" && object.usableResource.roomId === room6.id
      );
      if (!bed) return { status: "failed" };
      const payment = commerce.payForService({
        payer: character,
        payee: provider,
        amount: room6.rental.dailyRate,
        description: `one day accommodation in ${room6.id}`
      }, world2);
      if (!payment.success) return { status: "failed" };
      const rental = world2.accommodation.rentRoom(room6.id, character.id, world2.time, 1);
      if (!rental) return { status: "failed" };
      character.memory.remember({
        id: `${character.id}:accommodation-stay:${room6.id}:${world2.time}`,
        type: "accommodation-stay",
        subjectId: room6.id,
        persistence: MINUTES_PER_DAY18,
        confidence: 1,
        createdAt: world2.time,
        lastObservedAt: world2.time,
        importance: 1,
        context: {
          placeId,
          bedId: bed.id,
          position: { ...bed.position },
          expiresAt: rental.endTime
        }
      });
      character.knowledgeRevision += 1;
      logSimulation(
        world2,
        "event",
        `${character.name} rents ${room6.id} from ${provider.name} for \xA3${rental.pricePaid} until minute ${rental.endTime}`
      );
      return { status: "completed" };
    });
  }

  // src/physical/TransferSystem.ts
  var TransferSystem = class {
    transfer(request) {
      if (!request.from.has(request.item.id)) {
        throw new Error(`Item ${request.item.id} is not held by the source.`);
      }
      const location = request.destination.type === "hand" ? { type: "hand", hand: request.destination.hand } : request.destination.type === "equipped" ? { type: "equipped", slot: request.destination.slot } : { type: "container", containerId: request.destination.containerId };
      const item = request.from.remove(request.item.id);
      request.to.add(item, location);
    }
  };

  // src/services/MaterialProcessingExecution.ts
  var REQUEST_RESPONSE_MINUTES = 15;
  var WAIT_SLICE_MINUTES = 30;
  function registerMaterialProcessingHandlers(registry, commerce, social, movement) {
    registerIfMissing6(
      registry,
      "request-material-processing",
      (plan, character, world2) => requestMaterialProcessing(plan, character, world2, social, movement)
    );
    registerIfMissing6(
      registry,
      "fulfil-material-processing-request",
      (plan, character, world2) => fulfilMaterialProcessingRequest(plan, character, world2, commerce, social)
    );
  }
  function requestMaterialProcessing(plan, customer, world2, social, movement) {
    const requestedId = typeof plan.goal?.parameters?.requestId === "string" ? plan.goal.parameters.requestId : void 0;
    const stateId = typeof plan.executionState?.materialProcessingRequestId === "string" ? plan.executionState.materialProcessingRequestId : void 0;
    const existingRequestId = requestedId ?? stateId;
    if (existingRequestId) {
      return continueCustomerRequest(plan, customer, world2, existingRequestId, movement);
    }
    const goal = customerGoal(plan);
    if (!goal) return { status: "failed" };
    const target = plan.target;
    if (target?.type !== "person" || target.personId !== goal.providerId) {
      return { status: "failed" };
    }
    const provider = resolveSubjectivePersonTarget(customer, world2, target);
    if (!provider || provider.id !== goal.providerId || !arePositionsWithinConversationRange(customer.position, provider.position, world2)) {
      invalidateReachedPersonLocation(customer, target, world2);
      return { status: "failed" };
    }
    const providerFact = customer.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === provider.id && knowledge.polarity === "positive" && knowledge.context?.service === goal.service && knowledge.context?.offering === goal.offering && // Exact input types remain physical request detail for legacy services.
      // Category processing requires matching subjective category knowledge.
      (goal.inputItemCategory === void 0 || knowledge.context?.itemCategory === goal.inputItemCategory)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    const price = providerFact?.context?.terms?.price;
    const expectedDuration = providerFact?.context?.terms?.expectedDuration;
    if (!Number.isInteger(price) || price < 0 || typeof expectedDuration !== "number" || !Number.isFinite(expectedDuration) || expectedDuration <= 0) return { status: "failed" };
    const selector2 = processingSelector(goal);
    const inputs = customer.physical.getAll().filter(
      (possession) => itemMatchesSelector(possession.item, selector2) && possession.location.type !== "container" && world2.ownership.getOwner(possession.item.id) === customer.id
    ).slice(0, goal.inputCount);
    if (inputs.length < goal.inputCount) return { status: "failed" };
    const request = social.sendRequest(
      customer,
      provider,
      MATERIAL_PROCESSING_REQUEST_TYPE,
      {
        service: goal.service,
        offering: goal.offering,
        ...goal.inputItemType !== void 0 ? { inputItemType: goal.inputItemType } : {},
        ...goal.inputItemCategory !== void 0 ? { inputItemCategory: goal.inputItemCategory } : {},
        inputCount: goal.inputCount,
        outputItemType: goal.outputItemType,
        outputCount: goal.outputCount,
        price,
        expectedDuration,
        inputItemIds: inputs.map((possession) => possession.item.id)
      },
      world2,
      45
    );
    if (!request) return { status: "failed" };
    plan.executionState = {
      ...plan.executionState ?? {},
      materialProcessingRequestId: request.id
    };
    const label = goal.inputItemType ?? goal.inputItemCategory;
    logSimulation(world2, "event", `${customer.name} asks ${provider.name} to process ${goal.inputCount} ${label}`);
    return waitForRequestResponse(plan, customer, world2, request.id);
  }
  function continueCustomerRequest(plan, customer, world2, requestId, movement) {
    const request = customer.requests.getOutgoingById(requestId, world2.time);
    if (!request) return { status: "failed" };
    if (request.status === "completed") {
      const itemIds = request.fulfilment?.itemIds ?? (request.fulfilment?.itemId ? [request.fulfilment.itemId] : []);
      return itemIds.length > 0 && itemIds.every((itemId) => customer.physical.has(itemId)) ? { status: "completed" } : { status: "failed" };
    }
    if (isTerminalFailure2(request)) return { status: "failed" };
    if (request.status === "pending") {
      return waitForRequestResponse(plan, customer, world2, requestId);
    }
    const returnPosition = request.fulfilment?.resourcePosition;
    if (returnPosition && distance4(customer.position, returnPosition) > 0.1) {
      const travelDuration = movement.estimateTravelDuration(customer, returnPosition, world2);
      if (travelDuration === void 0) return { status: "failed" };
      movement.start(customer, returnPosition);
      return startAction(
        customer,
        world2,
        `return-for-processing:${requestId}`,
        travelDuration,
        Math.max(0.5, travelDuration * 0.5),
        () => {
          const current = customer.requests.getOutgoingById(requestId, world2.time);
          return !current || current.status === "completed" || isTerminalFailure2(current) || distance4(customer.position, returnPosition) <= 0.1;
        },
        { interruptionPolicy: "interruptible" }
      );
    }
    return startAction(
      customer,
      world2,
      `wait-for-processing:${requestId}`,
      WAIT_SLICE_MINUTES,
      WAIT_SLICE_MINUTES * 2,
      () => {
        const current = customer.requests.getOutgoingById(requestId, world2.time);
        return !current || current.status === "completed" || isTerminalFailure2(current);
      },
      { interruptionPolicy: "interruptible" }
    );
  }
  function waitForRequestResponse(plan, customer, world2, requestId) {
    return startAction(
      customer,
      world2,
      `wait-for-processing-response:${requestId}`,
      REQUEST_RESPONSE_MINUTES,
      REQUEST_RESPONSE_MINUTES * 2,
      () => {
        const current = customer.requests.getOutgoingById(requestId, world2.time);
        if (!current || current.status !== "pending") {
          if (current && isTerminalFailure2(current)) plan.failed = true;
          return true;
        }
        return false;
      },
      { interruptionPolicy: "interruptible" }
    );
  }
  function fulfilMaterialProcessingRequest(plan, provider, world2, commerce, social) {
    const workplace = providerWorkplace(plan);
    if (!workplace) return { status: "failed" };
    const requestId = workplace.requestId;
    const request = provider.requests.getIncomingById(requestId, world2.time);
    if (!request || isTerminalFailure2(request)) return { status: "failed" };
    if (request.status === "completed") return { status: "completed" };
    const customer = world2.characters.find((candidate) => candidate.id === request.fromCharacterId);
    if (!customer) {
      provider.requests.updateIncomingStatus(requestId, "cancelled");
      return { status: "failed" };
    }
    if (request.status === "pending") {
      return acceptProcessingRequest(provider, customer, request, workplace, world2, commerce, social);
    }
    const stage = request.fulfilment?.stage;
    if (stage === "awaiting-processing" || stage === "processing") {
      return processAcceptedMaterial(plan, provider, customer, request, workplace, world2);
    }
    if (stage === "ready-for-return") {
      return returnProcessedMaterial(provider, customer, request, workplace, world2, social);
    }
    return { status: "failed" };
  }
  function acceptProcessingRequest(provider, customer, request, workplace, world2, commerce, social) {
    if (!arePositionsWithinConversationRange(provider.position, customer.position, world2)) {
      return { status: "failed" };
    }
    const requested = materialProcessingRequestParameters(request.parameters);
    if (!requested || !materialProcessingDefinitionMatches(requested, workplace)) {
      social.respondToRequest(provider, customer, request.id, "refused", world2);
      logSimulation(world2, "event", `${provider.name} refuses incompatible processing request ${request.id}`);
      return { status: "completed" };
    }
    const selector2 = processingSelector(requested);
    const inputs = requested.inputItemIds.map((itemId) => customer.physical.get(itemId));
    const invalidInput = inputs.some((possession, index) => {
      const itemId = requested.inputItemIds[index];
      return !possession || !itemMatchesSelector(possession.item, selector2) || world2.ownership.getOwner(itemId) !== customer.id || world2.itemLoans.get(itemId) !== void 0 || provider.physical.has(itemId);
    });
    if (invalidInput) {
      social.respondToRequest(provider, customer, request.id, "refused", world2);
      return { status: "completed" };
    }
    const payment = commerce.payForService({
      payer: customer,
      payee: provider,
      amount: workplace.price,
      description: workplace.offering
    }, world2);
    if (!payment.success) {
      social.respondToRequest(provider, customer, request.id, "refused", world2);
      logSimulation(world2, "event", `${provider.name} cannot accept ${customer.name}'s processing job: ${payment.reason ?? "payment failed"}`);
      return { status: "completed" };
    }
    const transfer2 = new TransferSystem();
    for (const possession of inputs) {
      const item = possession.item;
      transfer2.transfer({
        item,
        from: customer.physical,
        to: provider.physical,
        destination: { type: "equipped", slot: "processing-custody" }
      });
      world2.itemLoans.lend({ itemId: item.id, ownerId: customer.id, borrowerId: provider.id });
    }
    if (!social.respondToRequest(provider, customer, request.id, "accepted", world2)) {
      return { status: "failed" };
    }
    syncFulfilment(request.id, provider, customer, {
      stage: "awaiting-processing",
      resourceId: workplace.returnActionPointId,
      resourcePosition: { ...workplace.returnPosition }
    });
    logSimulation(world2, "event", `${provider.name} accepts ${customer.name}'s ${workplace.offering} job and takes temporary custody of ${requested.inputItemIds.join(", ")}`);
    return { status: "completed" };
  }
  function processAcceptedMaterial(plan, provider, customer, request, workplace, world2) {
    if (distance4(provider.position, workplace.workPosition) > 0.1) return { status: "failed" };
    const actionPoint = world2.getActionPoint(workplace.workActionPointId);
    if (!world2.resourceUsage.claim(workplace.workActionPointId, provider.id, actionPoint?.capacity ?? 1)) {
      return { status: "failed" };
    }
    const requested = materialProcessingRequestParameters(request.parameters);
    if (!requested) return { status: "failed" };
    if (request.fulfilment?.stage === "processing") {
      const readyAt2 = request.fulfilment.expectedAt;
      if (readyAt2 === void 0) return { status: "failed" };
      if (world2.time >= readyAt2) {
        return finishProcessing(plan, provider, customer, request.id, requested, workplace, world2) ? { status: "completed" } : { status: "failed" };
      }
      return processingAction(plan, provider, customer, request.id, requested, workplace, world2, readyAt2);
    }
    const readyAt = world2.time + workplace.expectedDuration;
    syncFulfilment(request.id, provider, customer, {
      ...request.fulfilment ?? { stage: "awaiting-processing" },
      stage: "processing",
      expectedAt: readyAt
    });
    logSimulation(world2, "event", `${provider.name} begins ${workplace.offering} for ${customer.name}`);
    return processingAction(plan, provider, customer, request.id, requested, workplace, world2, readyAt);
  }
  function processingAction(plan, provider, customer, requestId, requested, workplace, world2, readyAt) {
    const remaining = Math.max(1, readyAt - world2.time);
    return startAction(
      provider,
      world2,
      `process-material:${requestId}`,
      remaining,
      Math.max(5, workplace.expectedDuration * 0.25),
      () => {
        if (world2.time < readyAt) return false;
        const succeeded = finishProcessing(plan, provider, customer, requestId, requested, workplace, world2);
        if (!succeeded) plan.failed = true;
        return true;
      }
    );
  }
  function finishProcessing(plan, provider, customer, requestId, requested, workplace, world2) {
    const latest = provider.requests.getIncomingById(requestId, world2.time);
    if (!latest || latest.status !== "accepted") return false;
    const inputItems = [];
    for (const itemId of requested.inputItemIds) {
      const possession = provider.physical.get(itemId);
      const loan = world2.itemLoans.get(itemId);
      if (!possession || loan?.ownerId !== customer.id || loan.borrowerId !== provider.id) return false;
      inputItems.push(possession.item);
    }
    const template = inputItems[0];
    if (!template) return false;
    for (const item of inputItems) {
      provider.physical.remove(item.id);
      world2.itemLoans.complete(item.id);
    }
    const outputIds = [];
    for (let index = 0; index < requested.outputCount; index++) {
      const output = {
        id: `${requestId}-output-${index + 1}`,
        type: requested.outputItemType,
        size: template.size,
        physical: { ...template.physical }
      };
      provider.physical.add(output, { type: "equipped", slot: "processing-custody" });
      world2.ownership.setOwner(output.id, customer.id);
      world2.itemLoans.lend({ itemId: output.id, ownerId: customer.id, borrowerId: provider.id });
      outputIds.push(output.id);
    }
    syncFulfilment(requestId, provider, customer, {
      stage: "ready-for-return",
      resourceId: workplace.returnActionPointId,
      resourcePosition: { ...workplace.returnPosition },
      itemId: outputIds[0],
      itemIds: outputIds
    });
    plan.completed = true;
    logSimulation(world2, "event", `${provider.name} finishes ${workplace.offering}; ${outputIds.join(", ")} still belong to ${customer.name}`);
    return true;
  }
  function returnProcessedMaterial(provider, customer, request, workplace, world2, social) {
    if (distance4(provider.position, workplace.returnPosition) > 0.1) return { status: "failed" };
    if (!arePositionsWithinConversationRange(provider.position, customer.position, world2)) {
      return startAction(
        provider,
        world2,
        `wait-to-return-processing:${request.id}`,
        15,
        15,
        () => {
          const current = provider.requests.getIncomingById(request.id, world2.time);
          return !current || isTerminalFailure2(current) || arePositionsWithinConversationRange(provider.position, customer.position, world2);
        },
        { interruptionPolicy: "interruptible" }
      );
    }
    const outputIds = request.fulfilment?.itemIds ?? (request.fulfilment?.itemId ? [request.fulfilment.itemId] : []);
    if (outputIds.length === 0) return { status: "failed" };
    const transfer2 = new TransferSystem();
    for (const itemId of outputIds) {
      const possession = provider.physical.get(itemId);
      const loan = world2.itemLoans.get(itemId);
      if (!possession || loan?.ownerId !== customer.id || loan.borrowerId !== provider.id) {
        return { status: "failed" };
      }
      transfer2.transfer({
        item: possession.item,
        from: provider.physical,
        to: customer.physical,
        destination: { type: "equipped", slot: "processed-goods" }
      });
      world2.itemLoans.complete(itemId);
    }
    if (!social.respondToRequest(provider, customer, request.id, "completed", world2)) {
      return { status: "failed" };
    }
    logSimulation(world2, "event", `${provider.name} returns ${outputIds.join(", ")} to ${customer.name}`);
    return { status: "completed" };
  }
  function customerGoal(plan) {
    const p = plan.goal?.parameters;
    if (!p) return void 0;
    if (typeof p.service !== "string" || typeof p.offering !== "string") return void 0;
    if (p.inputItemType !== void 0 && (typeof p.inputItemType !== "string" || p.inputItemType.length === 0)) return void 0;
    if (p.inputItemCategory !== void 0 && !isItemCategory(p.inputItemCategory)) return void 0;
    if (p.inputItemType === void 0 && p.inputItemCategory === void 0) return void 0;
    if (!isPositiveInteger5(p.inputCount)) return void 0;
    if (typeof p.outputItemType !== "string" || !isPositiveInteger5(p.outputCount)) return void 0;
    if (typeof p.providerId !== "string") return void 0;
    return {
      service: p.service,
      offering: p.offering,
      ...typeof p.inputItemType === "string" ? { inputItemType: p.inputItemType } : {},
      ...isItemCategory(p.inputItemCategory) ? { inputItemCategory: p.inputItemCategory } : {},
      inputCount: p.inputCount,
      outputItemType: p.outputItemType,
      outputCount: p.outputCount,
      providerId: p.providerId
    };
  }
  function providerWorkplace(plan) {
    const p = plan.goal?.parameters;
    if (!p || typeof p.requestId !== "string") return void 0;
    if (typeof p.service !== "string" || typeof p.offering !== "string") return void 0;
    if (p.inputItemType !== void 0 && (typeof p.inputItemType !== "string" || p.inputItemType.length === 0)) return void 0;
    if (p.inputItemCategory !== void 0 && !isItemCategory(p.inputItemCategory)) return void 0;
    if (p.inputItemType === void 0 && p.inputItemCategory === void 0) return void 0;
    if (!isPositiveInteger5(p.inputCount)) return void 0;
    if (typeof p.outputItemType !== "string" || !isPositiveInteger5(p.outputCount)) return void 0;
    if (!isNonNegativeInteger5(p.price) || !isPositiveNumber6(p.expectedDuration)) return void 0;
    if (typeof p.workActionPointId !== "string" || !isPosition15(p.workPosition)) return void 0;
    if (typeof p.returnActionPointId !== "string" || !isPosition15(p.returnPosition)) return void 0;
    return {
      requestId: p.requestId,
      service: p.service,
      offering: p.offering,
      ...typeof p.inputItemType === "string" ? { inputItemType: p.inputItemType } : {},
      ...isItemCategory(p.inputItemCategory) ? { inputItemCategory: p.inputItemCategory } : {},
      inputCount: p.inputCount,
      outputItemType: p.outputItemType,
      outputCount: p.outputCount,
      price: p.price,
      expectedDuration: p.expectedDuration,
      workActionPointId: p.workActionPointId,
      workPosition: { ...p.workPosition },
      returnActionPointId: p.returnActionPointId,
      returnPosition: { ...p.returnPosition }
    };
  }
  function processingSelector(value) {
    return {
      ...value.inputItemType !== void 0 ? { itemType: value.inputItemType } : {},
      ...value.inputItemCategory !== void 0 ? { itemCategory: value.inputItemCategory } : {}
    };
  }
  function syncFulfilment(requestId, provider, customer, fulfilment) {
    provider.requests.updateIncomingFulfilment(requestId, fulfilment);
    customer.requests.updateOutgoingFulfilment(requestId, fulfilment);
  }
  function invalidateReachedPersonLocation(character, target, world2) {
    if (!target.personId || distance4(character.position, target.position) > CONVERSATION_RANGE_METRES) return;
    character.addKnowledge({
      type: "person-location",
      subjectId: target.personId,
      polarity: "negative",
      position: { ...target.position },
      sourceType: "perception",
      learnedAt: world2.time,
      confidence: 1
    });
    logSimulation(world2, "decision", `${character.name} confirms ${target.personId} is not at the expected location`);
  }
  function isTerminalFailure2(request) {
    return request.status === "refused" || request.status === "cancelled" || request.status === "expired";
  }
  function registerIfMissing6(registry, planId, handler) {
    if (!registry.has(planId)) registry.register(planId, handler);
  }
  function distance4(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }
  function isPosition15(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function isPositiveInteger5(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
  }
  function isNonNegativeInteger5(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  }
  function isPositiveNumber6(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  // src/services/SelfMealPreparationExecution.ts
  var PREPARATION_MINUTES = 10;
  var PREPARED_MEAL_HUNGER_RELIEF2 = 90;
  function registerSelfMealPreparationHandlers(registry, accessibility, movement) {
    if (registry.has("prepare-meal-for-self")) return;
    registry.register(
      "prepare-meal-for-self",
      (_plan, character, world2) => prepareMealForSelf(character, world2, accessibility, movement)
    );
  }
  function prepareMealForSelf(character, world2, accessibility, movement) {
    if (character.physical.getAll().some(
      (possession) => isDirectlyEdibleFood(possession.item)
    )) {
      return { status: "completed" };
    }
    const stock = character.physical.getAll().find((possession) => possession.item.type === "meal-stock");
    if (!stock) return { status: "failed" };
    if (!accessibility.canAccess(character, stock)) {
      if (stock.location.type !== "container") return { status: "failed" };
      const knownPosition = knownStoragePosition(character, stock.location.containerId);
      if (!knownPosition) return { status: "failed" };
      return approachKnownMealStock(
        character,
        stock.item.id,
        knownPosition,
        world2,
        accessibility,
        movement
      );
    }
    const readyAt = world2.time + PREPARATION_MINUTES;
    const stockLocation = cloneLocation(stock.location);
    logSimulation(world2, "event", `${character.name} begins preparing a meal for themselves`);
    return startAction2(
      character,
      world2,
      "prepare-meal-for-self",
      PREPARATION_MINUTES,
      2,
      () => {
        if (world2.time < readyAt) return false;
        const current = character.physical.get(stock.item.id);
        if (!current) return true;
        if (!accessibility.canAccess(character, current)) return false;
        const mealLocation = preparedMealLocation(character, current.location, stockLocation);
        character.physical.remove(stock.item.id);
        character.physical.add({
          id: `${character.id}-self-prepared-meal-${readyAt}`,
          type: "food",
          size: "small",
          physical: { carryHands: 1, useHands: 1 },
          food: {
            kind: "prepared-meal",
            directlyEdible: { hungerRelief: PREPARED_MEAL_HUNGER_RELIEF2 }
          }
        }, mealLocation);
        logSimulation(world2, "event", `${character.name} finishes preparing a meal for themselves`);
        return true;
      }
    );
  }
  function approachKnownMealStock(character, itemId, knownPosition, world2, accessibility, movement) {
    if (character.movementSpeed <= 0) return { status: "failed" };
    const expectedDuration = movement.estimateTravelDuration(character, knownPosition, world2);
    if (expectedDuration === void 0) return { status: "failed" };
    movement.start(character, knownPosition);
    logSimulation(world2, "event", `${character.name} goes to known storage to access meal stock`);
    return startAction2(
      character,
      world2,
      `reach-own-meal-stock:${itemId}`,
      expectedDuration,
      Math.max(1, expectedDuration * 0.5),
      () => {
        const atRememberedPosition = Math.hypot(
          character.position.x - knownPosition.x,
          character.position.y - knownPosition.y
        ) <= 0.1;
        if (!atRememberedPosition) return false;
        const current = character.physical.get(itemId);
        if (!current) return true;
        return accessibility.canAccess(character, current);
      }
    );
  }
  function preparedMealLocation(character, currentLocation, originalLocation) {
    if (currentLocation.type === "hand" || currentLocation.type === "equipped") {
      return cloneLocation(currentLocation);
    }
    const hand = availableHand(character);
    return hand ? { type: "hand", hand } : cloneLocation(originalLocation);
  }
  function knownStoragePosition(character, containerId) {
    const place = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === containerId && knowledge.polarity === "positive" && knowledge.position !== void 0
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    if (place?.position) return { ...place.position };
    const home = character.knowledge.filter(
      (knowledge) => knowledge.type === "home-location" && knowledge.subjectId === containerId && knowledge.polarity === "positive" && knowledge.position !== void 0
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    return home?.position ? { ...home.position } : void 0;
  }
  function availableHand(character) {
    const occupied = character.physical.getAll().filter((possession) => possession.location.type === "hand").map((possession) => possession.location.type === "hand" ? possession.location.hand : void 0);
    if (!occupied.includes("left")) return "left";
    if (!occupied.includes("right")) return "right";
    return void 0;
  }
  function cloneLocation(location) {
    return { ...location };
  }
  function startAction2(character, world2, type, expectedDuration, tolerance, isComplete) {
    character.currentAction = {
      id: `${character.id}-${type}-${world2.time}`,
      type,
      startedAt: world2.time,
      expectedDuration,
      expectedAt: world2.time + expectedDuration,
      tolerance,
      expiresAt: world2.time + expectedDuration + tolerance,
      status: "active",
      interruptionPolicy: "atomic",
      isComplete
    };
    logSimulation(world2, "event", `${character.name} starts ${type}; expected ${expectedDuration}m`);
    return { status: "started" };
  }

  // src/services/ServiceAvailabilityExecution.ts
  function registerServiceAvailabilityHandlers(registry) {
    registry.register("defer-service-provider-visit", (plan, character, world2) => {
      if (!plan.goal) return { status: "failed" };
      const context = serviceContextFromGoal(plan.goal);
      if (!context) return { status: "failed" };
      const retryAt = knownServiceContextRetryAt(
        character,
        context,
        world2.time,
        world2.minuteOfDay
      );
      if (retryAt === void 0 || retryAt <= world2.time) return { status: "failed" };
      const expectedDuration = retryAt - world2.time;
      const actionType = `wait-for-${context.service}-service-retry`;
      character.movementTarget = void 0;
      character.currentAction = {
        id: `${character.id}-${actionType}-${world2.time}`,
        type: actionType,
        startedAt: world2.time,
        expectedDuration,
        expectedAt: retryAt,
        tolerance: 1,
        expiresAt: retryAt + 1,
        status: "active",
        interruptionPolicy: "interruptible",
        completionDisposition: "reconsider-plan",
        completionMessage: `${character.name} decides it is reasonable to look for ${context.service} service again`,
        isComplete: () => {
          const currentRetryAt = knownServiceContextRetryAt(
            character,
            context,
            world2.time,
            world2.minuteOfDay
          );
          return currentRetryAt === void 0 || world2.time >= currentRetryAt;
        }
      };
      logSimulation(
        world2,
        "decision",
        `${character.name} defers ${context.service} service search until it is reasonable to retry`
      );
      logSimulation(
        world2,
        "event",
        `${character.name} waits before trying ${context.service} service again; expected ${expectedDuration}m`
      );
      return { status: "started" };
    });
  }

  // src/services/TradeExecution.ts
  function registerTradeHandlers(registry, commerce, social, movement) {
    registerIfMissing7(
      registry,
      "offer-goods-for-sale",
      (plan, character, world2) => offerGoodsForSale(plan, character, world2, social)
    );
    registerIfMissing7(
      registry,
      "serve-goods-offer",
      (plan, character, world2) => serveGoodsOffer(plan, character, world2, commerce, social, movement)
    );
  }
  function registerIfMissing7(registry, planId, handler) {
    if (!registry.has(planId)) registry.register(planId, handler);
  }
  function offerGoodsForSale(plan, seller, world2, social) {
    const parameters = goodsOfferGoalParameters(plan.goal);
    if (!parameters) return { status: "failed" };
    const requestId = parameters.requestId ?? (typeof plan.executionState?.goodsOfferRequestId === "string" ? plan.executionState.goodsOfferRequestId : void 0);
    if (requestId) return continueGoodsOffer(plan, seller, world2, requestId);
    const target = plan.target;
    if (target?.type !== "location" || !target.subjectId) return { status: "failed" };
    const buyerId = target.subjectId;
    const expectedContext = {
      service: parameters.service,
      offering: parameters.offering,
      // Exact item types remain physical transaction detail for legacy flows.
      // Broad category offers require corresponding subjective provider knowledge.
      ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {}
    };
    const providerFact = seller.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === buyerId && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, expectedContext)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    const serviceContext = {
      ...expectedContext,
      ...providerFact?.context?.placeId ? { placeId: providerFact.context.placeId } : {}
    };
    const resolved = resolveServiceInteractionTarget(seller, target, world2, social, serviceContext);
    if (resolved.status === "identity-checked") return { status: "failed" };
    if (resolved.status === "not-observed") {
      rememberServiceProviderUnavailable(seller, buyerId, serviceContext, world2.time, "not-found", 15);
      return { status: "failed" };
    }
    const buyer = resolved.provider;
    const unitPrice = providerFact?.context?.terms?.price;
    if (!Number.isInteger(unitPrice) || unitPrice < 0) return { status: "failed" };
    const selector2 = itemSelector(parameters.itemType, parameters.itemCategory);
    const goods = seller.physical.getAll().filter((possession) => itemMatchesSelector(possession.item, selector2)).filter((possession) => possession.location.type !== "container").filter((possession) => world2.ownership.getOwner(possession.item.id) === seller.id).slice(0, parameters.quantity);
    if (goods.length < parameters.quantity) return { status: "failed" };
    const request = social.sendRequest(
      seller,
      buyer,
      GOODS_OFFER_REQUEST_TYPE,
      {
        ...parameters.itemType !== void 0 ? { itemType: parameters.itemType } : {},
        ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {},
        quantity: parameters.quantity,
        unitPrice,
        itemIds: goods.map((possession) => possession.item.id)
      },
      world2,
      45
    );
    if (!request) return { status: "failed" };
    plan.executionState = {
      ...plan.executionState ?? {},
      goodsOfferRequestId: request.id
    };
    const label = parameters.itemType ?? parameters.itemCategory;
    logSimulation(
      world2,
      "event",
      `${seller.name} offers ${parameters.quantity} ${label} to ${buyer.name} for \xA3${unitPrice} each`
    );
    return waitForOfferResult(plan, seller, world2, request.id);
  }
  function continueGoodsOffer(plan, seller, world2, requestId) {
    const request = seller.requests.getOutgoingById(requestId, world2.time);
    if (!request) return { status: "failed" };
    if (request.status === "completed") return { status: "completed" };
    if (isTerminalFailure3(request)) return { status: "failed" };
    return waitForOfferResult(plan, seller, world2, requestId);
  }
  function waitForOfferResult(plan, seller, world2, requestId) {
    return startAction(
      seller,
      world2,
      `wait-for-goods-offer:${requestId}`,
      15,
      30,
      () => {
        const request = seller.requests.getOutgoingById(requestId, world2.time);
        if (!request || request.status === "completed" || isTerminalFailure3(request)) {
          if (!request || isTerminalFailure3(request)) plan.failed = true;
          return true;
        }
        return false;
      },
      { interruptionPolicy: "interruptible" }
    );
  }
  function serveGoodsOffer(plan, buyer, world2, commerce, social, movement) {
    const policy = serveGoodsOfferGoalParameters(plan.goal);
    if (!policy) return { status: "failed" };
    const request = buyer.requests.getIncomingById(policy.requestId, world2.time);
    if (!request) return { status: "failed" };
    const purchasedIds = executionItemIds(plan);
    if (request.status === "completed") {
      return purchasedIds.length > 0 ? storePurchasedGoods(buyer, purchasedIds, policy.storageContainerId, policy.storagePosition, world2, movement) : { status: "failed" };
    }
    if (isTerminalFailure3(request)) return { status: "failed" };
    if (request.type !== GOODS_OFFER_REQUEST_TYPE) return { status: "failed" };
    const offer = goodsOfferRequestParameters(request.parameters);
    const seller = world2.characters.find((candidate) => candidate.id === request.fromCharacterId);
    if (!offer || !seller) {
      buyer.requests.updateIncomingStatus(request.id, "cancelled");
      return { status: "failed" };
    }
    const label = offer.itemType ?? offer.itemCategory;
    if (offer.unitPrice > policy.maxUnitPrice) {
      social.respondToRequest(buyer, seller, request.id, "refused", world2);
      logSimulation(world2, "event", `${buyer.name} refuses ${seller.name}'s ${label} offer as too expensive`);
      return { status: "completed" };
    }
    if (request.status === "pending" && !social.respondToRequest(buyer, seller, request.id, "accepted", world2)) {
      return { status: "failed" };
    }
    const result = commerce.purchase({
      buyer,
      seller,
      itemId: label,
      ...offer.itemCategory !== void 0 ? { itemCategory: offer.itemCategory } : {},
      quantity: offer.quantity,
      unitPrice: offer.unitPrice,
      specificItemIds: offer.itemIds
    }, world2);
    if (!result.success) {
      social.respondToRequest(buyer, seller, request.id, "refused", world2);
      logSimulation(world2, "event", `${buyer.name} cannot buy ${seller.name}'s offer: ${result.reason ?? "purchase failed"}`);
      return { status: "completed" };
    }
    plan.executionState = {
      ...plan.executionState ?? {},
      purchasedItemIds: [...offer.itemIds]
    };
    if (!social.respondToRequest(buyer, seller, request.id, "completed", world2)) {
      return { status: "failed" };
    }
    return storePurchasedGoods(
      buyer,
      offer.itemIds,
      policy.storageContainerId,
      policy.storagePosition,
      world2,
      movement
    );
  }
  function storePurchasedGoods(buyer, itemIds, storageContainerId, storagePosition, world2, movement) {
    const container = world2.getContainers().find((candidate) => candidate.id === storageContainerId);
    if (!container || container.ownerId !== void 0 && container.ownerId !== buyer.id) {
      return { status: "failed" };
    }
    const allStored = itemIds.every(
      (itemId) => buyer.physical.get(itemId)?.location.type === "container" && buyer.physical.get(itemId)?.location.type === "container" && buyer.physical.get(itemId).location.containerId === storageContainerId
    );
    if (allStored) return { status: "completed" };
    if (itemIds.some((itemId) => !buyer.physical.has(itemId) || world2.ownership.getOwner(itemId) !== buyer.id)) {
      return { status: "failed" };
    }
    const deposit = () => {
      if (distance5(buyer.position, storagePosition) > 0.1) return false;
      for (const itemId of itemIds) {
        const possession = buyer.physical.get(itemId);
        if (!possession) return false;
        if (possession.location.type !== "container" || possession.location.containerId !== storageContainerId) {
          buyer.physical.move(itemId, { type: "container", containerId: storageContainerId });
        }
      }
      logSimulation(world2, "event", `${buyer.name} stores purchased goods in ${storageContainerId}`);
      return true;
    };
    if (deposit()) return { status: "completed" };
    const travelDuration = movement.estimateTravelDuration(buyer, storagePosition, world2);
    if (travelDuration === void 0) return { status: "failed" };
    movement.start(buyer, storagePosition);
    return startAction(
      buyer,
      world2,
      `store-purchased-goods:${storageContainerId}`,
      travelDuration,
      Math.max(0.5, travelDuration * 0.5),
      deposit
    );
  }
  function itemSelector(itemType, itemCategory) {
    return {
      ...itemType !== void 0 ? { itemType } : {},
      ...itemCategory !== void 0 ? { itemCategory } : {}
    };
  }
  function executionItemIds(plan) {
    const value = plan.executionState?.purchasedItemIds;
    return Array.isArray(value) && value.every((itemId) => typeof itemId === "string") ? [...value] : [];
  }
  function isTerminalFailure3(request) {
    return request.status === "refused" || request.status === "cancelled" || request.status === "expired";
  }
  function distance5(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  // src/activities/ClosingDepartureActivity.ts
  var DEFAULT_CLOSING_DEPARTURE_PRIORITY = 90;
  var ClosingDepartureActivity = class {
    constructor(id, placeId, exitPosition, expiresAt, priority = DEFAULT_CLOSING_DEPARTURE_PRIORITY) {
      this.id = id;
      this.placeId = placeId;
      this.exitPosition = exitPosition;
      this.expiresAt = expiresAt;
      this.priority = priority;
      this.name = "Leave Closing Place";
      this.departureCompleted = false;
    }
    getIntents({ character, time }) {
      if (time >= this.expiresAt || this.departureCompleted) return [];
      if (Math.hypot(
        character.position.x - this.exitPosition.x,
        character.position.y - this.exitPosition.y
      ) <= 0.1) {
        this.departureCompleted = true;
        return [];
      }
      return [{
        id: `${character.id}:activity:${this.id}:leave`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "atLocation",
          parameters: {
            subjectId: `${this.placeId}:outside`,
            position: { ...this.exitPosition }
          }
        },
        priority: this.priority
      }];
    }
  };

  // src/world/DoorExecution.ts
  var DEFAULT_RETRY_MINUTES2 = 5;
  var DOOR_OPERATION_MEMORY_PERSISTENCE = 30 * 24 * 60;
  function registerDoorHandlers(registry) {
    registry.register("set-door-security", (plan, character, world2) => {
      const doorId = plan.goal?.parameters?.doorId;
      const desiredState = plan.goal?.parameters?.desiredState;
      const placeId = plan.goal?.parameters?.placeId;
      const retryMinutes = plan.goal?.parameters?.retryMinutes;
      const reopenAt = plan.goal?.parameters?.reopenAt;
      if (typeof doorId !== "string" || desiredState !== "open" && desiredState !== "barred") {
        return { status: "failed" };
      }
      const door = world2.navigation.getDoor(doorId);
      if (!door) return { status: "failed" };
      if (desiredState === "barred") {
        if (!door.barredFrom) return { status: "failed" };
        const actorCell = world2.navigation.worldToCell(character.position);
        if (actorCell.x !== door.barredFrom.x || actorCell.y !== door.barredFrom.y) {
          return { status: "failed" };
        }
        if (typeof placeId === "string") {
          const visitors = ordinaryVisitorsInside(placeId, character, world2);
          if (visitors.length > 0) {
            const retry = typeof retryMinutes === "number" && retryMinutes > 0 ? retryMinutes : DEFAULT_RETRY_MINUTES2;
            const exitPosition = outsideDoorPosition(doorId, world2);
            if (exitPosition) {
              for (const visitor of visitors) {
                tellVisitorToLeave(
                  visitor,
                  placeId,
                  exitPosition,
                  world2,
                  typeof reopenAt === "number" ? reopenAt : void 0
                );
              }
              logSimulation(world2, "event", `${character.name} announces closing time at ${placeId}`);
            }
            rememberDoorOperation(character, doorId, world2, "deferred", desiredState, world2.time + retry, placeId);
            logSimulation(world2, "decision", `${character.name} defers barring ${doorId}; an ordinary patron is still inside ${placeId}`);
            return { status: "completed" };
          }
        }
        if (!world2.navigation.closeDoor(doorId) || !world2.navigation.barDoor(doorId, character.position)) {
          return { status: "failed" };
        }
        rememberDoorOperation(character, doorId, world2, "barred", desiredState, void 0, typeof placeId === "string" ? placeId : void 0);
        logSimulation(world2, "event", `${character.name} closes and bars ${doorId} from inside`);
        return { status: "completed" };
      }
      if ((door.security === "barred" || door.state === "locked") && !world2.navigation.unbarDoor(doorId, character.position)) {
        return { status: "failed" };
      }
      if (!world2.navigation.openDoor(doorId)) return { status: "failed" };
      rememberDoorOperation(character, doorId, world2, "open", desiredState, void 0, typeof placeId === "string" ? placeId : void 0);
      logSimulation(world2, "event", `${character.name} unbars and opens ${doorId}`);
      return { status: "completed" };
    });
  }
  function ordinaryVisitorsInside(placeId, keeper, world2) {
    const place = world2.getObject(placeId);
    const footprint = place?.physicalFootprint;
    if (!footprint) return [];
    return world2.characters.filter(
      (character) => character.id !== keeper.id && isInsideFootprint(character, footprint, world2) && !mayRemainOvernight(character, placeId, world2)
    );
  }
  function mayRemainOvernight(character, placeId, world2) {
    if (character.homeId === placeId) return true;
    if (world2.accommodation.getRoomsAt(placeId).some((room6) => room6.residentId === character.id)) return true;
    const rental = world2.accommodation.getActiveRental(character.id, world2.time);
    if (!rental) return false;
    return world2.accommodation.getRoom(rental.roomId)?.placeId === placeId;
  }
  function tellVisitorToLeave(visitor, placeId, exitPosition, world2, reopenAt) {
    const activityId = `${placeId}:closing-departure`;
    if (!visitor.activities.some((activity) => activity.id === activityId)) {
      visitor.activities.push(new ClosingDepartureActivity(
        activityId,
        placeId,
        exitPosition,
        reopenAt ?? world2.time + 12 * 60
      ));
    }
    if (reopenAt !== void 0) {
      rememberServicePlaceUnavailable(visitor, placeId, world2.time, reopenAt);
    }
  }
  function outsideDoorPosition(doorId, world2) {
    const door = world2.navigation.getDoor(doorId);
    if (!door?.barredFrom) return void 0;
    const edge = world2.navigation.getBarrierEdges().find(
      (candidate) => candidate.barrier.type === "door" && candidate.barrier.doorId === doorId
    );
    if (!edge) return void 0;
    const firstIsInside = edge.first.x === door.barredFrom.x && edge.first.y === door.barredFrom.y;
    const outsideCell = firstIsInside ? edge.second : edge.first;
    return world2.navigation.cellCentre(outsideCell);
  }
  function isInsideFootprint(character, footprint, world2) {
    const cell = world2.navigation.worldToCell(character.position);
    return cell.x >= footprint.origin.x && cell.x < footprint.origin.x + footprint.width && cell.y >= footprint.origin.y && cell.y < footprint.origin.y + footprint.height;
  }
  function rememberDoorOperation(character, doorId, world2, state2, desiredState, retryAfter, placeId) {
    character.memory.remember({
      id: `${character.id}-door-operation-${doorId}`,
      type: "door-operation",
      subjectId: doorId,
      persistence: DOOR_OPERATION_MEMORY_PERSISTENCE,
      confidence: 1,
      createdAt: world2.time,
      lastObservedAt: world2.time,
      importance: 0.8,
      context: {
        state: state2,
        desiredState,
        ...retryAfter !== void 0 ? { retryAfter } : {},
        ...placeId ? { placeId } : {}
      }
    });
  }

  // src/planning/WorkplaceExecution.ts
  function registerWorkplaceHandlers(registry, accessibility, movement) {
    if (!registry.has("set-service-point-state")) {
      registry.register("set-service-point-state", setServicePointState);
    }
    if (accessibility && movement && !registry.has("produce-workplace-stock")) {
      registry.register(
        "produce-workplace-stock",
        (plan, character, world2) => produceWorkplaceStock(plan, character, world2, accessibility)
      );
    }
    if (accessibility && movement && !registry.has("refill-workplace-liquid-reserve")) {
      registry.register(
        "refill-workplace-liquid-reserve",
        (plan, character, world2) => refillWorkplaceLiquidReserve(plan, character, world2, accessibility, movement)
      );
    }
    if (accessibility && !registry.has("refill-personal-water-reserve")) {
      registry.register(
        "refill-personal-water-reserve",
        (plan, character, world2) => refillPersonalWaterReserve(plan, character, world2)
      );
    }
  }
  function setServicePointState(plan, character, world2) {
    const parameters = servicePointStateGoalParameters(plan.goal);
    if (!parameters) return { status: "failed" };
    const object = world2.getObject(parameters.servicePointId);
    if (!object?.servicePoint) return { status: "failed" };
    const actionPointId = serviceProviderActionPointId(parameters.servicePointId);
    if (!ensureDockedOccupancy(character, world2, actionPointId)) {
      return { status: "failed" };
    }
    object.servicePoint.state = parameters.desiredState;
    const existing = character.memory.getByType("service-point-operation").find((memory) => memory.subjectId === parameters.servicePointId);
    character.memory.remember({
      id: `${character.id}:service-point-operation:${parameters.servicePointId}`,
      type: "service-point-operation",
      subjectId: parameters.servicePointId,
      persistence: 10080,
      confidence: 1,
      createdAt: existing?.createdAt ?? world2.time,
      lastObservedAt: world2.time,
      importance: 1,
      context: { state: parameters.desiredState }
    });
    logSimulation(
      world2,
      "event",
      `${character.name} ${parameters.desiredState === "open" ? "opens" : "closes"} service point ${parameters.servicePointId}`
    );
    return { status: "completed" };
  }
  function produceWorkplaceStock(plan, character, world2, accessibility) {
    const p = workplaceProductionGoalParameters(plan.goal);
    if (!p) return { status: "failed" };
    if (plan.executionState?.batchCompleted === true) return { status: "completed" };
    if (!ensureDockedOccupancy(character, world2, p.workActionPointId)) return { status: "failed" };
    const liquidResource = world2.roomResources.getLiquid(p.liquidRoomResourceId);
    const currentRoom = world2.getRoomAtPosition(character.position);
    if (!liquidResource || currentRoom?.id !== liquidResource.roomId || liquidResource.liquidType !== p.liquidType) return { status: "failed" };
    rememberRoomLiquidResource(character, liquidResource, world2.time);
    if (p.finishBy !== void 0 && world2.time + p.durationMinutes > p.finishBy) {
      return { status: "failed" };
    }
    const currentOutput = countOutput(character, p.outputContainerId, p.outputType, p.outputFoodKind);
    if (currentOutput >= p.targetStock) return { status: "completed" };
    const inputs = character.physical.getAll().filter((possession) => possession.item.type === p.inputItemType).filter((possession) => accessibility.canAccess(character, possession)).slice(0, p.inputCountPerBatch);
    if (inputs.length < p.inputCountPerBatch) return { status: "failed" };
    if (liquidResource.amount < p.liquidAmountPerBatch) return { status: "failed" };
    for (const input of inputs) character.physical.remove(input.item.id);
    if (world2.roomResources.consumeLiquid(p.liquidRoomResourceId, p.liquidAmountPerBatch) < p.liquidAmountPerBatch) {
      return { status: "failed" };
    }
    rememberRoomLiquidResource(character, liquidResource, world2.time);
    plan.executionState = { ...plan.executionState ?? {}, batchStarted: true };
    const readyAt = world2.time + p.durationMinutes;
    logSimulation(world2, "event", `${character.name} begins ${p.recipeId}`);
    return startAction(character, world2, `produce:${p.recipeId}`, p.durationMinutes, 2, () => {
      if (world2.time < readyAt) return false;
      const stockNow = countOutput(character, p.outputContainerId, p.outputType, p.outputFoodKind);
      const toMake = Math.max(0, Math.min(p.outputCountPerBatch, p.targetStock - stockNow));
      for (let index = 0; index < toMake; index++) {
        const id = `${character.id}-${p.recipeId}-${readyAt}-${index + 1}`;
        character.physical.add({
          id,
          type: p.outputType,
          size: "small",
          physical: { carryHands: 1, useHands: 1 },
          ...p.outputFoodKind !== void 0 ? {
            food: {
              kind: p.outputFoodKind,
              ...p.outputStomachVolume !== void 0 ? {
                stomachVolume: p.outputStomachVolume
              } : {},
              ...p.outputHungerRelief !== void 0 ? {
                directlyEdible: { hungerRelief: p.outputHungerRelief }
              } : {}
            }
          } : {}
        }, { type: "container", containerId: p.outputContainerId });
        world2.ownership.setOwner(id, character.id);
      }
      plan.executionState = { ...plan.executionState ?? {}, batchCompleted: true };
      logSimulation(world2, "event", `${character.name} finishes ${p.recipeId} and stores ${toMake} ${p.outputType}`);
      return true;
    });
  }
  function refillWorkplaceLiquidReserve(plan, character, world2, accessibility, movement) {
    const p = workplaceLiquidReserveGoalParameters(plan.goal);
    if (!p) return { status: "failed" };
    const bucket = character.physical.get(p.bucketItemId);
    if (!bucket?.item.liquidContainer) return { status: "failed" };
    const inReserveRoom = world2.getRoomAtPosition(character.position)?.id === p.roomId;
    const bucketAmount = getLiquidAmount(bucket.item, p.liquidType);
    if (inReserveRoom) {
      const reserve = world2.roomResources.getLiquid(p.reserveId);
      if (!reserve || reserve.roomId !== p.roomId || reserve.liquidType !== p.liquidType) {
        return { status: "failed" };
      }
      rememberRoomLiquidResource(character, reserve, world2.time);
      if (reserve.amount >= p.targetAmount) {
        restoreBucketHome(plan, character, p.bucketItemId);
        return { status: "completed" };
      }
      if (bucketAmount > 0) {
        const needed = Math.max(0, p.targetAmount - reserve.amount);
        const added = world2.roomResources.addLiquid(p.reserveId, Math.min(needed, bucketAmount));
        if (added <= 0) return { status: "failed" };
        consumeLiquid(bucket.item, p.liquidType, added);
        rememberRoomLiquidResource(character, reserve, world2.time);
        restoreBucketHome(plan, character, p.bucketItemId);
        logSimulation(
          world2,
          "event",
          `${character.name} adds ${added} ${p.liquidType} to room reserve ${reserve.id} (${reserve.amount}/${p.targetAmount})`
        );
        return { status: "completed" };
      }
    } else if (bucketAmount > 0) {
      return travelForWorkplaceWater(character, world2, movement, p.roomPosition, "return-workplace-water");
    }
    if (bucket.location.type === "container") {
      if (!inReserveRoom || !accessibility.canAccess(character, bucket)) {
        return travelForWorkplaceWater(character, world2, movement, p.roomPosition, "collect-workplace-bucket");
      }
      const hand = availableHand2(character);
      if (!hand) return { status: "failed" };
      plan.executionState = {
        ...plan.executionState ?? {},
        bucketHomeContainerId: bucket.location.containerId
      };
      character.physical.move(bucket.item.id, { type: "hand", hand });
      logSimulation(world2, "event", `${character.name} takes ${bucket.item.id} to fetch ${p.liquidType}`);
    }
    if (distance6(character.position, p.sourcePosition) > 0.1) {
      return travelForWorkplaceWater(character, world2, movement, p.sourcePosition, "fetch-workplace-water");
    }
    const source = world2.getObject(p.sourceId);
    if (!source || source.kind !== "fountain" || distance6(source.position, character.position) > 0.1) {
      return { status: "failed" };
    }
    const filled = fillLiquidContainer(bucket.item, p.liquidType);
    if (filled <= 0) return { status: "failed" };
    logSimulation(world2, "event", `${character.name} fills ${bucket.item.id} from ${source.id}`);
    return { status: "started" };
  }
  function refillPersonalWaterReserve(plan, character, world2) {
    const p = personalWaterReserveGoalParameters(plan.goal);
    if (!p) return { status: "failed" };
    if (world2.getRoomAtPosition(character.position)?.id !== p.roomId) return { status: "failed" };
    const source = world2.roomResources.getLiquid(p.sourceRoomResourceId);
    const portable = character.physical.get(p.portableItemId);
    if (!source || source.roomId !== p.roomId || source.liquidType !== "water" || !portable?.item.liquidContainer || !isCarriedPossession(portable)) return { status: "failed" };
    rememberRoomLiquidResource(character, source, world2.time);
    if (source.ownerId !== void 0 && source.ownerId !== character.id) return { status: "failed" };
    const current = getLiquidAmount(portable.item, "water");
    if (current >= p.targetAmount) return { status: "completed" };
    const container = portable.item.liquidContainer;
    if (container.contents && container.contents.type !== "water") return { status: "failed" };
    const capacityRemaining = Math.max(0, container.capacity - current);
    const desired = Math.min(p.targetAmount - current, capacityRemaining, source.amount);
    if (desired <= 0) return { status: "failed" };
    const consumed = world2.roomResources.consumeLiquid(source.id, desired);
    if (consumed <= 0) return { status: "failed" };
    container.contents = { type: "water", amount: current + consumed };
    rememberRoomLiquidResource(character, source, world2.time);
    logSimulation(
      world2,
      "event",
      `${character.name} fills ${portable.item.id} from room reserve ${source.id} (${getLiquidAmount(portable.item, "water")}/${container.capacity})`
    );
    return { status: "completed" };
  }
  function ensureDockedOccupancy(character, world2, actionPointId) {
    const point = world2.getActionPoint(actionPointId);
    if (!point || !isAtActionPoint(character.position, point)) return false;
    return world2.resourceUsage.claim(point.id, character.id, point.capacity);
  }
  function restoreBucketHome(plan, character, bucketItemId) {
    const home = plan.executionState?.bucketHomeContainerId;
    const bucket = character.physical.get(bucketItemId);
    if (typeof home !== "string" || !bucket || bucket.location.type === "container") return;
    character.physical.move(bucketItemId, { type: "container", containerId: home });
  }
  function travelForWorkplaceWater(character, world2, movement, target, actionType) {
    const expectedDuration = movement.estimateTravelDuration(character, target, world2);
    if (expectedDuration === void 0) return { status: "failed" };
    if (expectedDuration <= 0.1) return { status: "started" };
    movement.start(character, target);
    return startAction(
      character,
      world2,
      actionType,
      expectedDuration,
      Math.max(1, expectedDuration * 0.5),
      () => distance6(character.position, target) <= 0.1,
      {
        interruptionPolicy: "interruptible",
        onInterrupt: () => {
          character.movementTarget = void 0;
        }
      }
    );
  }
  function countOutput(character, containerId, outputType, foodKind) {
    return character.physical.getAll().filter(
      (possession) => possession.location.type === "container" && possession.location.containerId === containerId && possession.item.type === outputType && (foodKind === void 0 || possession.item.food?.kind === foodKind)
    ).length;
  }
  function availableHand2(character) {
    const used = character.physical.getAll().filter((possession) => possession.location.type === "hand").map((possession) => possession.location.type === "hand" ? possession.location.hand : void 0);
    if (!used.includes("left")) return "left";
    if (!used.includes("right")) return "right";
    return void 0;
  }
  function distance6(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  // src/planning/StagedWorkplaceExecution.ts
  function registerStagedWorkplaceHandlers(registry, accessibility) {
    if (!registry.has("manage-staged-workplace-production")) {
      registry.register(
        "manage-staged-workplace-production",
        (plan, character, world2) => manageStagedProduction(plan, character, world2, accessibility)
      );
    }
  }
  function manageStagedProduction(plan, character, world2, accessibility) {
    const p = stagedWorkplaceProductionGoalParameters(plan.goal);
    if (!p) return { status: "failed" };
    if (p.operation === "wait") {
      return waitForStage(character, world2, p);
    }
    if (!ensureDockedOccupancy2(character, world2, p.workActionPointId)) {
      return { status: "failed" };
    }
    if (world2.time + p.stageActiveMinutes > p.finishBy) return { status: "failed" };
    if (p.operation === "start") {
      return startBatch(plan, character, world2, accessibility, p);
    }
    return advanceBatch(plan, character, world2, p);
  }
  function waitForStage(character, world2, p) {
    if (!p.jobItemId || p.readyAt === void 0) return { status: "failed" };
    const possession = character.physical.get(p.jobItemId);
    const state2 = possession?.item.productionWorkInProgress;
    if (!state2 || state2.recipeId !== p.recipeId || state2.stageIndex !== p.stageIndex) return { status: "failed" };
    if (world2.time >= state2.readyAt) return { status: "completed" };
    const expected = Math.max(0.1, state2.readyAt - world2.time);
    return startAction(
      character,
      world2,
      `wait-production:${p.jobItemId}:${p.stageId}`,
      expected,
      1,
      () => world2.time >= state2.readyAt,
      { interruptionPolicy: "interruptible" }
    );
  }
  function startBatch(plan, character, world2, accessibility, p) {
    if (plan.executionState?.stagedBatchItemId) {
      const existing = character.physical.get(String(plan.executionState.stagedBatchItemId));
      return existing ? performStage(character, world2, p, existing.item) : { status: "failed" };
    }
    const currentOutput = countOutput2(character, p);
    const workInProgress = character.physical.getAll().filter(
      (possession) => possession.item.productionWorkInProgress?.recipeId === p.recipeId && possession.location.type === "container" && possession.location.containerId === p.outputContainerId
    );
    if (currentOutput + workInProgress.length * p.outputCountPerBatch >= p.targetStock) {
      return { status: "completed" };
    }
    const liquidResource = world2.roomResources.getLiquid(p.liquidRoomResourceId);
    const currentRoom = world2.getRoomAtPosition(character.position);
    if (!liquidResource || currentRoom?.id !== liquidResource.roomId || liquidResource.liquidType !== p.liquidType) return { status: "failed" };
    rememberRoomLiquidResource(character, liquidResource, world2.time);
    const inputs = selectInputs(
      character,
      accessibility,
      {
        ...p.inputItemType !== void 0 ? { itemType: p.inputItemType } : {},
        ...p.inputItemCategory !== void 0 ? { itemCategory: p.inputItemCategory } : {},
        ...p.inputFoodKind !== void 0 ? { foodKind: p.inputFoodKind } : {}
      },
      p.inputCountPerBatch
    );
    if (inputs.length < p.inputCountPerBatch) return { status: "failed" };
    const excludedInputIds = new Set(inputs.map((input) => input.item.id));
    const secondaryInputs = p.secondaryInputCountPerBatch !== void 0 ? selectInputs(
      character,
      accessibility,
      {
        ...p.secondaryInputItemType !== void 0 ? { itemType: p.secondaryInputItemType } : {},
        ...p.secondaryInputItemCategory !== void 0 ? { itemCategory: p.secondaryInputItemCategory } : {},
        ...p.secondaryInputFoodKind !== void 0 ? { foodKind: p.secondaryInputFoodKind } : {}
      },
      p.secondaryInputCountPerBatch,
      excludedInputIds
    ) : [];
    if (p.secondaryInputCountPerBatch !== void 0 && secondaryInputs.length < p.secondaryInputCountPerBatch) return { status: "failed" };
    if (liquidResource.amount < p.liquidAmountPerBatch) return { status: "failed" };
    for (const input of [...inputs, ...secondaryInputs]) character.physical.remove(input.item.id);
    if (world2.roomResources.consumeLiquid(p.liquidRoomResourceId, p.liquidAmountPerBatch) < p.liquidAmountPerBatch) {
      return { status: "failed" };
    }
    rememberRoomLiquidResource(character, liquidResource, world2.time);
    const itemId = nextBatchItemId(character, p.recipeId, world2.time);
    const batch = {
      id: itemId,
      type: "work-in-progress",
      size: "medium",
      physical: { carryHands: 2, useHands: 2 },
      productionWorkInProgress: {
        recipeId: p.recipeId,
        batchId: itemId,
        stageIndex: 0,
        readyAt: world2.time,
        startedAt: world2.time
      }
    };
    character.physical.add(batch, { type: "container", containerId: p.outputContainerId });
    world2.ownership.setOwner(itemId, character.id);
    plan.executionState = { ...plan.executionState ?? {}, stagedBatchItemId: itemId };
    logSimulation(world2, "event", `${character.name} starts a ${p.recipeId} batch`);
    return performStage(character, world2, p, batch);
  }
  function advanceBatch(_plan, character, world2, p) {
    if (!p.jobItemId) return { status: "failed" };
    const possession = character.physical.get(p.jobItemId);
    const batch = possession?.item;
    const state2 = batch?.productionWorkInProgress;
    if (!batch || !state2 || state2.recipeId !== p.recipeId || state2.stageIndex !== p.stageIndex || world2.time < state2.readyAt) return { status: "failed" };
    return performStage(character, world2, p, batch);
  }
  function performStage(character, world2, p, batch) {
    const state2 = batch.productionWorkInProgress;
    if (!state2 || state2.stageIndex !== p.stageIndex) return { status: "failed" };
    const stage = p.stages[p.stageIndex];
    if (!stage || stage.id !== p.stageId) return { status: "failed" };
    const readyAt = world2.time + stage.activeMinutes;
    return startAction(
      character,
      world2,
      `production:${p.recipeId}:${batch.id}:${stage.id}`,
      stage.activeMinutes,
      2,
      () => {
        if (world2.time < readyAt) return false;
        const current = character.physical.get(batch.id)?.item.productionWorkInProgress;
        if (!current) return true;
        const nextStageIndex = p.stageIndex + 1;
        if (nextStageIndex < p.stages.length) {
          current.stageIndex = nextStageIndex;
          current.readyAt = world2.time + stage.passiveMinutesAfter;
          logSimulation(
            world2,
            "debug",
            `${character.name} completes ${stage.id} for ${p.recipeId}; next stage ready at ${current.readyAt}`
          );
          return true;
        }
        character.physical.remove(batch.id);
        const stockNow = countOutput2(character, p);
        const toMake = Math.max(0, Math.min(p.outputCountPerBatch, p.targetStock - stockNow));
        for (let index = 0; index < toMake; index++) {
          const id = `${character.id}-${p.recipeId}-${world2.time}-${index + 1}`;
          character.physical.add({
            id,
            type: p.outputType,
            size: "small",
            physical: { carryHands: 1, useHands: 1 },
            ...p.outputFoodKind !== void 0 ? {
              food: {
                kind: p.outputFoodKind,
                ...p.outputDishId !== void 0 ? { dishId: p.outputDishId } : {},
                ...p.outputStomachVolume !== void 0 ? {
                  stomachVolume: p.outputStomachVolume
                } : {},
                ...p.outputHungerRelief !== void 0 ? {
                  directlyEdible: {
                    hungerRelief: p.outputHungerRelief,
                    ...p.outputHydrationRelief !== void 0 ? {
                      hydrationRelief: p.outputHydrationRelief
                    } : {}
                  }
                } : {},
                ...p.outputShelfLifeMinutes !== void 0 ? {
                  spoilage: {
                    ageMinutes: 0,
                    shelfLifeMinutes: p.outputShelfLifeMinutes
                  }
                } : {}
              }
            } : {}
          }, { type: "container", containerId: p.outputContainerId });
          world2.ownership.setOwner(id, character.id);
        }
        logSimulation(
          world2,
          "event",
          `${character.name} finishes ${p.recipeId} and stores ${toMake} ${p.outputType}`
        );
        return true;
      }
    );
  }
  function selectInputs(character, accessibility, selector2, count, excludedIds = /* @__PURE__ */ new Set()) {
    return character.physical.getAll().filter((possession) => !excludedIds.has(possession.item.id)).filter((possession) => itemMatchesSelector(possession.item, selector2)).filter((possession) => accessibility.canAccess(character, possession)).slice(0, count);
  }
  function ensureDockedOccupancy2(character, world2, actionPointId) {
    const point = world2.getActionPoint(actionPointId);
    if (!point || !isAtActionPoint(character.position, point)) return false;
    return world2.resourceUsage.claim(point.id, character.id, point.capacity);
  }
  function countOutput2(character, p) {
    return character.physical.getAll().filter(
      (possession) => possession.location.type === "container" && possession.location.containerId === p.outputContainerId && possession.item.type === p.outputType && (p.outputFoodKind === void 0 || possession.item.food?.kind === p.outputFoodKind) && (p.outputDishId === void 0 || possession.item.food?.dishId === p.outputDishId)
    ).length;
  }
  function nextBatchItemId(character, recipeId, time) {
    let sequence = 1;
    let id = `${character.id}-${recipeId}-wip-${time}-${sequence}`;
    while (character.physical.has(id)) {
      sequence += 1;
      id = `${character.id}-${recipeId}-wip-${time}-${sequence}`;
    }
    return id;
  }

  // src/planning/WorkplaceProcurementExecution.ts
  function registerWorkplaceProcurementHandlers(registry, social, movement) {
    if (!registry.has("take-workplace-carrier")) {
      registry.register("take-workplace-carrier", takeWorkplaceCarrier);
    }
    if (!registry.has("buy-workplace-stock")) {
      registry.register(
        "buy-workplace-stock",
        (plan, character, world2) => buyWorkplaceStock(plan, character, world2, social, movement)
      );
    }
  }
  function takeWorkplaceCarrier(plan, character, world2) {
    const p = workplaceCarrierGoalParameters(plan.goal);
    if (!p) return { status: "failed" };
    const carrier = character.physical.get(p.carrierItemId);
    if (!carrier?.item.solidContainer || carrier.item.physical.carryHands !== 1) {
      return { status: "failed" };
    }
    if (carrier.location.type === "hand" || carrier.location.type === "equipped") {
      return { status: "completed" };
    }
    if (carrier.location.type !== "container" || carrier.location.containerId !== p.carrierHomeContainerId || distance7(character.position, p.storagePosition) > 0.1) return { status: "failed" };
    const hand = availableHand3(character);
    if (!hand) return { status: "failed" };
    character.physical.move(carrier.item.id, { type: "hand", hand });
    logSimulation(world2, "event", `${character.name} takes ${carrier.item.id} from workplace storage`);
    return { status: "completed" };
  }
  function buyWorkplaceStock(plan, buyer, world2, social, movement) {
    const parameters = workplaceProcurementGoalParameters(plan.goal);
    if (!parameters) return { status: "failed" };
    const carrier = buyer.physical.get(parameters.carrierItemId);
    if (!carrier?.item.solidContainer) return { status: "failed" };
    if (plan.executionState?.purchaseStored === true) return { status: "completed" };
    if (countStoredStock(buyer, parameters) >= parameters.targetStock) {
      return returnCarrierHome(buyer, parameters, world2, movement, "completed");
    }
    if (carrier.location.type !== "hand" && carrier.location.type !== "equipped") {
      return { status: "failed" };
    }
    const target = plan.target;
    if (target?.type !== "location" || !target.subjectId) return { status: "failed" };
    const providerId = target.subjectId;
    const context = procurementServiceContext(parameters);
    const existingRequestId = typeof plan.executionState?.purchaseRequestId === "string" ? plan.executionState.purchaseRequestId : void 0;
    if (existingRequestId) {
      const request2 = buyer.requests.getOutgoingById(existingRequestId, world2.time);
      if (!request2) {
        return returnCarrierHome(buyer, parameters, world2, movement, "failed");
      }
      if (request2.status === "completed") {
        const priorIds = executionStringArray(plan, "priorMatchingItemIds");
        const purchasedIds = buyer.physical.getAll().filter((possession) => itemMatchesSelector(possession.item, parameters)).filter(
          (possession) => possession.location.type === "container" && possession.location.containerId === parameters.carrierItemId
        ).map((possession) => possession.item.id).filter((itemId) => !priorIds.includes(itemId)).filter((itemId) => world2.ownership.getOwner(itemId) === buyer.id).slice(0, parameters.quantity);
        if (purchasedIds.length < parameters.quantity) {
          return returnCarrierHome(buyer, parameters, world2, movement, "failed");
        }
        return storePurchasedGoods2(plan, buyer, purchasedIds, parameters, world2, movement);
      }
      if (isTerminalFailure4(request2.status)) {
        if (request2.status === "refused") {
          rememberServiceProviderUnavailable(buyer, providerId, context, world2.time, "refused", 30);
        }
        return returnCarrierHome(buyer, parameters, world2, movement, "failed");
      }
      return waitForPurchase(plan, buyer, world2, existingRequestId, providerId, context);
    }
    const resolved = resolveServiceInteractionTarget(buyer, target, world2, social, context);
    if (resolved.status === "identity-checked") return { status: "failed" };
    if (resolved.status === "not-observed") {
      rememberServiceProviderUnavailable(buyer, providerId, context, world2.time, "not-found", 15);
      return returnCarrierHome(buyer, parameters, world2, movement, "failed");
    }
    const seller = resolved.provider;
    const providerFact = buyer.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, context)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    const unitPrice = providerFact?.context?.terms?.price;
    if (!Number.isInteger(unitPrice) || unitPrice < 0 || unitPrice > parameters.maxUnitPrice) {
      return returnCarrierHome(buyer, parameters, world2, movement, "failed");
    }
    const priorMatchingItemIds = buyer.physical.getAll().filter((possession) => itemMatchesSelector(possession.item, parameters)).map((possession) => possession.item.id);
    const request = social.sendRequest(
      buyer,
      seller,
      "purchase",
      {
        ...parameters.itemType !== void 0 ? { itemType: parameters.itemType } : {},
        ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {},
        ...parameters.foodKind !== void 0 ? { foodKind: parameters.foodKind } : {},
        quantity: parameters.quantity,
        unitPrice,
        destinationContainerId: parameters.carrierItemId
      },
      world2,
      45
    );
    if (!request) return returnCarrierHome(buyer, parameters, world2, movement, "failed");
    plan.executionState = {
      ...plan.executionState ?? {},
      purchaseRequestId: request.id,
      priorMatchingItemIds
    };
    logSimulation(
      world2,
      "event",
      `${buyer.name} requests ${parameters.quantity} ${describeGoods(parameters)} from ${seller.name} for workplace stock`
    );
    return waitForPurchase(plan, buyer, world2, request.id, providerId, context);
  }
  function waitForPurchase(plan, buyer, world2, requestId, providerId, context) {
    const isFinished = () => {
      const request = buyer.requests.getOutgoingById(requestId, world2.time);
      if (!request) return true;
      if (request.status === "completed") return true;
      if (isTerminalFailure4(request.status)) {
        if (request.status === "refused") {
          rememberServiceProviderUnavailable(buyer, providerId, context, world2.time, "refused", 30);
        }
        return true;
      }
      return false;
    };
    if (isFinished()) return { status: "completed" };
    return startAction(
      buyer,
      world2,
      `wait-for-workplace-purchase:${requestId}`,
      30,
      15,
      isFinished,
      { interruptionPolicy: "interruptible" }
    );
  }
  function storePurchasedGoods2(plan, buyer, itemIds, parameters, world2, movement) {
    const container = world2.getContainers().find((candidate) => candidate.id === parameters.storageContainerId);
    if (!container || container.ownerId !== void 0 && container.ownerId !== buyer.id) {
      return { status: "failed" };
    }
    const deposit = () => {
      if (distance7(buyer.position, parameters.storagePosition) > 0.1) return false;
      for (const itemId of itemIds) {
        const possession = buyer.physical.get(itemId);
        if (!possession || world2.ownership.getOwner(itemId) !== buyer.id || possession.location.type !== "container" || possession.location.containerId !== parameters.carrierItemId) return false;
        buyer.physical.move(itemId, { type: "container", containerId: parameters.storageContainerId });
      }
      const carrier = buyer.physical.get(parameters.carrierItemId);
      if (!carrier) return false;
      if (carrier.location.type !== "container" || carrier.location.containerId !== parameters.carrierHomeContainerId) {
        buyer.physical.move(parameters.carrierItemId, {
          type: "container",
          containerId: parameters.carrierHomeContainerId
        });
      }
      plan.executionState = { ...plan.executionState ?? {}, purchaseStored: true };
      logSimulation(
        world2,
        "event",
        `${buyer.name} unloads ${itemIds.length} workplace goods and returns ${parameters.carrierItemId} to storage`
      );
      return true;
    };
    if (deposit()) return { status: "completed" };
    const travelDuration = movement.estimateTravelDuration(buyer, parameters.storagePosition, world2);
    if (travelDuration === void 0) return { status: "failed" };
    movement.start(buyer, parameters.storagePosition);
    return startAction(
      buyer,
      world2,
      `store-workplace-goods:${parameters.storageContainerId}`,
      travelDuration,
      Math.max(0.5, travelDuration * 0.5),
      deposit
    );
  }
  function returnCarrierHome(buyer, parameters, world2, movement, finalStatus) {
    const carrier = buyer.physical.get(parameters.carrierItemId);
    if (!carrier) return { status: "failed" };
    const putAway = () => {
      if (distance7(buyer.position, parameters.storagePosition) > 0.1) return false;
      if (carrier.location.type !== "container" || carrier.location.containerId !== parameters.carrierHomeContainerId) {
        buyer.physical.move(carrier.item.id, {
          type: "container",
          containerId: parameters.carrierHomeContainerId
        });
        logSimulation(world2, "event", `${buyer.name} returns ${carrier.item.id} to workplace storage`);
      }
      return true;
    };
    if (putAway()) return { status: finalStatus };
    const travelDuration = movement.estimateTravelDuration(buyer, parameters.storagePosition, world2);
    if (travelDuration === void 0) return { status: "failed" };
    movement.start(buyer, parameters.storagePosition);
    return startAction(
      buyer,
      world2,
      `return-workplace-carrier:${parameters.carrierItemId}`,
      travelDuration,
      Math.max(0.5, travelDuration * 0.5),
      putAway
    );
  }
  function procurementServiceContext(parameters) {
    return {
      service: parameters.service,
      ...parameters.offering !== void 0 ? { offering: parameters.offering } : {},
      ...parameters.itemType !== void 0 ? { itemType: parameters.itemType } : {},
      ...parameters.itemCategory !== void 0 ? { itemCategory: parameters.itemCategory } : {},
      ...parameters.foodKind !== void 0 ? { foodKind: parameters.foodKind } : {}
    };
  }
  function countStoredStock(buyer, parameters) {
    return buyer.physical.getAll().filter(
      (possession) => possession.location.type === "container" && possession.location.containerId === parameters.storageContainerId && itemMatchesSelector(possession.item, parameters)
    ).length;
  }
  function executionStringArray(plan, key) {
    const value = plan.executionState?.[key];
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : [];
  }
  function describeGoods(parameters) {
    if (parameters.itemCategory !== void 0) return parameters.itemCategory;
    if (parameters.foodKind !== void 0) return `${parameters.foodKind} ${parameters.itemType ?? "food"}`;
    return parameters.itemType ?? "goods";
  }
  function isTerminalFailure4(status) {
    return status === "refused" || status === "cancelled" || status === "expired";
  }
  function availableHand3(character) {
    const used = character.physical.getAll().filter((possession) => possession.location.type === "hand").map((possession) => possession.location.type === "hand" ? possession.location.hand : void 0);
    if (!used.includes("left")) return "left";
    if (!used.includes("right")) return "right";
    return void 0;
  }
  function distance7(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  // src/agriculture/HarvestMaterialisation.ts
  var HARVESTED_GOODS_SLOT = "harvested-goods";
  var HARVESTED_VEGETABLE_HUNGER_RELIEF = 20;
  function materialiseHarvestedCrop(character, world2, harvest) {
    const categoryProbe = { type: harvest.itemType };
    const grain = itemMatchesCategory(categoryProbe, "grain");
    const vegetable = itemMatchesCategory(categoryProbe, "vegetable");
    if (!grain && !vegetable) return [];
    const quantity = Math.max(0, Math.round(harvest.quantity));
    const itemIds = [];
    for (let index = 0; index < quantity; index++) {
      const item = grain ? {
        id: harvestItemId(character.id, world2.time, harvest, index),
        type: harvest.itemType,
        size: "medium",
        physical: { carryHands: 2, useHands: 2 }
      } : {
        id: harvestItemId(character.id, world2.time, harvest, index),
        type: harvest.itemType,
        size: "small",
        physical: { carryHands: 1, useHands: 1 },
        food: {
          kind: "vegetable",
          directlyEdible: { hungerRelief: HARVESTED_VEGETABLE_HUNGER_RELIEF }
        }
      };
      character.physical.add(item, { type: "equipped", slot: HARVESTED_GOODS_SLOT });
      world2.ownership.setOwner(item.id, character.id);
      itemIds.push(item.id);
    }
    return itemIds;
  }
  function harvestItemId(characterId, completedAt, harvest, index) {
    return `${characterId}-harvest-${harvest.fieldId}-${harvest.x}-${harvest.y}-${completedAt}-${index + 1}`;
  }

  // src/planning/AgricultureExecution.ts
  function registerAgricultureHandlers(registry) {
    if (!registry.has("perform-agricultural-work")) {
      registry.register(
        "perform-agricultural-work",
        (plan, character, world2) => performAgriculturalWork(plan, character, world2)
      );
    }
  }
  function performAgriculturalWork(plan, character, world2) {
    const parameters = agriculturalWorkGoalParameters(plan.goal);
    if (!parameters) return { status: "failed" };
    const activity = character.activities.find((candidate) => candidate.id === parameters.activityId);
    if (!(activity instanceof FieldFarmingActivity)) return { status: "failed" };
    const request = workRequest(parameters);
    if (!activity.expectsWork(request, world2.time, character.position)) {
      return { status: "completed" };
    }
    return startAgriculturalWork(character, world2, request, {
      onHarvest: (harvest) => {
        materialiseHarvestedCrop(character, world2, harvest);
      },
      onComplete: (completedRequest, completedAt) => {
        activity.recordCompletedWork(completedRequest, completedAt);
      }
    });
  }
  function workRequest(parameters) {
    if (!parameters) throw new Error("Agricultural work parameters are required.");
    if (parameters.workType === "sow") {
      if (!parameters.crop) throw new Error("Sowing requires a crop.");
      return {
        type: "sow",
        x: parameters.x,
        y: parameters.y,
        crop: parameters.crop
      };
    }
    return {
      type: parameters.workType,
      x: parameters.x,
      y: parameters.y
    };
  }

  // src/activities/HookcrestHuntingActivity.ts
  var MINUTES_PER_DAY19 = 24 * 60;
  var HookcrestHuntingActivity = class {
    constructor(options) {
      this.options = options;
      this.name = "Hunt Hookcrests";
      if (options.habitats.length === 0) throw new Error("Hookcrest hunting requires a known habitat.");
      if (options.gameCarrierSlots.length === 0 || new Set(options.gameCarrierSlots).size !== options.gameCarrierSlots.length) {
        throw new Error("Hookcrest hunting requires distinct game carrier slots.");
      }
      if (!Number.isInteger(options.meatYield) || options.meatYield <= 0) {
        throw new Error("Hookcrest meat yield must be a positive integer.");
      }
      if (!Number.isInteger(options.targetMeatStock) || options.targetMeatStock <= 0) {
        throw new Error("Hookcrest target meat stock must be a positive integer.");
      }
      this.id = options.id;
      this.habitats = options.habitats.map((habitat) => ({
        ...habitat,
        position: { ...habitat.position }
      }));
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY19;
      const carriedGame = character.physical.getAll().filter(
        (possession) => possession.location.type === "equipped" && this.options.gameCarrierSlots.includes(possession.location.slot) && (possession.item.type === "hookcrest-carcass" || possession.item.type === "dressed-hookcrest-carcass")
      );
      const rawCarcasses = carriedGame.filter((possession) => possession.item.type === "hookcrest-carcass");
      const dressedCarcasses = carriedGame.filter((possession) => possession.item.type === "dressed-hookcrest-carcass");
      const availableCarrierSlot = this.availableCarrierSlot(character);
      const habitat = isActive4(minuteOfDay, this.options.activeFrom, this.options.activeUntil) && availableCarrierSlot ? nearestAvailableHabitat(this.habitats, time, character.position) : void 0;
      if (habitat) {
        return [{
          id: `${character.id}:activity:${this.id}:hunt:${habitat.id}`,
          source: { type: "activity", id: this.id },
          goal: {
            type: "huntHookcrest",
            parameters: {
              activityId: this.id,
              habitatId: habitat.id,
              speciesId: habitat.speciesId,
              position: { ...habitat.position },
              bowItemId: this.options.bowItemId,
              carrierSlot: availableCarrierSlot
            }
          },
          priority: this.options.priority ?? 46
        }];
      }
      const rawCarcass = rawCarcasses[0];
      if (rawCarcass && rawCarcass.location.type === "equipped") {
        return [{
          id: `${character.id}:activity:${this.id}:dress:${rawCarcass.item.id}`,
          source: { type: "activity", id: this.id },
          goal: {
            type: "dressHookcrest",
            parameters: {
              activityId: this.id,
              carcassItemId: rawCarcass.item.id,
              carrierSlot: rawCarcass.location.slot,
              facilityId: this.options.preparationFacilityId,
              actionPointId: this.options.preparationActionPointId,
              position: { ...this.options.preparationPosition }
            }
          },
          priority: (this.options.priority ?? 46) + 6
        }];
      }
      const meatStock = character.physical.getContents(this.options.outputContainerId).filter((possession) => possession.item.food?.kind === "meat").length;
      const dressedCarcass = dressedCarcasses[0];
      if (dressedCarcass && meatStock < this.options.targetMeatStock) {
        return [{
          id: `${character.id}:activity:${this.id}:butcher:${dressedCarcass.item.id}`,
          source: { type: "activity", id: this.id },
          goal: {
            type: "butcherHookcrest",
            parameters: {
              activityId: this.id,
              carcassItemId: dressedCarcass.item.id,
              facilityId: this.options.preparationFacilityId,
              actionPointId: this.options.preparationActionPointId,
              position: { ...this.options.preparationPosition },
              outputContainerId: this.options.outputContainerId,
              yieldCount: this.options.meatYield
            }
          },
          priority: (this.options.priority ?? 46) + 5
        }];
      }
      const expeditionHasStarted = this.habitats.some((candidate) => candidate.retryAt !== void 0);
      if (expeditionHasStarted && distance8(character.position, this.options.homePosition) > 2) {
        return [{
          id: `${character.id}:activity:${this.id}:return-home`,
          source: { type: "activity", id: this.id },
          goal: {
            type: "atLocation",
            parameters: {
              subjectId: this.options.homeSubjectId,
              position: { ...this.options.homePosition }
            }
          },
          priority: this.options.priority ?? 46
        }];
      }
      return [];
    }
    expectsHunt(habitatId, carrierSlot, time, character) {
      return this.availableCarrierSlot(character) === carrierSlot && nearestAvailableHabitat(this.habitats, time, character.position)?.id === habitatId;
    }
    recordAttempt(habitatId, retryAt) {
      const habitat = this.habitats.find((candidate) => candidate.id === habitatId);
      if (habitat) habitat.retryAt = retryAt;
    }
    getKnownHabitats() {
      return this.habitats.map((habitat) => ({ ...habitat, position: { ...habitat.position } }));
    }
    availableCarrierSlot(character) {
      const occupied = new Set(character.physical.getAll().filter((possession) => possession.location.type === "equipped").map((possession) => possession.location.type === "equipped" ? possession.location.slot : ""));
      return this.options.gameCarrierSlots.find((slot) => !occupied.has(slot));
    }
  };
  function nearestAvailableHabitat(habitats, time, position) {
    return habitats.filter((habitat) => (habitat.retryAt ?? 0) <= time).sort((first, second) => distance8(first.position, position) - distance8(second.position, position))[0];
  }
  function distance8(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }
  function isActive4(minuteOfDay, start2, end) {
    if (start2 === end) return true;
    if (start2 < end) return minuteOfDay >= start2 && minuteOfDay < end;
    return minuteOfDay >= start2 || minuteOfDay < end;
  }

  // src/physical/HandUseRules.ts
  var HandUseRules = class {
    constructor(possession) {
      this.possession = possession;
    }
    hold(item, hand) {
      if (!this.possession.has(item.id)) {
        throw new Error(`Item ${item.id} is not possessed.`);
      }
      if (this.occupied(hand)) {
        throw new Error(`${hand} hand is already occupied.`);
      }
      const other = hand === "left" ? "right" : "left";
      if (item.physical.carryHands === 2 && this.occupied(other)) {
        throw new Error(`Item ${item.id} requires both hands.`);
      }
      this.possession.move(item.id, { type: "hand", hand });
    }
    occupied(hand) {
      return this.possession.getAll().some((entry) => {
        if (entry.location.type !== "hand") return false;
        if (entry.location.hand === hand) return true;
        return entry.item.physical.carryHands === 2;
      });
    }
    canUse(item) {
      const possession = this.possession.get(item.id);
      if (!possession) return false;
      const required = item.physical.useHands;
      if (possession.location.type === "hand") {
        if (required === 1) return true;
        const other = possession.location.hand === "left" ? "right" : "left";
        return !this.occupied(other);
      }
      const freeHands = ["left", "right"].filter(
        (hand) => !this.occupied(hand)
      ).length;
      return freeHands >= required;
    }
  };

  // src/planning/HuntingExecution.ts
  var HUNT_DURATION_MINUTES = 20;
  var DRESS_DURATION_MINUTES = 10;
  var BUTCHER_DURATION_MINUTES = 15;
  var ACTION_TOLERANCE_MINUTES = 2;
  var HUNTING_RANGE_METRES = 1.5;
  function registerHuntingHandlers(registry) {
    if (!registry.has("hunt-hookcrest")) {
      registry.register("hunt-hookcrest", huntHookcrest);
    }
    if (!registry.has("butcher-hookcrest")) {
      registry.register("butcher-hookcrest", butcherHookcrest);
    }
    if (!registry.has("dress-hookcrest")) {
      registry.register("dress-hookcrest", dressHookcrest);
    }
  }
  function huntHookcrest(plan, character, world2) {
    const parameters = huntHookcrestGoalParameters(plan.goal);
    if (!parameters) return { status: "failed" };
    const activity = character.activities.find((candidate) => candidate.id === parameters.activityId);
    if (!(activity instanceof HookcrestHuntingActivity)) return { status: "failed" };
    if (!activity.expectsHunt(parameters.habitatId, parameters.carrierSlot, world2.time, character)) {
      return { status: "completed" };
    }
    const habitat = world2.hunting.getHabitat(parameters.habitatId, world2.time);
    if (!habitat || habitat.speciesId !== parameters.speciesId || distance9(habitat.position, parameters.position) > 0.01 || distance9(character.position, habitat.position) > HUNTING_RANGE_METRES) return { status: "failed" };
    const bow = character.physical.get(parameters.bowItemId)?.item;
    if (!bow || bow.type !== "hunting-bow" || !new HandUseRules(character.physical).canUse(bow)) {
      return { status: "failed" };
    }
    let elapsed = 0;
    let completed = false;
    return startAction(
      character,
      world2,
      "hunt-hookcrest",
      HUNT_DURATION_MINUTES,
      ACTION_TOLERANCE_MINUTES,
      () => completed,
      {
        interruptionPolicy: "interruptible",
        onTick: (minutes) => {
          if (completed) return;
          const currentBow = character.physical.get(parameters.bowItemId)?.item;
          if (!currentBow || !new HandUseRules(character.physical).canUse(currentBow) || distance9(character.position, habitat.position) > HUNTING_RANGE_METRES) return;
          elapsed += minutes;
          if (elapsed < HUNT_DURATION_MINUTES) return;
          const result = world2.hunting.attempt(parameters.habitatId, world2.time, world2.chance);
          activity.recordAttempt(parameters.habitatId, result.retryAt);
          if (result.status === "caught") {
            const carcassId = `${character.id}-hookcrest-carcass-${world2.time}`;
            character.physical.add({
              id: carcassId,
              type: "hookcrest-carcass",
              size: "medium",
              physical: { carryHands: 1, useHands: 1 }
            }, { type: "equipped", slot: parameters.carrierSlot });
            world2.ownership.setOwner(carcassId, character.id);
            logChance(world2, character, result.chance.probability, result.chance.roll, "caught");
          } else if (result.status === "escaped") {
            logChance(world2, character, result.chance.probability, result.chance.roll, "escaped");
          } else {
            logSimulation(world2, "decision", `${character.name} finds no available Hookcrest at ${parameters.habitatId}`);
          }
          completed = true;
        }
      }
    );
  }
  function dressHookcrest(plan, character, world2) {
    const parameters = dressHookcrestGoalParameters(plan.goal);
    if (!parameters) return { status: "failed" };
    const activity = character.activities.find((candidate) => candidate.id === parameters.activityId);
    if (!(activity instanceof HookcrestHuntingActivity)) return { status: "failed" };
    const carcass = character.physical.get(parameters.carcassItemId);
    const facility = world2.getObject(parameters.facilityId);
    const actionPoint = world2.getActionPoint(parameters.actionPointId);
    if (carcass?.item.type !== "hookcrest-carcass" || carcass.location.type !== "equipped" || carcass.location.slot !== parameters.carrierSlot || facility?.facility?.type !== "butchering-table" || !actionPoint || !isAtActionPoint(character.position, actionPoint)) return { status: "failed" };
    let elapsed = 0;
    let completed = false;
    return startAction(
      character,
      world2,
      "dress-hookcrest",
      DRESS_DURATION_MINUTES,
      ACTION_TOLERANCE_MINUTES,
      () => completed,
      {
        interruptionPolicy: "interruptible",
        onTick: (minutes) => {
          if (completed || !isAtActionPoint(character.position, actionPoint)) return;
          elapsed += minutes;
          if (elapsed < DRESS_DURATION_MINUTES) return;
          const latest = character.physical.get(parameters.carcassItemId);
          if (latest?.item.type !== "hookcrest-carcass" || latest.location.type !== "equipped" || latest.location.slot !== parameters.carrierSlot) return;
          character.physical.remove(parameters.carcassItemId);
          const dressedId = `${character.id}-dressed-hookcrest-${world2.time}`;
          character.physical.add({
            id: dressedId,
            type: "dressed-hookcrest-carcass",
            size: "medium",
            physical: { carryHands: 1, useHands: 1 }
          }, { type: "equipped", slot: parameters.carrierSlot });
          world2.ownership.setOwner(dressedId, character.id);
          logSimulation(
            world2,
            "event",
            `${character.name} plucks and dresses a Hookcrest carcass`,
            { actorIds: [character.id], entityIds: [parameters.facilityId], type: "hunting" }
          );
          completed = true;
        }
      }
    );
  }
  function butcherHookcrest(plan, character, world2) {
    const parameters = butcherHookcrestGoalParameters(plan.goal);
    if (!parameters) return { status: "failed" };
    const activity = character.activities.find((candidate) => candidate.id === parameters.activityId);
    if (!(activity instanceof HookcrestHuntingActivity)) return { status: "failed" };
    const carcass = character.physical.get(parameters.carcassItemId);
    const facility = world2.getObject(parameters.facilityId);
    const actionPoint = world2.getActionPoint(parameters.actionPointId);
    if (carcass?.item.type !== "dressed-hookcrest-carcass" || facility?.facility?.type !== "butchering-table" || facility.containerId !== parameters.outputContainerId || !actionPoint || !isAtActionPoint(character.position, actionPoint)) return { status: "failed" };
    let elapsed = 0;
    let completed = false;
    return startAction(
      character,
      world2,
      "butcher-hookcrest",
      BUTCHER_DURATION_MINUTES,
      ACTION_TOLERANCE_MINUTES,
      () => completed,
      {
        interruptionPolicy: "interruptible",
        onTick: (minutes) => {
          if (completed || !isAtActionPoint(character.position, actionPoint)) return;
          elapsed += minutes;
          if (elapsed < BUTCHER_DURATION_MINUTES) return;
          if (!character.physical.has(parameters.carcassItemId)) return;
          character.physical.remove(parameters.carcassItemId);
          for (let index = 1; index <= parameters.yieldCount; index++) {
            const id = `${character.id}-hookcrest-meat-${world2.time}-${index}`;
            character.physical.add({
              id,
              type: "food",
              size: "small",
              physical: { carryHands: 1, useHands: 1 },
              food: { kind: "meat", stomachVolume: 20 }
            }, { type: "container", containerId: parameters.outputContainerId });
            world2.ownership.setOwner(id, character.id);
          }
          logSimulation(
            world2,
            "event",
            `${character.name} butchers a Hookcrest into ${parameters.yieldCount} portions of raw meat`,
            { actorIds: [character.id], entityIds: [parameters.facilityId], type: "hunting" }
          );
          completed = true;
        }
      }
    );
  }
  function logChance(world2, character, probability, roll, outcome) {
    logSimulation(
      world2,
      "event",
      `${character.name} hunts a Hookcrest: ${outcome}; chance ${(probability * 100).toFixed(0)}%, roll ${roll.toFixed(3)}`,
      { actorIds: [character.id], type: "chance" }
    );
  }
  function distance9(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  // src/planning/FoodPreservationExecution.ts
  function registerFoodPreservationHandlers(registry, accessibility) {
    if (!registry.has("preserve-surplus-food")) {
      registry.register(
        "preserve-surplus-food",
        (plan, character, world2) => preserveSurplusFood(plan, character, world2, accessibility)
      );
    }
  }
  function preserveSurplusFood(plan, character, world2, accessibility) {
    const p = surplusFoodPreservationGoalParameters(plan.goal);
    if (!p) return { status: "failed" };
    if (plan.executionState?.preservationCompleted === true) return { status: "completed" };
    if (!ensureDockedOccupancy3(character, world2, p.workActionPointId)) return { status: "failed" };
    if (world2.time + p.durationMinutes > p.finishBy) return { status: "failed" };
    const candidates = availableInput(character, accessibility, p);
    if (candidates.length <= p.reserveInputStock) return { status: "completed" };
    const input = candidates[0];
    character.physical.remove(input.item.id);
    const readyAt = world2.time + p.durationMinutes;
    logSimulation(world2, "event", `${character.name} begins ${p.recipeId}`);
    return startAction(character, world2, `preserve:${p.recipeId}:${input.item.id}`, p.durationMinutes, 2, () => {
      if (world2.time < readyAt) return false;
      const outputId = `${character.id}-${p.recipeId}-${world2.time}-${input.item.id}`;
      character.physical.add({
        id: outputId,
        type: p.outputType,
        size: "small",
        physical: { carryHands: 1, useHands: 1 },
        food: {
          kind: p.outputFoodKind,
          ...p.outputStomachVolume !== void 0 ? {
            stomachVolume: p.outputStomachVolume
          } : {},
          ...p.outputHungerRelief !== void 0 ? {
            directlyEdible: { hungerRelief: p.outputHungerRelief }
          } : {}
        }
      }, { type: "container", containerId: p.storageContainerId });
      world2.ownership.setOwner(outputId, character.id);
      plan.executionState = { ...plan.executionState ?? {}, preservationCompleted: true };
      logSimulation(world2, "event", `${character.name} finishes ${p.recipeId} and stores ${p.outputFoodKind}`);
      return true;
    });
  }
  function availableInput(character, accessibility, p) {
    return character.physical.getAll().filter(
      (possession) => possession.location.type === "container" && possession.location.containerId === p.storageContainerId && itemMatchesSelector(possession.item, {
        ...p.inputItemType !== void 0 ? { itemType: p.inputItemType } : {},
        ...p.inputItemCategory !== void 0 ? { itemCategory: p.inputItemCategory } : {},
        ...p.inputFoodKind !== void 0 ? { foodKind: p.inputFoodKind } : {}
      })
    ).filter((possession) => accessibility.canAccess(character, possession));
  }
  function ensureDockedOccupancy3(character, world2, actionPointId) {
    const point = world2.getActionPoint(actionPointId);
    if (!point || !isAtActionPoint(character.position, point)) return false;
    return world2.resourceUsage.claim(point.id, character.id, point.capacity);
  }

  // src/planning/PlanExecutor.ts
  var PlanExecutor = class {
    constructor(commerce, social, accessibility, movement, executionRegistry = new PlanExecutionRegistry()) {
      this.commerce = commerce;
      this.social = social;
      this.accessibility = accessibility;
      this.movement = movement;
      this.executionRegistry = executionRegistry;
      registerBasicNeedsHandlers(this.executionRegistry);
      registerLocationHandlers(this.executionRegistry, this.movement);
      registerPersonMovementHandlers(this.executionRegistry, this.movement);
      registerKnowledgeInteractionHandlers(this.executionRegistry, this.social);
      registerPurchaseHandlers(
        this.executionRegistry,
        this.commerce,
        this.social,
        this.accessibility,
        this.movement
      );
      registerAccommodationHandlers(this.executionRegistry, this.commerce, this.social);
      registerMaterialProcessingHandlers(
        this.executionRegistry,
        this.commerce,
        this.social,
        this.movement
      );
      registerTradeHandlers(
        this.executionRegistry,
        this.commerce,
        this.social,
        this.movement
      );
      registerSelfMealPreparationHandlers(
        this.executionRegistry,
        this.accessibility,
        this.movement
      );
      registerServiceAvailabilityHandlers(this.executionRegistry);
      registerDoorHandlers(this.executionRegistry);
      registerWorkplaceHandlers(this.executionRegistry, this.accessibility, this.movement);
      registerStagedWorkplaceHandlers(this.executionRegistry, this.accessibility);
      registerWorkplaceProcurementHandlers(this.executionRegistry, this.social, this.movement);
      registerFoodPreservationHandlers(this.executionRegistry, this.accessibility);
      registerAgricultureHandlers(this.executionRegistry);
      registerHuntingHandlers(this.executionRegistry);
    }
    execute(plan, character, world2) {
      if (plan.satisfied || plan.completed || plan.failed || character.currentAction) return;
      if (plan.prerequisites.some((prerequisite) => prerequisite.failed)) {
        plan.failed = true;
        return;
      }
      const nextPrerequisite = plan.prerequisites.find(
        (prerequisite) => !prerequisite.satisfied && !prerequisite.completed
      );
      if (nextPrerequisite) {
        this.execute(nextPrerequisite, character, world2);
        if (!plan.target && !plan.definition?.resolveTarget && nextPrerequisite.target) {
          plan.target = nextPrerequisite.target;
        }
        if (nextPrerequisite.failed) plan.failed = true;
        return;
      }
      const result = this.executePlan(plan, character, world2);
      if (result.status === "completed") plan.completed = true;
      if (result.status === "failed") plan.failed = true;
    }
    executePlan(plan, character, world2) {
      const registeredResult = this.executionRegistry.execute(plan, character, world2);
      if (registeredResult) return registeredResult;
      logSimulation(
        world2,
        "decision",
        `${character.name} cannot execute unimplemented plan ${plan.definition?.id ?? "unknown"}`
      );
      return { status: "failed" };
    }
  };

  // src/commerce/CommerceSystem.ts
  var CommerceSystem = class {
    constructor(events) {
      this.events = events;
      this.transfer = new TransferSystem();
    }
    purchase(request, world2) {
      const { buyer, seller } = request;
      if (!arePositionsWithinConversationRange(buyer.position, seller.position, world2)) {
        return { success: false, totalPrice: 0, reason: "Buyer and seller are too far apart or physically separated to exchange goods." };
      }
      if (request.quantity <= 0) {
        return { success: false, totalPrice: 0, reason: "Quantity must be greater than zero." };
      }
      if (request.unitPrice < 0) {
        return { success: false, totalPrice: 0, reason: "Unit price cannot be negative." };
      }
      const totalPrice = request.quantity * request.unitPrice;
      if (!Number.isInteger(totalPrice)) {
        return { success: false, totalPrice, reason: "Price must be a whole-number currency value." };
      }
      if (buyer.money < totalPrice) {
        return { success: false, totalPrice, reason: "Buyer cannot afford the purchase." };
      }
      const goods = this.selectGoods(request);
      if (goods.length < request.quantity) {
        return {
          success: false,
          totalPrice,
          reason: `Seller does not physically possess enough ${request.itemId}.`
        };
      }
      const unownedGood = goods.find((good) => {
        const owner = world2.ownership.getOwner(good.id);
        return owner !== void 0 && owner !== seller.id;
      });
      if (unownedGood) {
        return {
          success: false,
          totalPrice,
          reason: `${seller.name} does not own ${unownedGood.id} and cannot sell it.`
        };
      }
      const destination = request.destination ?? { type: "hand", hand: "right" };
      if (destination.type === "container") {
        const carrier = buyer.physical.get(destination.containerId);
        const remaining = buyer.physical.getSolidContainerRemainingCapacity(destination.containerId);
        if (!carrier?.item.solidContainer || remaining === void 0) {
          return { success: false, totalPrice, reason: "Purchase destination is not a possessed solid container." };
        }
        const required = goods.reduce((total, good) => total + getItemStorageVolume(good), 0);
        if (required > remaining) {
          return { success: false, totalPrice, reason: "Purchase does not fit in the destination container." };
        }
      }
      logSimulation(world2, "debug", `Commerce: ${buyer.name} begins purchase from ${seller.name}`);
      logSimulation(world2, "debug", `Commerce: ${buyer.name} has \xA3${buyer.money}`);
      logSimulation(world2, "debug", `Commerce: ${seller.name} has ${goods.length} physical ${request.itemId} item(s)`);
      try {
        for (const good of goods) {
          logSimulation(world2, "debug", `Commerce: transferring goods ${good.id}`);
          seller.physical.move(good.id, {
            type: "hand",
            hand: "right"
          });
          this.transfer.transfer({
            item: good,
            from: seller.physical,
            to: buyer.physical,
            destination
          });
          world2.ownership.transfer(good.id, seller.id, buyer.id);
        }
      } catch (error) {
        return {
          success: false,
          totalPrice,
          reason: error instanceof Error ? error.message : "Physical transaction failed."
        };
      }
      this.transferMoney(buyer, seller, totalPrice);
      logSimulation(world2, "debug", "Commerce: transaction complete");
      logSimulation(
        world2,
        "event",
        `${buyer.name} pays ${seller.name} \xA3${totalPrice} for ${request.quantity} ${request.itemId}`
      );
      this.events?.publish({
        type: "purchase-completed",
        time: world2.time,
        buyerId: buyer.id,
        sellerId: seller.id,
        itemType: request.itemId,
        quantity: request.quantity,
        unitPrice: request.unitPrice,
        totalPrice
      });
      return { success: true, totalPrice };
    }
    /**
     * Pays for a service or consumable whose value is not title to a physical
     * object. Temporary item custody is handled separately by the relevant service.
     */
    payForService(request, world2) {
      if (!arePositionsWithinConversationRange(request.payer.position, request.payee.position, world2)) {
        return { success: false, amount: request.amount, reason: "Payer and payee are too far apart or physically separated to pay." };
      }
      if (!Number.isInteger(request.amount) || request.amount < 0) {
        return { success: false, amount: request.amount, reason: "Payment amount must be a non-negative whole number." };
      }
      if (request.payer.money < request.amount) {
        return { success: false, amount: request.amount, reason: "Buyer cannot afford the purchase." };
      }
      this.transferMoney(request.payer, request.payee, request.amount);
      logSimulation(world2, "event", `${request.payer.name} pays ${request.payee.name} \xA3${request.amount} for ${request.description}`);
      return { success: true, amount: request.amount };
    }
    transferMoney(payer, payee, amount) {
      payer.money -= amount;
      payee.money += amount;
    }
    selectGoods(request) {
      if (!request.specificItemIds) {
        return request.seller.physical.getAll().map((possession) => possession.item).filter((item) => this.matchesRequestedGoods(item, request)).slice(0, request.quantity);
      }
      if (request.specificItemIds.length !== request.quantity) return [];
      return request.specificItemIds.map((itemId) => request.seller.physical.get(itemId)?.item).filter(
        (item) => item !== void 0 && this.matchesRequestedGoods(item, request)
      );
    }
    matchesRequestedGoods(item, request) {
      return request.itemCategory !== void 0 ? itemMatchesCategory(item, request.itemCategory) : item.type === request.itemId;
    }
  };

  // src/knowledge/KnowledgeSystem.ts
  var KnowledgeSystem = class {
    /**
     * Finds a fact that this character may offer in ordinary conversation.
     * Private facts remain in the character's own knowledge and can still guide
     * their planning; conversational lookup simply does not expose them.
     */
    find(character, query, polarity = "positive") {
      return character.knowledge.find(
        (knowledge) => knowledge.type === query.type && (query.subjectId === "*" || knowledge.subjectId === query.subjectId) && knowledge.polarity === polarity && serviceContextMatches(knowledge.context, query.context) && knowledge.shareable !== false
      );
    }
    share(source, recipient, query, time, subjectiveSourceId = source.id) {
      const knowledge = this.find(source, query);
      if (!knowledge) return false;
      recipient.addKnowledge({
        ...knowledge,
        context: this.cloneContext(knowledge.context),
        sourceType: "character",
        sourceId: subjectiveSourceId,
        learnedAt: time
      });
      if (knowledge.type === "service-place") {
        const hours = source.knowledge.filter(
          (fact) => fact.type === "service-hours" && fact.subjectId === knowledge.subjectId && fact.polarity === "positive" && fact.context?.service === knowledge.context?.service && fact.shareable !== false
        ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
        if (hours) {
          recipient.addKnowledge({
            ...hours,
            context: this.cloneContext(hours.context),
            sourceType: "character",
            sourceId: subjectiveSourceId,
            learnedAt: time
          });
        }
      }
      return true;
    }
    cloneContext(context) {
      if (!context) return void 0;
      return {
        ...context,
        ...context.hours ? { hours: context.hours.map((window) => ({ ...window })) } : {}
      };
    }
  };

  // src/social/PersonOpinionSystem.ts
  var PersonOpinionSystem = class {
    formOpinion(speaker, subject) {
      if (!speaker.knownPeople.has(subject.id)) {
        return { type: "does-not-know", subjectPersonId: subject.id };
      }
      const relationship = speaker.relationships.get(subject.id);
      const interactionMemories = speaker.memory.getByType("interaction").map(getInteractionMemoryContext).filter((context) => context?.otherPersonId === subject.id);
      if (!relationship && interactionMemories.length === 0) {
        return { type: "insufficient-experience", subjectPersonId: subject.id };
      }
      const familiarity = relationship?.familiarity ?? 0;
      const reportedTrust = relationship?.trust ?? 0.5;
      const reportedAffinity = relationship?.affinity ?? 0.5;
      const recentMemories = interactionMemories.slice(-5);
      const recentInteractionValence = recentMemories.length === 0 ? 0 : recentMemories.reduce((total, memory) => total + memory.valence, 0) / recentMemories.length;
      const tone = this.getTone(reportedTrust, reportedAffinity, recentInteractionValence);
      const confidence = this.clamp(
        0.2 + familiarity * 0.55 + Math.min(0.2, interactionMemories.length * 0.04)
      );
      const report = {
        speakerId: speaker.id,
        subjectPersonId: subject.id,
        tone,
        familiarity,
        reportedTrust,
        reportedAffinity,
        recentInteractionValence,
        confidence,
        summary: this.describe(subject.name, reportedTrust, reportedAffinity, recentInteractionValence)
      };
      return { type: "opinion", report };
    }
    getTone(trust, affinity, recentValence) {
      const score = (trust - 0.5) * 0.45 + (affinity - 0.5) * 0.45 + recentValence * 0.1;
      if (score >= 0.06) return "positive";
      if (score <= -0.06) return "negative";
      return "neutral";
    }
    describe(subjectName, trust, affinity, recentValence) {
      const effectiveAffinity = this.clamp(affinity + recentValence * 0.15);
      if (trust <= 0.4 && effectiveAffinity <= 0.4) {
        return `I do not trust ${subjectName}, and we do not get along.`;
      }
      if (trust <= 0.4) {
        return `I am wary of ${subjectName}.`;
      }
      if (effectiveAffinity <= 0.4) {
        return `I do not get along with ${subjectName}.`;
      }
      if (trust >= 0.6 && effectiveAffinity >= 0.6) {
        return `I like ${subjectName}, and I trust ${subjectName}.`;
      }
      if (trust >= 0.6) {
        return `I trust ${subjectName}.`;
      }
      if (effectiveAffinity >= 0.6) {
        return `I like ${subjectName}.`;
      }
      return `I do not have a strong opinion about ${subjectName} yet.`;
    }
    clamp(value) {
      return Math.max(0, Math.min(1, value));
    }
  };

  // src/social/SocialInteractionSystem.ts
  var SocialInteractionSystem = class {
    constructor(knowledge, events, conversations, opinions = new PersonOpinionSystem()) {
      this.knowledge = knowledge;
      this.events = events;
      this.conversations = conversations;
      this.opinions = opinions;
      this.requestSequence = 0;
    }
    greet(first, second, world2) {
      if (!this.areWithinConversationRange(first, second, world2)) return;
      logSimulation(world2, "event", `${first.name} greets ${second.name}`);
      this.confirmExpectedIdentity(first, second, world2);
      this.confirmExpectedIdentity(second, first, world2);
      this.events?.publish({
        type: "person-greeted",
        time: world2.time,
        greeterId: first.id,
        greetedId: second.id
      });
    }
    /**
     * Starts voluntary casual conversation. Names are not exchanged here;
     * introductions are optional acts chosen by ConversationSystem during chat.
     */
    smallTalk(first, second, world2) {
      if (!this.areWithinConversationRange(first, second, world2)) return false;
      return this.conversations?.beginSocial(first, second, world2) !== void 0;
    }
    issueInstruction(issuer, recipient, type, world2, expectedDuration = 30) {
      const instruction = { type, personId: issuer.id, issuedBy: issuer.id, issuedAt: world2.time, expectedDuration };
      recipient.socialInstruction = instruction;
      logSimulation(world2, "event", `${issuer.name} tells ${recipient.name} to ${type}`);
    }
    clearInstruction(character, world2) {
      if (!character.socialInstruction) return;
      logSimulation(world2, "decision", `${character.name} clears instruction from ${character.socialInstruction.issuedBy}`);
      character.socialInstruction = void 0;
    }
    sendRequest(requester, target, type, parameters, world2, expiresIn = 45) {
      if (!this.areWithinConversationRange(requester, target, world2)) return void 0;
      const request = {
        id: `${requester.id}-${target.id}-${type}-${world2.time}-${++this.requestSequence}`,
        type,
        fromCharacterId: requester.id,
        toCharacterId: target.id,
        createdAt: world2.time,
        expiresAt: world2.time + expiresIn,
        status: "pending",
        parameters: { ...parameters }
      };
      requester.requests.recordOutgoing(request);
      target.requests.receive(request);
      logSimulation(world2, "debug", `${requester.name} sends ${type} request ${request.id} to ${target.name}`);
      return request;
    }
    respondToRequest(responder, requester, requestId, status, world2) {
      if (!this.areWithinConversationRange(responder, requester, world2)) return false;
      const incoming = responder.requests.getIncomingById(requestId, world2.time);
      const outgoing = requester.requests.getOutgoingById(requestId, world2.time);
      if (!incoming || !outgoing) return false;
      if (incoming.fromCharacterId !== requester.id || outgoing.toCharacterId !== responder.id) return false;
      responder.requests.updateIncomingStatus(requestId, status);
      requester.requests.updateOutgoingStatus(requestId, status);
      logSimulation(world2, "decision", `${responder.name} marks request ${requestId} ${status}`);
      this.events?.publish({
        type: "request-status-changed",
        time: world2.time,
        requestId,
        requestType: incoming.type,
        fromCharacterId: incoming.fromCharacterId,
        toCharacterId: incoming.toCharacterId,
        changedByCharacterId: responder.id,
        status
      });
      return true;
    }
    askPerson(asker, target, query, world2) {
      if (!this.areWithinConversationRange(asker, target, world2)) {
        return { type: "out-of-range", query };
      }
      this.conversations?.begin(asker, target, "information", world2);
      this.conversations?.noteInteraction(asker, target, world2);
      const subjectiveSource = this.getSubjectiveSource(asker, target);
      logSimulation(world2, "event", `${asker.name} asks ${target.name} about ${this.describeQuery(query)}`);
      const knowledge = this.knowledge.find(target, query);
      if (knowledge) {
        const sourceId = subjectiveSource?.sourceId ?? target.id;
        const shared = this.knowledge.share(target, asker, query, world2.time, sourceId);
        const answer = {
          type: knowledge.type,
          subjectId: knowledge.subjectId,
          context: knowledge.context ? { ...knowledge.context } : void 0
        };
        if (knowledge.type === "service-provider" && knowledge.subjectId === target.id) {
          asker.addKnowledge({
            type: "person-identity",
            subjectId: target.id,
            polarity: "positive",
            sourceType: "conversation",
            sourceId: target.id,
            learnedAt: world2.time,
            confidence: 1
          });
          asker.addKnowledge({
            type: "person-location",
            subjectId: target.id,
            polarity: "positive",
            position: { ...target.position },
            sourceType: "conversation",
            sourceId: target.id,
            learnedAt: world2.time,
            confidence: 1
          });
        }
        logSimulation(world2, "event", `${target.name} tells ${asker.name} ${this.describeKnowledge(knowledge)}`);
        if (shared) {
          this.events?.publish({
            type: "knowledge-shared",
            time: world2.time,
            fromCharacterId: target.id,
            toCharacterId: asker.id,
            knowledgeType: knowledge.type,
            subjectId: knowledge.subjectId
          });
        }
        this.conversations?.markPurposeSatisfied(asker, target, world2);
        return { type: "information", query: answer };
      }
      if (subjectiveSource) {
        this.rememberFailedInquiry(asker, query, subjectiveSource.sourceKey, world2.time);
      }
      logSimulation(world2, "event", `${target.name} tells ${asker.name} they do not know ${this.describeQuery(query)}`);
      this.conversations?.markPurposeSatisfied(asker, target, world2);
      return { type: "does-not-know", query };
    }
    /**
     * Asks for the target's subjective view of an identified third person.
     * The answer is a report of the target's experience, not factual knowledge
     * and not a direct relationship change between asker and subject.
     */
    askAboutPerson(asker, target, subject, world2) {
      if (!this.areWithinConversationRange(asker, target, world2)) {
        return { type: "out-of-range", subjectPersonId: subject.id };
      }
      if (!asker.knownPeople.has(subject.id)) {
        return { type: "asker-does-not-know-subject", subjectPersonId: subject.id };
      }
      this.conversations?.begin(asker, target, "information", world2);
      this.conversations?.noteInteraction(asker, target, world2);
      logSimulation(world2, "event", `${asker.name} asks ${target.name} what ${subject.name} is like`);
      const result = this.opinions.formOpinion(target, subject);
      if (result.type === "does-not-know") {
        logSimulation(world2, "event", `${target.name} tells ${asker.name} they do not know ${subject.name}`);
        this.conversations?.markPurposeSatisfied(asker, target, world2);
        return result;
      }
      if (result.type === "insufficient-experience") {
        logSimulation(world2, "event", `${target.name} tells ${asker.name} they do not know ${subject.name} well enough to say`);
        this.conversations?.markPurposeSatisfied(asker, target, world2);
        return result;
      }
      const conversationId = this.conversations?.getActiveConversation(asker.id)?.id;
      const report = result.report;
      logSimulation(world2, "event", `${target.name} tells ${asker.name}: "${report.summary}"`);
      this.events?.publish({
        type: "opinion-shared",
        time: world2.time,
        conversationId,
        speakerId: target.id,
        listenerId: asker.id,
        subjectPersonId: subject.id,
        tone: report.tone,
        familiarity: report.familiarity,
        reportedTrust: report.reportedTrust,
        reportedAffinity: report.reportedAffinity,
        recentInteractionValence: report.recentInteractionValence,
        confidence: report.confidence
      });
      this.conversations?.markPurposeSatisfied(asker, target, world2);
      return result;
    }
    confirmExpectedIdentity(observer, person, world2) {
      if (observer.knownPeople.has(person.id)) return;
      const hasNamedReferent = observer.knowledge.some(
        (knowledge) => knowledge.subjectId === person.id && knowledge.polarity === "positive" && (knowledge.type === "person-location" || knowledge.type === "service-provider")
      );
      if (!hasNamedReferent) return;
      observer.addKnowledge({
        type: "person-identity",
        subjectId: person.id,
        polarity: "positive",
        sourceType: "conversation",
        sourceId: person.id,
        learnedAt: world2.time,
        confidence: 1
      });
      logSimulation(world2, "event", `${person.name} confirms their identity to ${observer.name}`);
    }
    getSubjectiveSource(asker, target) {
      if (asker.knownPeople.has(target.id)) {
        return { sourceId: target.id, sourceKey: `person:${target.id}` };
      }
      const observation = asker.memory.getByType("person-observed").filter((memory) => memory.context?.identifiedPersonId === void 0).filter((memory) => {
        const position = memory.context?.position;
        return typeof position?.x === "number" && typeof position?.y === "number" && isWithinConversationRange(Math.hypot(position.x - target.position.x, position.y - target.position.y));
      }).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
      if (!observation) return void 0;
      return {
        sourceId: observation.subjectId,
        sourceKey: `observation:${observation.subjectId}`
      };
    }
    rememberFailedInquiry(asker, query, sourceKey, time) {
      const contextKey = knowledgeQueryContextKey(query);
      const subjectId = `${query.type}:${query.subjectId}:${contextKey}:${sourceKey}`;
      asker.memory.remember({
        id: `${asker.id}:knowledge-inquiry:${subjectId}`,
        type: "knowledge-inquiry",
        subjectId,
        persistence: 180,
        confidence: 1,
        createdAt: time,
        lastObservedAt: time,
        importance: 1,
        context: {
          knowledgeType: query.type,
          knowledgeSubjectId: query.subjectId,
          knowledgeContextKey: contextKey,
          sourceKey
        }
      });
    }
    areWithinConversationRange(first, second, world2) {
      return arePositionsWithinConversationRange(first.position, second.position, world2);
    }
    describeQuery(query) {
      switch (query.type) {
        case "service-place": {
          const service = query.context?.service ?? "service";
          return query.subjectId === "*" ? `where ${service} service is available` : `the ${service} service place ${query.subjectId}`;
        }
        case "service-provider": {
          const service = query.context?.service ?? "service";
          const place = query.context?.placeId ? ` at ${query.context.placeId}` : "";
          return query.subjectId === "*" ? `who provides ${service}${place}` : `whether ${query.subjectId} provides ${service}${place}`;
        }
        case "service-hours": {
          const service = query.context?.service ?? "service";
          return `when ${service} service is available at ${query.subjectId}`;
        }
        case "person-location":
          return `where ${query.subjectId} can be found`;
        case "person-identity":
          return `the identity of ${query.subjectId}`;
        case "water-source":
          return query.subjectId === "*" ? "where water can be found" : `the water source ${query.subjectId}`;
        case "home-location":
          return `where ${query.subjectId} is located`;
      }
    }
    describeKnowledge(knowledge) {
      switch (knowledge.type) {
        case "service-place": {
          const service = knowledge.context?.service ?? "service";
          return knowledge.position ? `that ${service} is available at ${knowledge.subjectId} (${knowledge.position.x}, ${knowledge.position.y})` : `that ${service} is available at ${knowledge.subjectId}`;
        }
        case "service-provider": {
          const service = knowledge.context?.service ?? "a service";
          const place = knowledge.context?.placeId ? ` at ${knowledge.context.placeId}` : "";
          return `that ${knowledge.subjectId} provides ${service}${place}`;
        }
        case "service-hours": {
          const service = knowledge.context?.service ?? "service";
          const hours = knowledge.context?.hours;
          if (!hours?.length) return `that ${knowledge.subjectId} has known ${service} opening hours`;
          return `that ${knowledge.subjectId} offers ${service} ${hours.map(
            (window) => `${this.formatMinuteOfDay(window.startMinuteOfDay)}-${this.formatMinuteOfDay(window.endMinuteOfDay)}`
          ).join(", ")}`;
        }
        case "person-location":
          return knowledge.position ? `that ${knowledge.subjectId} can be found at (${knowledge.position.x}, ${knowledge.position.y})` : `that ${knowledge.subjectId} can be found at the known location`;
        case "person-identity":
          return `that ${knowledge.subjectId} is their identity`;
        case "water-source":
          return knowledge.position ? `that water can be found at ${knowledge.subjectId} (${knowledge.position.x}, ${knowledge.position.y})` : `that ${knowledge.subjectId} is a known water source`;
        case "home-location":
          return knowledge.position ? `that ${knowledge.subjectId} is at (${knowledge.position.x}, ${knowledge.position.y})` : `that ${knowledge.subjectId} has a known location`;
      }
    }
    formatMinuteOfDay(minuteOfDay) {
      const normalized = (Math.floor(minuteOfDay) % (24 * 60) + 24 * 60) % (24 * 60);
      const hour = Math.floor(normalized / 60);
      const minute = normalized % 60;
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  };

  // src/physical/Position.ts
  function distanceBetween2(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // src/physical/AccessibilitySystem.ts
  var AccessibilitySystem = class {
    constructor(context) {
      this.context = context;
    }
    canAccess(character, possession) {
      return this.canAccessPossession(character, possession, /* @__PURE__ */ new Set());
    }
    canAccessPossession(character, possession, visited) {
      if (visited.has(possession.item.id)) return false;
      visited.add(possession.item.id);
      const location = possession.location;
      if (location.type === "hand" || location.type === "equipped") {
        return true;
      }
      const portableParent = character.physical.get(location.containerId);
      if (portableParent) {
        return portableParent.item.solidContainer !== void 0 && this.canAccessPossession(character, portableParent, visited);
      }
      const container = this.context.getContainer(location.containerId);
      if (!container) return false;
      if (distanceBetween2(character.position, container.position) > this.context.accessDistance) {
        return false;
      }
      return this.context.isInteractionClear?.(character.position, container.position) ?? true;
    }
  };

  // src/movement/MovementSystem.ts
  var ARRIVAL_DISTANCE = 0.1;
  var PHYSICAL_STEP_SAMPLE_METRES = 0.25;
  var CONTACT_KNOWLEDGE_RANGE_METRES = 1.25;
  var MovementSystem = class {
    constructor(navigation2 = new NavigationSystem()) {
      this.navigation = navigation2;
      this.routes = /* @__PURE__ */ new Map();
      this.rangeRequests = /* @__PURE__ */ new Map();
      this.rangeApproaches = /* @__PURE__ */ new Map();
      /**
       * Execution-only cache for expensive objective interaction-route estimates.
       * It is deliberately keyed by every physical input that can change the answer,
       * including the objective navigation revision. It is not character knowledge.
       */
      this.objectiveApproachEstimates = /* @__PURE__ */ new Map();
    }
    start(character, target) {
      this.rangeRequests.delete(character.id);
      this.rangeApproaches.delete(character.id);
      character.movementTarget = { ...target };
    }
    /**
     * Objective execution-time duration for a movement action. Planning deliberately
     * does not call this: it continues to estimate from the character's subjective
     * target position without access to hidden navigation geometry.
     */
    estimateTravelDuration(character, target, world2) {
      return this.estimateTravelDurationBetween(
        character.position,
        target,
        character.movementSpeed,
        world2
      );
    }
    /**
     * Objective execution-time duration between two fixed positions. This is useful
     * for multi-leg execution actions whose later leg has not started yet, without
     * leaking route geometry into planning.
     */
    estimateTravelDurationBetween(from, target, movementSpeed, world2) {
      if (movementSpeed <= 0) return void 0;
      const straightDistance = Math.hypot(
        target.x - from.x,
        target.y - from.y
      );
      if (!world2.navigation.hasConstraints) {
        return straightDistance / movementSpeed;
      }
      const route = this.navigation.findRoute(from, target, world2.navigation);
      if (!route) return void 0;
      return route.distance / movementSpeed;
    }
    /**
     * Objective execution-time duration for reaching physical interaction range.
     * A target can be geometrically close but require a longer route around a wall.
     * As with exact travel timing, this is intentionally unavailable to planning.
     */
    estimateApproachDuration(character, target, range, world2) {
      if (character.movementSpeed <= 0) return void 0;
      const safeRange = Math.max(0, range);
      const straightDistance = Math.hypot(
        target.x - character.position.x,
        target.y - character.position.y
      );
      const straightApproachDistance = Math.max(0, straightDistance - safeRange);
      if (!world2.navigation.hasConstraints) {
        return straightApproachDistance / character.movementSpeed;
      }
      const navigationRevision = world2.navigation.revision;
      const cached = this.objectiveApproachEstimates.get(character.id);
      if (cached && cached.navigationRevision === navigationRevision && cached.movementSpeed === character.movementSpeed && Math.abs(cached.range - safeRange) <= 1e-6 && this.samePosition(cached.from, character.position) && this.samePosition(cached.target, target)) {
        return cached.duration;
      }
      const approach = this.navigation.findApproachRoute(
        character.position,
        target,
        safeRange,
        world2.navigation
      );
      const duration = approach ? approach.route.distance / character.movementSpeed : void 0;
      this.objectiveApproachEstimates.set(character.id, {
        from: { ...character.position },
        target: { ...target },
        range: safeRange,
        movementSpeed: character.movementSpeed,
        navigationRevision,
        duration
      });
      return duration;
    }
    startWithinRange(character, target, range) {
      this.startWithinRangeOfPosition(character, target.position, range);
    }
    startWithinRangeOfPosition(character, target, range) {
      const safeRange = Math.max(0, range);
      const existing = this.rangeRequests.get(character.id);
      const changed = !existing || !this.samePosition(existing.target, target) || Math.abs(existing.range - safeRange) > 1e-6;
      this.rangeRequests.set(character.id, {
        target: { ...target },
        range: safeRange
      });
      if (changed) {
        this.rangeApproaches.delete(character.id);
        this.routes.delete(character.id);
      }
      const dx = character.position.x - target.x;
      const dy = character.position.y - target.y;
      const distance10 = Math.hypot(dx, dy);
      if (distance10 <= safeRange) {
        character.movementTarget = void 0;
        return;
      }
      const scale = safeRange / distance10;
      character.movementTarget = {
        x: target.x + dx * scale,
        y: target.y + dy * scale
      };
    }
    update(character, world2, deltaTime) {
      const rangeRequest = this.rangeRequests.get(character.id);
      if (rangeRequest) {
        const distance10 = Math.hypot(
          rangeRequest.target.x - character.position.x,
          rangeRequest.target.y - character.position.y
        );
        const physicallyReachable = world2.navigation.isLineClear(
          character.position,
          rangeRequest.target,
          "interaction"
        );
        if (distance10 <= rangeRequest.range + 1e-6 && physicallyReachable) {
          character.movementTarget = void 0;
          this.clearMovementState(character.id);
          return true;
        }
        if (distance10 <= rangeRequest.range + 1e-6 && !physicallyReachable) {
          this.learnNearbyObjectiveConstraints(character, world2);
        }
        const approach = this.getOrCreateRangeApproach(character, rangeRequest);
        if (!approach.destination) {
          character.movementTarget = void 0;
          return false;
        }
        character.movementTarget = { ...approach.destination };
      }
      const target = character.movementTarget;
      if (!target) {
        this.routes.delete(character.id);
        return false;
      }
      if (character.movementSpeed <= 0 || deltaTime <= 0) return false;
      const route = this.getOrCreateRoute(character, target);
      if (!route.waypoints) return false;
      let remainingStep = character.movementSpeed * deltaTime;
      while (remainingStep > 0 && route.nextWaypoint < route.waypoints.length) {
        const waypoint = route.waypoints[route.nextWaypoint];
        const dx = waypoint.x - character.position.x;
        const dy = waypoint.y - character.position.y;
        const distance10 = Math.hypot(dx, dy);
        if (distance10 <= ARRIVAL_DISTANCE) {
          if (distance10 > 1e-9 && !this.moveWithPhysicalValidation(character, waypoint, world2)) {
            this.routes.delete(character.id);
            this.rangeApproaches.delete(character.id);
            return false;
          }
          route.nextWaypoint++;
          continue;
        }
        const stepDistance = Math.min(remainingStep, distance10);
        const nextPosition = {
          x: character.position.x + dx / distance10 * stepDistance,
          y: character.position.y + dy / distance10 * stepDistance
        };
        if (!this.moveWithPhysicalValidation(character, nextPosition, world2)) {
          this.routes.delete(character.id);
          this.rangeApproaches.delete(character.id);
          return false;
        }
        remainingStep = Math.max(0, remainingStep - stepDistance);
        if (stepDistance >= distance10 - 1e-9) {
          route.nextWaypoint++;
        }
      }
      if (route.nextWaypoint >= route.waypoints.length) {
        character.movementTarget = void 0;
        this.clearMovementState(character.id);
        return true;
      }
      return false;
    }
    getOrCreateRangeApproach(character, request) {
      const subjectiveGrid = character.navigationKnowledge.grid;
      const existing = this.rangeApproaches.get(character.id);
      if (existing && existing.navigationRevision === subjectiveGrid.revision && this.samePosition(existing.target, request.target) && Math.abs(existing.range - request.range) <= 1e-6) {
        return existing;
      }
      const calculated = this.navigation.findApproachRoute(
        character.position,
        request.target,
        request.range,
        subjectiveGrid
      );
      const approach = {
        target: { ...request.target },
        range: request.range,
        navigationRevision: subjectiveGrid.revision,
        destination: calculated ? { ...calculated.destination } : void 0
      };
      this.rangeApproaches.set(character.id, approach);
      if (calculated) {
        this.routes.set(character.id, {
          destination: { ...calculated.destination },
          navigationRevision: subjectiveGrid.revision,
          waypoints: calculated.route.waypoints.map((waypoint) => ({ ...waypoint })),
          nextWaypoint: 0
        });
      } else {
        this.routes.delete(character.id);
      }
      return approach;
    }
    getOrCreateRoute(character, target) {
      const subjectiveGrid = character.navigationKnowledge.grid;
      const existing = this.routes.get(character.id);
      if (existing && existing.navigationRevision === subjectiveGrid.revision && this.samePosition(existing.destination, target)) {
        return existing;
      }
      const calculated = this.navigation.findRoute(character.position, target, subjectiveGrid);
      const route = {
        destination: { ...target },
        navigationRevision: subjectiveGrid.revision,
        waypoints: calculated?.waypoints.map((waypoint) => ({ ...waypoint })),
        nextWaypoint: 0
      };
      this.routes.set(character.id, route);
      return route;
    }
    moveWithPhysicalValidation(character, target, world2) {
      const start2 = { ...character.position };
      if (isLineClearWithClearance(
        world2.navigation,
        start2,
        target,
        "movement",
        CHARACTER_BODY_RADIUS_METRES
      )) {
        character.position = { ...target };
        return true;
      }
      const distance10 = Math.hypot(target.x - start2.x, target.y - start2.y);
      const samples = Math.max(1, Math.ceil(distance10 / PHYSICAL_STEP_SAMPLE_METRES));
      let lastSafe = { ...start2 };
      for (let sample = 1; sample <= samples; sample++) {
        const ratio = sample / samples;
        const candidate = {
          x: start2.x + (target.x - start2.x) * ratio,
          y: start2.y + (target.y - start2.y) * ratio
        };
        if (!isLineClearWithClearance(
          world2.navigation,
          lastSafe,
          candidate,
          "movement",
          CHARACTER_BODY_RADIUS_METRES
        )) break;
        lastSafe = candidate;
      }
      character.position = { ...lastSafe };
      this.learnNearbyObjectiveConstraints(character, world2);
      return false;
    }
    learnNearbyObjectiveConstraints(character, world2) {
      for (const edge of world2.navigation.getBarrierEdges()) {
        const first = world2.navigation.cellCentre(edge.first);
        const second = world2.navigation.cellCentre(edge.second);
        const midpoint = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2
        };
        if (this.distanceBetween(character.position, midpoint) > CONTACT_KNOWLEDGE_RANGE_METRES) {
          continue;
        }
        character.navigationKnowledge.observeBarrier(
          edge.first,
          edge.second,
          edge.barrier,
          "contact",
          world2.time,
          1
        );
      }
      for (const cell of world2.navigation.getBlockedCells()) {
        const centre = world2.navigation.cellCentre(cell);
        if (this.distanceBetween(character.position, centre) > CONTACT_KNOWLEDGE_RANGE_METRES) {
          continue;
        }
        character.navigationKnowledge.observeBlockedCell(
          cell,
          "contact",
          world2.time,
          1
        );
      }
    }
    distanceBetween(first, second) {
      return Math.hypot(second.x - first.x, second.y - first.y);
    }
    clearMovementState(characterId) {
      this.routes.delete(characterId);
      this.rangeRequests.delete(characterId);
      this.rangeApproaches.delete(characterId);
    }
    samePosition(first, second) {
      return Math.abs(first.x - second.x) <= 1e-6 && Math.abs(first.y - second.y) <= 1e-6;
    }
  };

  // src/events/SimulationEventBus.ts
  var SimulationEventBus = class {
    constructor() {
      this.pending = [];
      this.listeners = /* @__PURE__ */ new Set();
    }
    publish(event) {
      this.pending.push(event);
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    dispatchPending() {
      if (this.pending.length === 0) return;
      const batch = this.pending.splice(0, this.pending.length);
      const listeners2 = Array.from(this.listeners);
      for (const event of batch) {
        for (const listener of listeners2) {
          listener(event);
        }
      }
    }
  };

  // src/social/SocialDecisionEvaluator.ts
  var SocialDecisionEvaluator = class {
    constructor() {
      this.hearsay = new HearsayOpinionEvaluator();
    }
    evaluateStopForHail(context) {
      const familiarityScore = context.familiarity === "mutual-known" ? 0.7 : context.familiarity === "named" ? 0.6 : 0.5;
      const helpfulness = context.target.personality.helpfulness - 0.5;
      const sociability = context.target.personality.sociability - 0.5;
      const relationship = context.target.relationships.get(context.caller.id);
      const relationshipModifier = relationship ? relationship.familiarity * 0.1 + (relationship.trust - 0.5) * 0.2 + (relationship.affinity - 0.5) * 0.3 : 0;
      const hearsay = this.hearsay.evaluate(context.target, context.caller.id);
      const hearsayModifier = hearsay.trustAdjustment * 0.25 + hearsay.affinityAdjustment * 0.2;
      const physicalNeedModifier = this.physicalNeedModifier(context.target);
      const taskPressureModifier = this.taskPressureModifier(context.target);
      const score = familiarityScore + helpfulness * 0.3 + sociability * 0.2 + relationshipModifier + hearsayModifier + physicalNeedModifier + taskPressureModifier;
      return {
        score,
        accepted: score >= 0.5,
        hearsayModifier,
        physicalNeedModifier,
        taskPressureModifier
      };
    }
    evaluateHailAttempt(context) {
      const intentPriority = context.caller.currentIntent?.priority ?? 0;
      const motivation = context.caller.personality.assertiveness * 0.2 + context.caller.personality.sociability * 0.1 + Math.min(0.5, intentPriority / 100 * 0.5);
      const recentIgnoredPenalty = Math.min(
        0.9,
        context.caller.memory.getByType("interaction").filter((memory) => memory.context?.interactionKind === "hail").filter((memory) => memory.context?.role === "caller").filter((memory) => memory.context?.outcome === "ignored").filter((memory) => {
          const sameKnownPerson = memory.context?.otherPersonId === context.target.id;
          const sameAnonymousObservation = context.targetObservationId !== void 0 && memory.context?.otherObservationId === context.targetObservationId;
          return sameKnownPerson || sameAnonymousObservation;
        }).filter((memory) => context.time - memory.lastObservedAt <= 180).reduce((penalty, memory) => {
          const age = Math.max(0, context.time - memory.lastObservedAt);
          return penalty + memory.confidence * 0.45 * Math.exp(-age / 60);
        }, 0)
      );
      const score = motivation - recentIgnoredPenalty;
      return {
        attempt: recentIgnoredPenalty === 0 || score >= 0,
        score,
        recentIgnoredPenalty
      };
    }
    physicalNeedModifier(character) {
      const need = Math.max(character.hunger, character.thirst, character.tiredness);
      if (need <= 50) return 0;
      if (need <= 70) {
        return -((need - 50) / 20) * 0.2;
      }
      return -0.2 - (need - 70) / 30 * 0.6;
    }
    taskPressureModifier(character) {
      const priority = character.currentIntent?.priority ?? 0;
      if (priority <= 30) return 0;
      return -Math.min(0.2, (priority - 30) / 70 * 0.2);
    }
  };

  // src/social/PersonPursuitSystem.ts
  var MUTUAL_KNOWN_HAIL_RANGE_METRES = 8;
  var NAMED_HAIL_RANGE_METRES = 5;
  var STRANGER_HAIL_RANGE_METRES = 3;
  var HAIL_WAIT_MINUTES = 5;
  var HAIL_COOLDOWN_MINUTES = 5;
  var PersonPursuitSystem = class {
    constructor(movement, events, socialDecisions = new SocialDecisionEvaluator()) {
      this.movement = movement;
      this.events = events;
      this.socialDecisions = socialDecisions;
      this.lastHailAt = /* @__PURE__ */ new Map();
    }
    update(world2) {
      for (const character of world2.characters) {
        if (character.currentAction && this.isOrdinaryMovementAction(character.currentAction.type)) {
          character.currentAction.interruptionPolicy = "interruptible";
        }
      }
      const pursuits = world2.characters.map((character) => this.getActivePursuit(character, world2)).filter((pursuit) => pursuit !== void 0);
      for (const pursuit of pursuits) {
        this.refreshPursuit(pursuit);
      }
      for (const pursuit of pursuits) {
        if (pursuit.mode === "conversation") {
          this.tryHail(pursuit, world2);
        }
      }
    }
    getActivePursuit(character, world2) {
      const actionType = character.currentAction?.type;
      const plan = character.currentPlan;
      if (!actionType || !plan) return void 0;
      const personPrefix = "go-to-person:";
      const conversationPrefix = "go-to-conversation-range:";
      const mode = actionType.startsWith(conversationPrefix) ? "conversation" : actionType.startsWith(personPrefix) ? "person" : void 0;
      if (!mode) return void 0;
      const label = actionType.slice(
        mode === "conversation" ? conversationPrefix.length : personPrefix.length
      );
      const targets = this.findMatchingPersonTargets(plan, label);
      if (targets.length === 0) return void 0;
      const observedPosition = this.getFreshObservedPosition(character, targets[0], world2.time);
      if (!observedPosition) return void 0;
      return { pursuer: character, mode, label, targets, observedPosition };
    }
    refreshPursuit(pursuit) {
      const { pursuer, observedPosition } = pursuit;
      for (const target of pursuit.targets) {
        target.position = { ...observedPosition };
        target.distance = Math.hypot(
          observedPosition.x - pursuer.position.x,
          observedPosition.y - pursuer.position.y
        );
      }
      if (pursuit.mode === "conversation") {
        this.movement.startWithinRangeOfPosition(
          pursuer,
          observedPosition,
          CONVERSATION_RANGE_METRES
        );
      } else {
        this.movement.start(pursuer, observedPosition);
      }
    }
    tryHail(pursuit, world2) {
      const target = this.resolvePhysicalTarget(pursuit, world2);
      if (!target) return;
      const distance10 = Math.hypot(
        target.position.x - pursuit.pursuer.position.x,
        target.position.y - pursuit.pursuer.position.y
      );
      if (isWithinConversationRange(distance10)) return;
      if (!target.movementTarget) return;
      if (this.isMovingToward(target, pursuit.pursuer)) return;
      if (target.socialInstruction?.type === "wait" && target.socialInstruction.personId === pursuit.pursuer.id) return;
      const callerKnowsTarget = pursuit.pursuer.knownPeople.has(target.id);
      const targetKnowsCaller = target.knownPeople.has(pursuit.pursuer.id);
      const familiarity = callerKnowsTarget && targetKnowsCaller ? "mutual-known" : callerKnowsTarget ? "named" : "stranger";
      const baseHailRange = familiarity === "mutual-known" ? MUTUAL_KNOWN_HAIL_RANGE_METRES : familiarity === "named" ? NAMED_HAIL_RANGE_METRES : STRANGER_HAIL_RANGE_METRES;
      const hailRange = baseHailRange * this.assertivenessRangeMultiplier(pursuit.pursuer);
      if (distance10 > hailRange) return;
      const hailKey = `${pursuit.pursuer.id}:${target.id}`;
      const previousHail = this.lastHailAt.get(hailKey);
      if (previousHail !== void 0 && world2.time - previousHail < HAIL_COOLDOWN_MINUTES) return;
      const attemptDecision = this.socialDecisions.evaluateHailAttempt({
        caller: pursuit.pursuer,
        target,
        time: world2.time,
        targetObservationId: pursuit.targets[0].observationId
      });
      if (!attemptDecision.attempt) {
        logSimulation(
          world2,
          "decision",
          `${pursuit.pursuer.name} does not hail ${target.name} again after a recent ignored attempt`
        );
        return;
      }
      this.lastHailAt.set(hailKey, world2.time);
      const message = callerKnowsTarget ? `${target.name}, wait!` : "Excuse me, please stop a second!";
      logSimulation(world2, "event", `${pursuit.pursuer.name} calls "${message}"`);
      const willingToStop = this.socialDecisions.evaluateStopForHail({
        caller: pursuit.pursuer,
        target,
        familiarity
      });
      const accepted = willingToStop.accepted && target.currentAction?.interruptionPolicy === "interruptible" && target.interruptCurrentAction(world2, `responding to ${pursuit.pursuer.name}'s hail`);
      if (accepted) {
        target.movementTarget = void 0;
        target.socialInstruction = {
          type: "wait",
          personId: pursuit.pursuer.id,
          issuedBy: pursuit.pursuer.id,
          issuedAt: world2.time,
          expectedDuration: HAIL_WAIT_MINUTES
        };
        logSimulation(world2, "event", `${target.name} stops for ${pursuit.pursuer.name}`);
      } else {
        logSimulation(world2, "event", `${target.name} does not stop for ${pursuit.pursuer.name}`);
      }
      this.events?.publish({
        type: "person-hailed",
        time: world2.time,
        callerId: pursuit.pursuer.id,
        targetId: target.id,
        familiarity,
        response: accepted ? "accepted" : "ignored"
      });
    }
    assertivenessRangeMultiplier(character) {
      return 0.75 + character.personality.assertiveness * 0.5;
    }
    getFreshObservedPosition(observer, target, time) {
      const memories = observer.memory.getByType("person-observed").filter((memory) => memory.lastObservedAt === time).filter((memory) => target.personId ? memory.context?.identifiedPersonId === target.personId : memory.subjectId === target.observationId).sort((first, second) => second.lastObservedAt - first.lastObservedAt);
      const position = memories[0]?.context?.position;
      if (typeof position?.x !== "number" || typeof position?.y !== "number") return void 0;
      return { x: position.x, y: position.y };
    }
    resolvePhysicalTarget(pursuit, world2) {
      const identifiedId = pursuit.targets[0].personId;
      if (identifiedId) {
        return world2.characters.find((character) => character.id === identifiedId);
      }
      const candidates = world2.characters.filter((character) => character.id !== pursuit.pursuer.id).map((character) => ({
        character,
        distance: Math.hypot(
          character.position.x - pursuit.observedPosition.x,
          character.position.y - pursuit.observedPosition.y
        )
      })).sort((first, second) => first.distance - second.distance);
      return candidates[0]?.distance <= 0.1 ? candidates[0].character : void 0;
    }
    findMatchingPersonTargets(plan, label) {
      const targets = [];
      if (plan.target?.type === "person" && this.targetLabel(plan.target) === label) {
        targets.push(plan.target);
      }
      for (const prerequisite of plan.prerequisites) {
        targets.push(...this.findMatchingPersonTargets(prerequisite, label));
      }
      return targets;
    }
    isMovingToward(mover, other) {
      const destination = mover.movementTarget;
      if (!destination) return false;
      const dx = destination.x - mover.position.x;
      const dy = destination.y - mover.position.y;
      const remaining = Math.hypot(dx, dy);
      if (remaining <= 0.1) return false;
      const step2 = Math.min(mover.movementSpeed, remaining);
      const next = {
        x: mover.position.x + dx / remaining * step2,
        y: mover.position.y + dy / remaining * step2
      };
      const currentDistance = Math.hypot(
        mover.position.x - other.position.x,
        mover.position.y - other.position.y
      );
      const nextDistance = Math.hypot(
        next.x - other.position.x,
        next.y - other.position.y
      );
      return nextDistance < currentDistance - 1e-6;
    }
    isOrdinaryMovementAction(type) {
      return type.startsWith("go-to-person:") || type.startsWith("go-to-conversation-range:") || type.startsWith("go-to-location:") || type.startsWith("go-home:") || type.startsWith("search-for-person:");
    }
    targetLabel(target) {
      return target.personId ?? target.observationId ?? "unknown-person";
    }
  };

  // src/relationships/RelationshipSystem.ts
  var RelationshipSystem = class {
    constructor(world2) {
      this.world = world2;
    }
    handle(event) {
      switch (event.type) {
        case "person-greeted":
          this.adjustKnown(event.greeterId, event.greetedId, { familiarity: 0.08, affinity: 0.01 }, event.time);
          this.adjustKnown(event.greetedId, event.greeterId, { familiarity: 0.08, affinity: 0.01 }, event.time);
          return;
        case "knowledge-shared":
          this.adjustKnown(event.toCharacterId, event.fromCharacterId, { familiarity: 0.04, trust: 0.03 }, event.time);
          this.adjustKnown(event.fromCharacterId, event.toCharacterId, { familiarity: 0.02 }, event.time);
          return;
        case "purchase-completed":
          this.adjustKnown(event.buyerId, event.sellerId, { familiarity: 0.06, trust: 0.04, affinity: 0.01 }, event.time);
          this.adjustKnown(event.sellerId, event.buyerId, { familiarity: 0.06, trust: 0.04, affinity: 0.01 }, event.time);
          return;
        case "person-hailed":
          this.adjustKnown(event.callerId, event.targetId, {
            familiarity: 0.02,
            affinity: event.response === "accepted" ? 0.01 : -0.01
          }, event.time);
          this.adjustKnown(event.targetId, event.callerId, { familiarity: 0.02 }, event.time);
          return;
        case "request-status-changed":
          return;
        case "conversation-started":
          return;
        case "conversation-small-talk": {
          const [firstId, secondId] = event.participantIds;
          this.adjustKnown(firstId, secondId, { familiarity: 0.02, affinity: 5e-3 }, event.time);
          this.adjustKnown(secondId, firstId, { familiarity: 0.02, affinity: 5e-3 }, event.time);
          return;
        }
        case "name-shared":
          this.adjustKnown(event.listenerId, event.speakerId, { familiarity: 0.05 }, event.time);
          this.adjustKnown(event.speakerId, event.listenerId, { familiarity: 0.02 }, event.time);
          return;
        case "opinion-shared":
          this.adjustKnown(event.listenerId, event.speakerId, { familiarity: 0.03, trust: 0.01 }, event.time);
          this.adjustKnown(event.speakerId, event.listenerId, { familiarity: 0.02 }, event.time);
          return;
        case "conversation-ended": {
          const [firstId, secondId] = event.participantIds;
          const familiarityGain = Math.min(0.06, event.duration * 0.01);
          this.adjustKnown(firstId, secondId, { familiarity: familiarityGain }, event.time);
          this.adjustKnown(secondId, firstId, { familiarity: familiarityGain }, event.time);
          if (event.abrupt && event.otherWantedToContinue && event.endedByCharacterId) {
            const otherId = firstId === event.endedByCharacterId ? secondId : firstId;
            const other = this.findCharacter(otherId);
            const affinityPenalty = other ? -0.02 * (1.5 - other.personality.emotionalStability) : -0.02;
            this.adjustKnown(otherId, event.endedByCharacterId, { affinity: affinityPenalty }, event.time);
            return;
          }
          if (event.reason === "mutual" && event.duration >= 2) {
            this.adjustKnown(firstId, secondId, { affinity: 0.01 }, event.time);
            this.adjustKnown(secondId, firstId, { affinity: 0.01 }, event.time);
          }
          return;
        }
      }
    }
    adjustKnown(observerId, otherId, change, time) {
      const observer = this.findCharacter(observerId);
      const other = this.findCharacter(otherId);
      if (!observer || !other) return;
      if (!observer.knownPeople.has(other.id)) return;
      observer.relationships.adjust(other.id, change, time);
    }
    findCharacter(id) {
      return this.world.characters.find((character) => character.id === id);
    }
  };

  // src/memory/InteractionMemorySystem.ts
  var InteractionMemorySystem = class {
    constructor(world2) {
      this.world = world2;
      this.sequence = 0;
    }
    handle(event) {
      switch (event.type) {
        case "person-greeted":
          this.remember(event.greeterId, event.greetedId, event.time, {
            interactionKind: "greeting",
            role: "greeter",
            outcome: "completed",
            valence: 0.05
          }, 1440, 0.3);
          this.remember(event.greetedId, event.greeterId, event.time, {
            interactionKind: "greeting",
            role: "greeted",
            outcome: "completed",
            valence: 0.05
          }, 1440, 0.3);
          return;
        case "knowledge-shared":
          this.remember(event.toCharacterId, event.fromCharacterId, event.time, {
            interactionKind: "knowledge-shared",
            role: "receiver",
            outcome: "shared",
            valence: 0.35,
            knowledgeType: event.knowledgeType,
            knowledgeSubjectId: event.subjectId
          }, 4320, 0.7);
          this.remember(event.fromCharacterId, event.toCharacterId, event.time, {
            interactionKind: "knowledge-shared",
            role: "giver",
            outcome: "shared",
            valence: 0.1,
            knowledgeType: event.knowledgeType,
            knowledgeSubjectId: event.subjectId
          }, 2880, 0.4);
          return;
        case "purchase-completed":
          this.remember(event.buyerId, event.sellerId, event.time, {
            interactionKind: "purchase",
            role: "buyer",
            outcome: "completed",
            valence: 0.15,
            itemType: event.itemType,
            quantity: event.quantity,
            totalPrice: event.totalPrice
          }, 2880, 0.6);
          this.remember(event.sellerId, event.buyerId, event.time, {
            interactionKind: "purchase",
            role: "seller",
            outcome: "completed",
            valence: 0.15,
            itemType: event.itemType,
            quantity: event.quantity,
            totalPrice: event.totalPrice
          }, 2880, 0.6);
          return;
        case "person-hailed":
          this.remember(event.callerId, event.targetId, event.time, {
            interactionKind: "hail",
            role: "caller",
            outcome: event.response,
            valence: event.response === "accepted" ? 0.1 : -0.2,
            familiarity: event.familiarity
          }, event.response === "accepted" ? 1440 : 2880, event.response === "accepted" ? 0.4 : 0.6);
          this.remember(event.targetId, event.callerId, event.time, {
            interactionKind: "hail",
            role: "target",
            outcome: event.response,
            valence: 0,
            familiarity: event.familiarity
          }, 1440, 0.3);
          return;
        case "request-status-changed":
          this.remember(event.fromCharacterId, event.toCharacterId, event.time, {
            interactionKind: "request-status",
            role: "requester",
            outcome: event.status,
            valence: 0,
            requestId: event.requestId,
            requestType: event.requestType,
            statusChangedBy: event.changedByCharacterId === event.fromCharacterId ? "self" : "other"
          }, 2160, 0.5);
          this.remember(event.toCharacterId, event.fromCharacterId, event.time, {
            interactionKind: "request-status",
            role: "request-recipient",
            outcome: event.status,
            valence: 0,
            requestId: event.requestId,
            requestType: event.requestType,
            statusChangedBy: event.changedByCharacterId === event.toCharacterId ? "self" : "other"
          }, 2160, 0.4);
          return;
        case "conversation-started":
          return;
        case "conversation-small-talk": {
          const [firstId, secondId] = event.participantIds;
          this.remember(firstId, secondId, event.time, {
            interactionKind: "small-talk",
            role: "conversation-participant",
            outcome: "completed",
            valence: 0.1,
            conversationId: event.conversationId
          }, 1440, 0.3);
          this.remember(secondId, firstId, event.time, {
            interactionKind: "small-talk",
            role: "conversation-participant",
            outcome: "completed",
            valence: 0.1,
            conversationId: event.conversationId
          }, 1440, 0.3);
          return;
        }
        case "name-shared":
          this.remember(event.speakerId, event.listenerId, event.time, {
            interactionKind: "name-shared",
            role: "name-speaker",
            outcome: "shared",
            valence: 0.05,
            conversationId: event.conversationId
          }, 2880, 0.4);
          this.remember(event.listenerId, event.speakerId, event.time, {
            interactionKind: "name-shared",
            role: "name-listener",
            outcome: "learned",
            valence: 0.1,
            conversationId: event.conversationId
          }, 4320, 0.6);
          return;
        case "opinion-shared": {
          const listenerSubjectId = this.knownSubjectReference(event.listenerId, event.subjectPersonId);
          const speakerSubjectId = this.knownSubjectReference(event.speakerId, event.subjectPersonId);
          this.remember(event.listenerId, event.speakerId, event.time, {
            interactionKind: "opinion-shared",
            role: "opinion-listener",
            outcome: event.tone,
            valence: 0.05,
            conversationId: event.conversationId,
            opinionSubjectPersonId: listenerSubjectId,
            opinionTone: event.tone,
            reportedFamiliarity: event.familiarity,
            reportedTrust: event.reportedTrust,
            reportedAffinity: event.reportedAffinity,
            reportedRecentInteractionValence: event.recentInteractionValence,
            opinionConfidence: event.confidence
          }, 4320, 0.65);
          this.remember(event.speakerId, event.listenerId, event.time, {
            interactionKind: "opinion-shared",
            role: "opinion-speaker",
            outcome: "shared",
            valence: 0.05,
            conversationId: event.conversationId,
            opinionSubjectPersonId: speakerSubjectId,
            opinionTone: event.tone,
            reportedFamiliarity: event.familiarity,
            reportedTrust: event.reportedTrust,
            reportedAffinity: event.reportedAffinity,
            reportedRecentInteractionValence: event.recentInteractionValence,
            opinionConfidence: event.confidence
          }, 2880, 0.45);
          return;
        }
        case "conversation-ended": {
          const [firstId, secondId] = event.participantIds;
          this.rememberConversationEnding(firstId, secondId, event);
          this.rememberConversationEnding(secondId, firstId, event);
          return;
        }
      }
    }
    rememberConversationEnding(observerId, otherId, event) {
      const endedBySelf = event.endedByCharacterId === observerId;
      const endedByOther = event.endedByCharacterId === otherId;
      const wasLeftWantingMore = event.abrupt && endedByOther && event.otherWantedToContinue;
      const mutualPositive = event.reason === "mutual" && event.duration >= 2;
      this.remember(observerId, otherId, event.time, {
        interactionKind: "conversation-ended",
        role: endedBySelf ? "conversation-ender" : "conversation-participant",
        outcome: event.reason,
        valence: wasLeftWantingMore ? -0.2 : mutualPositive ? 0.1 : 0,
        conversationId: event.conversationId,
        conversationDuration: event.duration,
        conversationAbrupt: event.abrupt,
        conversationEndedBy: endedBySelf ? "self" : endedByOther ? "other" : "mutual"
      }, wasLeftWantingMore ? 2880 : 1440, wasLeftWantingMore ? 0.7 : 0.4);
    }
    remember(observerId, otherId, time, context, persistence, importance) {
      const observer = this.findCharacter(observerId);
      const other = this.findCharacter(otherId);
      if (!observer || !other || observer.id === other.id) return;
      const reference = this.resolveSubjectiveReference(observer, other, time);
      const sequence = ++this.sequence;
      const subjectId = `${observer.id}:${context.interactionKind}:${time}:${sequence}`;
      observer.memory.remember({
        id: `${observer.id}:interaction:${time}:${sequence}`,
        type: "interaction",
        subjectId,
        persistence,
        confidence: 1,
        createdAt: time,
        lastObservedAt: time,
        importance,
        context: {
          ...context,
          ...reference
        }
      });
    }
    knownSubjectReference(observerId, subjectId) {
      const observer = this.findCharacter(observerId);
      return observer?.knownPeople.has(subjectId) ? subjectId : void 0;
    }
    resolveSubjectiveReference(observer, other, time) {
      if (observer.knownPeople.has(other.id)) {
        return { otherPersonId: other.id };
      }
      const observation = observer.memory.getByType("person-observed").filter((memory) => memory.context?.identifiedPersonId === void 0).filter((memory) => memory.lastObservedAt === time).map((memory) => {
        const position = memory.context?.position;
        if (typeof position?.x !== "number" || typeof position?.y !== "number") {
          return void 0;
        }
        return {
          memory,
          distance: Math.hypot(position.x - other.position.x, position.y - other.position.y)
        };
      }).filter((candidate) => candidate !== void 0).sort((first, second) => first.distance - second.distance)[0];
      return observation && observation.distance <= 0.25 ? { otherObservationId: observation.memory.subjectId } : {};
    }
    findCharacter(id) {
      return this.world.characters.find((character) => character.id === id);
    }
  };

  // src/social/ConversationDecisionEvaluator.ts
  var ConversationDecisionEvaluator = class {
    constructor() {
      this.hearsay = new HearsayOpinionEvaluator();
    }
    evaluateContinue(character, other, conversation, world2) {
      const relationship = character.relationships.get(other.id);
      const relationshipBonus = relationship ? (relationship.affinity - 0.5) * 0.1 : 0;
      const hearsay = this.hearsay.evaluate(character, other.id);
      const hearsayModifier = hearsay.trustAdjustment * 0.15 + hearsay.affinityAdjustment * 0.15;
      const socialNeedBonus = character.socialNeed / 100 * 0.25;
      const socialValue = 0.1 + character.personality.sociability * 0.3 + character.personality.curiosity * 0.15 + character.personality.helpfulness * 0.2 + character.personality.patience * 0.15 + socialNeedBonus + relationshipBonus + hearsayModifier;
      const highestNeed = Math.max(
        character.hunger,
        character.thirst,
        character.tiredness
      );
      const needPressure = Math.max(0, (highestNeed - 50) / 50) * 0.6;
      const hasDueAgendaItem = character.dailyAgenda?.items.some(
        (item) => item.status === "planned" && world2.time >= item.plannedStart
      ) ?? false;
      const schedulePressure = hasDueAgendaItem ? 0.2 * (0.5 + character.personality.conscientiousness) : 0;
      const elapsedSincePurpose = conversation.purposeSatisfiedAt === void 0 ? 0 : Math.max(0, world2.time - conversation.purposeSatisfiedAt);
      const graceMinutes = conversation.purpose === "social" ? 9 : 1;
      const penalizedMinutes = Math.max(0, elapsedSincePurpose - graceMinutes);
      const durationPenaltyRate = conversation.purpose === "social" ? 0.02 : 0.04;
      const durationPenalty = penalizedMinutes * durationPenaltyRate;
      const score = socialValue - needPressure - schedulePressure - durationPenalty;
      const exitUrgency = needPressure + schedulePressure;
      return {
        wantsToContinue: score >= 0.5,
        score,
        socialNeedBonus,
        needPressure,
        schedulePressure,
        durationPenalty,
        exitUrgency,
        hearsayModifier
      };
    }
  };

  // src/social/ConversationSystem.ts
  var SMALL_TALK_INTERVAL_MINUTES = 2;
  var SOCIAL_NEED_RELIEF_PER_MINUTE = 5;
  var OPPORTUNISTIC_CHAT_COOLDOWN_MINUTES = 240;
  var ABRUPT_EXIT_URGENCY = 0.2;
  var ConversationSystem = class {
    constructor(world2, events, evaluator = new ConversationDecisionEvaluator()) {
      this.world = world2;
      this.events = events;
      this.evaluator = evaluator;
      this.conversations = /* @__PURE__ */ new Map();
      this.pairCooldowns = /* @__PURE__ */ new Map();
      this.sequence = 0;
    }
    begin(initiator, other, purpose, world2 = this.world) {
      if (!this.areWithinConversationRange(initiator, other, world2)) return void 0;
      const existing = this.getActiveBetween(initiator.id, other.id);
      if (existing) {
        existing.lastInteractionAt = world2.time;
        return existing;
      }
      if (this.isInConversation(initiator.id) || this.isInConversation(other.id)) {
        return void 0;
      }
      const conversation = {
        id: `conversation-${world2.time}-${++this.sequence}`,
        participantIds: [initiator.id, other.id],
        initiatorId: initiator.id,
        purpose,
        startedAt: world2.time,
        lastInteractionAt: world2.time,
        smallTalkCount: 0,
        status: "active"
      };
      this.conversations.set(conversation.id, conversation);
      logSimulation(world2, "debug", `${initiator.name} begins a conversation with ${other.name} (${purpose})`);
      this.events?.publish({
        type: "conversation-started",
        time: world2.time,
        conversationId: conversation.id,
        participantIds: [...conversation.participantIds],
        initiatorId: initiator.id,
        purpose
      });
      return conversation;
    }
    /** Starts a voluntary social conversation only if both people currently want it. */
    beginSocial(initiator, other, world2 = this.world) {
      if (!this.areWithinConversationRange(initiator, other, world2)) return void 0;
      if (!this.canReceiveCasualChat(other, world2)) return void 0;
      if (this.isPairCoolingDown(initiator.id, other.id, world2.time)) return void 0;
      const preview = this.previewConversation(initiator, other, world2);
      const initiatorDecision = this.evaluator.evaluateContinue(initiator, other, preview, world2);
      const otherDecision = this.evaluator.evaluateContinue(other, initiator, preview, world2);
      if (!initiatorDecision.wantsToContinue || !otherDecision.wantsToContinue) return void 0;
      const conversation = this.begin(initiator, other, "social", world2);
      if (!conversation) return void 0;
      conversation.purposeSatisfiedAt = world2.time;
      this.performSmallTalk(conversation, initiator, other, world2);
      this.ensureConversationAction(initiator, other, conversation, world2);
      this.ensureConversationAction(other, initiator, conversation, world2);
      return conversation;
    }
    noteInteraction(first, second, world2 = this.world) {
      const conversation = this.getActiveBetween(first.id, second.id);
      if (conversation) conversation.lastInteractionAt = world2.time;
    }
    markPurposeSatisfied(first, second, world2 = this.world) {
      const conversation = this.getActiveBetween(first.id, second.id);
      if (!conversation) return;
      conversation.lastInteractionAt = world2.time;
      conversation.purposeSatisfiedAt ?? (conversation.purposeSatisfiedAt = world2.time);
    }
    update(world2 = this.world) {
      this.tryStartOpportunisticConversations(world2);
      for (const conversation of this.conversations.values()) {
        if (conversation.status !== "active" || conversation.purposeSatisfiedAt === void 0) continue;
        const first = this.findCharacter(conversation.participantIds[0]);
        const second = this.findCharacter(conversation.participantIds[1]);
        if (!first || !second) {
          this.endConversation(conversation, world2, "participant-unavailable", void 0, false, false);
          continue;
        }
        if (!this.areWithinConversationRange(first, second, world2)) {
          this.endConversation(conversation, world2, "separated", void 0, false, false);
          continue;
        }
        const firstDecision = this.evaluator.evaluateContinue(first, second, conversation, world2);
        const secondDecision = this.evaluator.evaluateContinue(second, first, conversation, world2);
        if (firstDecision.wantsToContinue && secondDecision.wantsToContinue) {
          this.ensureConversationAction(first, second, conversation, world2);
          this.ensureConversationAction(second, first, conversation, world2);
          if (this.shouldSmallTalk(conversation, world2.time)) {
            this.performSmallTalk(conversation, first, second, world2);
          }
          continue;
        }
        if (!firstDecision.wantsToContinue && secondDecision.wantsToContinue) {
          this.endConversation(
            conversation,
            world2,
            "left",
            first.id,
            this.isAbruptExit(firstDecision, conversation, world2),
            true
          );
          continue;
        }
        if (firstDecision.wantsToContinue && !secondDecision.wantsToContinue) {
          this.endConversation(
            conversation,
            world2,
            "left",
            second.id,
            this.isAbruptExit(secondDecision, conversation, world2),
            true
          );
          continue;
        }
        this.endConversation(conversation, world2, "mutual", void 0, false, false);
      }
    }
    isInConversation(characterId) {
      return Array.from(this.conversations.values()).some(
        (conversation) => conversation.status === "active" && conversation.participantIds.includes(characterId)
      );
    }
    getActiveConversation(characterId) {
      return Array.from(this.conversations.values()).find(
        (conversation) => conversation.status === "active" && conversation.participantIds.includes(characterId)
      );
    }
    tryStartOpportunisticConversations(world2) {
      for (let firstIndex = 0; firstIndex < world2.characters.length; firstIndex++) {
        const first = world2.characters[firstIndex];
        if (!this.isOpportunisticallyAvailable(first, world2)) continue;
        for (let secondIndex = firstIndex + 1; secondIndex < world2.characters.length; secondIndex++) {
          const second = world2.characters[secondIndex];
          if (!this.isOpportunisticallyAvailable(second, world2)) continue;
          if (!this.areWithinConversationRange(first, second, world2)) continue;
          if (this.isPairCoolingDown(first.id, second.id, world2.time)) continue;
          const conversation = this.beginSocial(first, second, world2);
          if (conversation) break;
        }
      }
    }
    isOpportunisticallyAvailable(character, world2) {
      if (this.isInConversation(character.id)) return false;
      if (character.currentAction || character.currentPlan || character.currentIntent) return false;
      if (character.socialInstruction || character.movementTarget) return false;
      if (Math.max(character.hunger, character.thirst, character.tiredness) >= 50) return false;
      return !(character.dailyAgenda?.items.some(
        (item) => item.status === "planned" && world2.time >= item.plannedStart
      ) ?? false);
    }
    canReceiveCasualChat(character, world2) {
      if (this.isInConversation(character.id)) return false;
      if (character.currentAction) return false;
      const isSeekingSocialContact = character.currentIntent?.source.type === "need" && character.currentIntent.source.id === "social";
      if (!isSeekingSocialContact && (character.currentPlan || character.currentIntent)) return false;
      if (character.socialInstruction) return false;
      if (Math.max(character.hunger, character.thirst, character.tiredness) >= 70) return false;
      return !(character.dailyAgenda?.items.some(
        (item) => item.status === "planned" && world2.time >= item.plannedStart
      ) ?? false);
    }
    previewConversation(first, second, world2) {
      return {
        id: "preview",
        participantIds: [first.id, second.id],
        initiatorId: first.id,
        purpose: "social",
        startedAt: world2.time,
        lastInteractionAt: world2.time,
        purposeSatisfiedAt: world2.time,
        smallTalkCount: 0,
        status: "active"
      };
    }
    getActiveBetween(firstId, secondId) {
      return Array.from(this.conversations.values()).find(
        (conversation) => conversation.status === "active" && conversation.participantIds.includes(firstId) && conversation.participantIds.includes(secondId)
      );
    }
    ensureConversationAction(character, other, conversation, world2) {
      if (character.currentAction) return;
      character.currentAction = {
        id: `${character.id}-conversation-${conversation.id}`,
        type: `conversation:${other.id}`,
        startedAt: world2.time,
        expectedDuration: 240,
        expectedAt: world2.time + 240,
        tolerance: 240,
        expiresAt: world2.time + 480,
        status: "active",
        interruptionPolicy: "interruptible",
        isComplete: () => conversation.status !== "active",
        onTick: (minutes) => {
          character.socialNeed = Math.max(
            0,
            character.socialNeed - SOCIAL_NEED_RELIEF_PER_MINUTE * minutes
          );
        },
        onInterrupt: () => this.handleParticipantInterruption(conversation, character, other, world2)
      };
      logSimulation(world2, "event", `${character.name} stays to chat with ${other.name}`);
    }
    handleParticipantInterruption(conversation, character, other, world2) {
      if (conversation.status !== "active") return;
      const otherDecision = this.evaluator.evaluateContinue(other, character, conversation, world2);
      if (otherDecision.wantsToContinue) {
        this.endConversation(conversation, world2, "left", character.id, true, true);
      } else {
        this.endConversation(conversation, world2, "mutual", void 0, false, false);
      }
    }
    shouldSmallTalk(conversation, time) {
      return conversation.lastSmallTalkAt === void 0 || time - conversation.lastSmallTalkAt >= SMALL_TALK_INTERVAL_MINUTES;
    }
    performSmallTalk(conversation, first, second, world2) {
      conversation.lastSmallTalkAt = world2.time;
      conversation.lastInteractionAt = world2.time;
      conversation.smallTalkCount += 1;
      logSimulation(world2, "event", `${first.name} and ${second.name} make small talk`);
      this.events?.publish({
        type: "conversation-small-talk",
        time: world2.time,
        conversationId: conversation.id,
        participantIds: [...conversation.participantIds]
      });
      this.tryIntroduce(first, second, conversation, world2);
      this.tryIntroduce(second, first, conversation, world2);
    }
    tryIntroduce(speaker, listener, conversation, world2) {
      if (listener.knownPeople.has(speaker.id)) return;
      const introductionScore = 0.15 + speaker.personality.sociability * 0.35 + speaker.personality.assertiveness * 0.25 + speaker.personality.curiosity * 0.1 + speaker.personality.helpfulness * 0.1;
      if (introductionScore < 0.5) return;
      listener.addKnowledge({
        type: "person-identity",
        subjectId: speaker.id,
        polarity: "positive",
        sourceType: "conversation",
        sourceId: speaker.id,
        learnedAt: world2.time,
        confidence: 1
      });
      logSimulation(world2, "event", `${speaker.name} introduces themselves to ${listener.name}`);
      this.events?.publish({
        type: "name-shared",
        time: world2.time,
        conversationId: conversation.id,
        speakerId: speaker.id,
        listenerId: listener.id
      });
    }
    isAbruptExit(decision, conversation, world2) {
      if (decision.exitUrgency >= ABRUPT_EXIT_URGENCY) return true;
      const optionalDuration = conversation.purposeSatisfiedAt === void 0 ? 0 : world2.time - conversation.purposeSatisfiedAt;
      return optionalDuration <= 1;
    }
    endConversation(conversation, world2, reason, endedByCharacterId, abrupt, otherWantedToContinue) {
      if (conversation.status !== "active") return;
      conversation.status = "ended";
      conversation.endedAt = world2.time;
      conversation.endReason = reason;
      conversation.endedByCharacterId = endedByCharacterId;
      conversation.abrupt = abrupt;
      conversation.otherWantedToContinue = otherWantedToContinue;
      this.pairCooldowns.set(this.pairKey(...conversation.participantIds), world2.time);
      const first = this.findCharacter(conversation.participantIds[0]);
      const second = this.findCharacter(conversation.participantIds[1]);
      if (endedByCharacterId && otherWantedToContinue && first && second) {
        const ender = first.id === endedByCharacterId ? first : second;
        const other = first.id === endedByCharacterId ? second : first;
        logSimulation(world2, "event", `${ender.name} ends the conversation with ${other.name} while ${other.name} would have kept talking`);
      } else if (first && second) {
        logSimulation(world2, "debug", `${first.name} and ${second.name} end their conversation (${reason})`);
      }
      this.events?.publish({
        type: "conversation-ended",
        time: world2.time,
        conversationId: conversation.id,
        participantIds: [...conversation.participantIds],
        endedByCharacterId,
        reason,
        abrupt,
        otherWantedToContinue,
        duration: Math.max(0, world2.time - conversation.startedAt)
      });
    }
    isPairCoolingDown(firstId, secondId, time) {
      const endedAt = this.pairCooldowns.get(this.pairKey(firstId, secondId));
      return endedAt !== void 0 && time - endedAt < OPPORTUNISTIC_CHAT_COOLDOWN_MINUTES;
    }
    pairKey(firstId, secondId) {
      return [firstId, secondId].sort().join(":");
    }
    areWithinConversationRange(first, second, world2 = this.world) {
      return arePositionsWithinConversationRange(first.position, second.position, world2);
    }
    findCharacter(id) {
      return this.world.characters.find((character) => character.id === id);
    }
  };

  // src/social/ConversationTopicSystem.ts
  var ConversationTopicSystem = class {
    constructor(world2, conversations, social, opinions = new PersonOpinionSystem()) {
      this.world = world2;
      this.conversations = conversations;
      this.social = social;
      this.opinions = opinions;
      this.discussedConversationIds = /* @__PURE__ */ new Set();
    }
    handle(event) {
      if (event.type !== "conversation-small-talk") return;
      if (this.discussedConversationIds.has(event.conversationId)) return;
      const conversation = this.conversations.getActiveConversation(event.participantIds[0]);
      if (!conversation || conversation.id !== event.conversationId) return;
      if (conversation.purpose !== "social" || conversation.smallTalkCount < 2) return;
      const first = this.findCharacter(event.participantIds[0]);
      const second = this.findCharacter(event.participantIds[1]);
      if (!first || !second) return;
      const option = [
        ...this.getOptions(first, second),
        ...this.getOptions(second, first)
      ].sort(
        (left, right) => right.score - left.score || left.asker.id.localeCompare(right.asker.id) || left.subject.id.localeCompare(right.subject.id)
      )[0];
      if (!option) return;
      const result = this.social.askAboutPerson(option.asker, option.responder, option.subject, this.world);
      if (result.type === "opinion" || result.type === "does-not-know" || result.type === "insufficient-experience") {
        this.discussedConversationIds.add(event.conversationId);
      }
    }
    getOptions(asker, responder) {
      return this.world.characters.filter((subject) => subject.id !== asker.id && subject.id !== responder.id).filter((subject) => asker.knownPeople.has(subject.id) && responder.knownPeople.has(subject.id)).map((subject) => {
        const result = this.opinions.formOpinion(responder, subject);
        if (result.type !== "opinion") return void 0;
        return {
          asker,
          responder,
          subject,
          score: asker.personality.curiosity * 0.25 + result.report.confidence * 0.5 + result.report.familiarity * 0.25
        };
      }).filter((option) => option !== void 0);
    }
    findCharacter(id) {
      return this.world.characters.find((character) => character.id === id);
    }
  };

  // src/services/ServiceDiscoveryExecution.ts
  function registerContextualServiceDiscoveryHandlers(registry, social, movement) {
    registry.register(
      "ask-food-service-context",
      (plan, character, world2) => askFoodServiceContext(plan, character, world2, social, movement)
    );
    registry.register(
      "wait-at-food-service-point",
      (plan, character, world2) => waitAtFoodServicePoint(plan, character, world2, social, movement)
    );
  }
  function askFoodServiceContext(plan, character, world2, social, movement) {
    const context = getContext(character, plan, world2.time);
    if (!context) return { status: "failed" };
    let target = plan.executionState?.servicePersonTarget;
    if (!target) {
      const memory = getContextualServicePersonMemory(character, context.point, context.query, world2.time);
      if (!memory) return { status: "failed" };
      target = personTargetFromMemory(memory, character);
      if (!target) return { status: "failed" };
      plan.executionState = {
        ...plan.executionState ?? {},
        servicePersonTarget: target,
        servicePlaceId: context.place.id
      };
    }
    const person = resolveSubjectivePersonTarget(character, world2, target);
    if (!person) return { status: "failed" };
    if (!arePositionsWithinConversationRange(character.position, person.position, world2)) {
      const expectedDuration = movement.estimateApproachDuration(
        character,
        target.position,
        CONVERSATION_RANGE_METRES,
        world2
      );
      if (expectedDuration === void 0) return { status: "failed" };
      movement.startWithinRangeOfPosition(character, target.position, CONVERSATION_RANGE_METRES);
      return startAction3(
        character,
        world2,
        `approach-service-conversation:${targetLabel2(target)}`,
        expectedDuration,
        Math.max(0.5, expectedDuration * 0.5),
        () => {
          const current = resolveSubjectivePersonTarget(character, world2, target);
          return !!current && arePositionsWithinConversationRange(character.position, current.position, world2);
        }
      );
    }
    const result = social.askPerson(character, person, context.query, world2);
    if (result.type !== "information") {
      if (result.type === "does-not-know") {
        rememberUnhelpfulInquiry(character, target, context.query, world2.time);
      }
      return { status: "failed" };
    }
    if (result.query.type === "service-provider") {
      const providerId = result.query.subjectId;
      const providerContext = result.query.context ?? {
        service: "food",
        placeId: context.place.id
      };
      const immediatelyEligible = isCustomerServiceProviderEligible(
        character,
        providerId,
        providerContext,
        world2.time
      );
      const temporarilyAwayFromOpenPoint = context.point.state !== "closed" && context.point.providerOccupied === false && !hasRecentServiceProviderUnavailable(
        character,
        providerId,
        providerContext,
        world2.time
      );
      if (!immediatelyEligible && !temporarilyAwayFromOpenPoint) {
        rememberUnhelpfulInquiry(character, target, context.query, world2.time);
        return { status: "failed" };
      }
      if (!hasCurrentLocationKnowledge(character, providerId)) {
        const locationResult = social.askPerson(
          character,
          person,
          { type: "person-location", subjectId: providerId },
          world2
        );
        if (locationResult.type !== "information") {
          rememberUnhelpfulInquiry(character, target, context.query, world2.time);
          return { status: "failed" };
        }
      }
      return hasCurrentLocationKnowledge(character, providerId) ? { status: "completed" } : { status: "failed" };
    }
    if (result.query.type === "person-location") {
      return hasCurrentLocationKnowledge(character, result.query.subjectId) ? { status: "completed" } : { status: "failed" };
    }
    return { status: "failed" };
  }
  function waitAtFoodServicePoint(plan, character, world2, social, movement) {
    const context = getContext(character, plan, world2.time);
    if (!context) return { status: "failed" };
    const personMemory = getContextualServicePersonMemory(character, context.point, context.query, world2.time);
    if (personMemory) {
      const target = personTargetFromMemory(personMemory, character);
      if (!target) return { status: "failed" };
      plan.executionState = {
        ...plan.executionState ?? {},
        servicePersonTarget: target,
        servicePlaceId: context.place.id
      };
      return askFoodServiceContext(plan, character, world2, social, movement);
    }
    if (hasRecentServicePointWait(character, context.point.id, world2.time)) {
      return { status: "failed" };
    }
    rememberServicePointWait(character, context.point.id, world2.time);
    const travelDuration = movement.estimateTravelDuration(character, context.point.customerPosition, world2);
    if (travelDuration === void 0) return { status: "failed" };
    const waitMinutes = 10;
    movement.start(character, context.point.customerPosition);
    logSimulation(world2, "event", `${character.name} waits at ${context.point.id} for someone who may provide food service`);
    return startAction3(
      character,
      world2,
      `wait-at-service-point:${context.point.id}`,
      travelDuration + waitMinutes,
      1,
      () => {
        const refreshed = getContext(character, plan, world2.time);
        if (!refreshed) return false;
        const memory = getContextualServicePersonMemory(character, refreshed.point, refreshed.query, world2.time);
        if (!memory) return false;
        const target = personTargetFromMemory(memory, character);
        if (!target) return false;
        const queryOverride = {
          type: "service-provider",
          subjectId: "*",
          context: { service: "food", placeId: refreshed.place.id }
        };
        plan.executionState = {
          ...plan.executionState ?? {},
          servicePersonTarget: target,
          servicePlaceId: refreshed.place.id,
          serviceQueryOverride: queryOverride
        };
        character.movementTarget = void 0;
        return true;
      }
    );
  }
  function getContext(character, plan, time) {
    const selectedPlaceId = getSelectedPlaceId(plan);
    const place = selectedPlaceId ? character.knowledge.filter(
      (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === selectedPlaceId && knowledge.polarity === "positive" && knowledge.context?.service === "food" && knowledge.position !== void 0
    ).map((knowledge) => ({ id: knowledge.subjectId, service: "food", position: { ...knowledge.position } }))[0] : nearestKnownServicePlace(character, "food");
    if (!place) return void 0;
    const override = asKnowledgeQuery(plan.executionState?.serviceQueryOverride);
    const query = override ?? serviceDiscoveryQuery(character, "food", place.id, void 0, time);
    if (!query) return void 0;
    const point = getObservedServicePoint(character, "food", place.id);
    return point ? { query, place, point } : void 0;
  }
  function getSelectedPlaceId(plan) {
    if (typeof plan.executionState?.servicePlaceId === "string") {
      return plan.executionState.servicePlaceId;
    }
    if (plan.target?.type === "location" && typeof plan.target.subjectId === "string") {
      return plan.target.subjectId;
    }
    return void 0;
  }
  function hasCurrentLocationKnowledge(character, providerId) {
    if (providerId === character.id) return true;
    return character.knowledge.some(
      (knowledge) => knowledge.type === "person-location" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.position !== void 0
    );
  }
  function personTargetFromMemory(memory, character) {
    const position = memory.context?.position;
    if (!isPosition16(position)) return void 0;
    const personId = memory.context?.identifiedPersonId;
    const distance10 = Math.hypot(position.x - character.position.x, position.y - character.position.y);
    if (typeof personId === "string") {
      return {
        type: "person",
        personId,
        knowledge: "known",
        position: { ...position },
        distance: distance10
      };
    }
    return {
      type: "person",
      observationId: memory.subjectId,
      knowledge: "observed",
      position: { ...position },
      distance: distance10
    };
  }
  function rememberUnhelpfulInquiry(character, target, query, time) {
    const sourceKey = target.personId ? `person:${target.personId}` : target.observationId ? `observation:${target.observationId}` : void 0;
    if (!sourceKey) return;
    const contextKey = knowledgeQueryContextKey(query);
    const subjectId = `${query.type}:${query.subjectId}:${contextKey}:${sourceKey}`;
    character.memory.remember({
      id: `${character.id}:knowledge-inquiry:${subjectId}`,
      type: "knowledge-inquiry",
      subjectId,
      persistence: 180,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 1,
      context: {
        knowledgeType: query.type,
        knowledgeSubjectId: query.subjectId,
        knowledgeContextKey: contextKey,
        sourceKey
      }
    });
  }
  function asKnowledgeQuery(value) {
    if (!value || typeof value !== "object") return void 0;
    const query = value;
    return typeof query.type === "string" && typeof query.subjectId === "string" ? query : void 0;
  }
  function startAction3(character, world2, type, expectedDuration, tolerance, isComplete) {
    character.currentAction = {
      id: `${character.id}-${type}-${world2.time}`,
      type,
      startedAt: world2.time,
      expectedDuration,
      expectedAt: world2.time + expectedDuration,
      tolerance,
      expiresAt: world2.time + expectedDuration + tolerance,
      status: "active",
      interruptionPolicy: "atomic",
      isComplete
    };
    logSimulation(world2, "event", `${character.name} starts ${type}; expected ${expectedDuration}m`);
    return { status: "started" };
  }
  function isPosition16(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function targetLabel2(target) {
    return target.personId ?? target.observationId ?? "unknown-person";
  }

  // src/services/ServiceProviderExecution.ts
  var MINUTES_PER_DAY20 = 24 * 60;
  var MORNING_RECONSIDERATION_MINUTE3 = 6 * 60;
  var CLOSED_PROVIDER_RETRY_MINUTES = 30;
  function registerServiceProviderHandlers(registry, social, movement) {
    registry.register(
      "ask-service-provider",
      (plan, character, world2) => askServiceProvider(plan, character, world2, social)
    );
    registry.register(
      "go-to-service-provider-location",
      (plan, character, world2) => goToServiceProvider(plan, character, world2, movement)
    );
    registry.register(
      "use-food-provider",
      (plan, character, world2) => completeFoodProviderOpportunity(plan, character, world2)
    );
    registry.register(
      "investigate-advertised-food-provider",
      (plan, character, world2) => investigateAdvertisedFoodProvider(plan, character, world2, movement)
    );
  }
  function askServiceProvider(plan, character, world2, social) {
    const target = plan.target;
    if (target?.type !== "person" || !plan.goal) return { status: "failed" };
    const person = resolveSubjectivePersonTarget(character, world2, target);
    if (!person || !arePositionsWithinConversationRange(character.position, person.position, world2)) {
      return { status: "failed" };
    }
    const query = serviceProviderQueryForGoal(character, plan.goal, world2.time, world2.minuteOfDay);
    if (!query) return { status: "failed" };
    const result = social.askPerson(character, person, query, world2);
    if (result.type !== "information") {
      if (result.type === "does-not-know") {
        rememberUnhelpfulInquiry2(character, target, query, world2.time);
      }
      return { status: "failed" };
    }
    if (result.query.type === "service-provider") {
      rememberReportedProviderAvailability(character, person, result.query, world2);
      const providerId = result.query.subjectId;
      const requestedContext = serviceContextFromGoal(plan.goal);
      const answeredContext = result.query.context ?? requestedContext;
      if (!requestedContext || !answeredContext || !isProviderContextUsableNow(character, providerId, answeredContext, world2.time, world2.minuteOfDay)) {
        rememberUnhelpfulInquiry2(character, target, query, world2.time);
        return { status: "failed" };
      }
      if (!bestKnownProviderLocation(character, providerId)) {
        const locationResult = social.askPerson(
          character,
          person,
          { type: "person-location", subjectId: providerId },
          world2
        );
        if (locationResult.type !== "information") {
          rememberUnhelpfulInquiry2(character, target, query, world2.time);
          return { status: "failed" };
        }
      }
    }
    return resolveServiceProviderTarget(plan, character, world2.time, world2.minuteOfDay) ? { status: "completed" } : { status: "failed" };
  }
  function goToServiceProvider(plan, character, world2, movement) {
    const target = plan.target?.type === "location" ? resolveSelectedServiceProviderTarget(plan, character, world2.time, world2.minuteOfDay) : resolveServiceProviderTarget(plan, character, world2.time, world2.minuteOfDay);
    if (!target) return { status: "failed" };
    const distance10 = Math.hypot(
      target.position.x - character.position.x,
      target.position.y - character.position.y
    );
    if (distance10 < 0.1) return { status: "completed" };
    const expectedDuration = movement.estimateTravelDuration(character, target.position, world2);
    if (expectedDuration === void 0) return { status: "failed" };
    movement.start(character, target.position);
    character.currentAction = {
      id: `${character.id}-go-to-service-provider:${target.subjectId ?? "unknown"}-${world2.time}`,
      type: `go-to-service-provider:${target.subjectId ?? "unknown"}`,
      startedAt: world2.time,
      expectedDuration,
      expectedAt: world2.time + expectedDuration,
      tolerance: Math.max(0.5, expectedDuration * 0.5),
      expiresAt: world2.time + expectedDuration + Math.max(0.5, expectedDuration * 0.5),
      status: "active",
      interruptionPolicy: "atomic",
      isComplete: () => Math.hypot(
        target.position.x - character.position.x,
        target.position.y - character.position.y
      ) < 0.1
    };
    logSimulation(world2, "event", `${character.name} travels to service provider ${target.subjectId ?? "unknown"}`);
    return { status: "started" };
  }
  function completeFoodProviderOpportunity(plan, character, world2) {
    const selected = plan.target?.type === "location" ? resolveSelectedServiceProviderTarget(plan, character, world2.time, world2.minuteOfDay) : void 0;
    const target = selected ?? resolveServiceProviderTarget(plan, character, world2.time, world2.minuteOfDay);
    if (!target) return { status: "failed" };
    plan.target = target;
    return { status: "completed" };
  }
  function investigateAdvertisedFoodProvider(plan, character, world2, movement) {
    const contextualGoal = plan.prerequisites[0]?.goal;
    const context = contextualGoal ? serviceContextFromGoal(contextualGoal) : void 0;
    if (context?.service !== "food" || !context.placeId) return { status: "failed" };
    const target = resolveProviderAtServicePlace(
      character,
      context,
      world2.time,
      world2.minuteOfDay
    );
    if (!target) return { status: "failed" };
    plan.target = target;
    return goToServiceProvider(plan, character, world2, movement);
  }
  function resolveProviderAtServicePlace(character, context, time, minuteOfDay) {
    if (!context.placeId) return void 0;
    const provider = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, context) && isProviderContextUsableNow(
        character,
        knowledge.subjectId,
        knowledge.context ?? context,
        time,
        minuteOfDay
      )
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    if (!provider) return void 0;
    const servicePoint = getObservedServicePoint(character, context.service, context.placeId);
    if (servicePoint) {
      return {
        type: "location",
        subjectId: provider.subjectId,
        position: { ...servicePoint.customerPosition }
      };
    }
    const place = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-place" && knowledge.subjectId === context.placeId && knowledge.polarity === "positive" && knowledge.context?.service === context.service && knowledge.position !== void 0
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    if (place?.position) {
      return {
        type: "location",
        subjectId: provider.subjectId,
        position: { ...place.position }
      };
    }
    const position = bestKnownProviderLocation(character, provider.subjectId);
    return position ? {
      type: "location",
      subjectId: provider.subjectId,
      position: { ...position }
    } : void 0;
  }
  function resolveSelectedServiceProviderTarget(plan, character, time, minuteOfDay) {
    const target = plan.target;
    if (target?.type !== "location" || !target.subjectId || !plan.goal) return void 0;
    const expectedContext = serviceContextFromGoal(plan.goal);
    if (!expectedContext) return void 0;
    const providerContext = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === target.subjectId && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, expectedContext)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0]?.context ?? expectedContext;
    if (!isProviderContextUsableNow(character, target.subjectId, providerContext, time, minuteOfDay)) {
      return void 0;
    }
    return {
      type: "location",
      subjectId: target.subjectId,
      position: { ...target.position }
    };
  }
  function resolveServiceProviderTarget(plan, character, time, minuteOfDay) {
    return resolveServiceProviderTargets(plan, character, time, minuteOfDay)[0];
  }
  function resolveServiceProviderTargets(plan, character, time, minuteOfDay) {
    if (!plan.goal) return [];
    const expectedContext = serviceContextFromGoal(plan.goal);
    if (!expectedContext) return [];
    return character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && serviceContextMatches(knowledge.context, expectedContext) && isProviderContextUsableNow(
        character,
        knowledge.subjectId,
        knowledge.context ?? expectedContext,
        time,
        minuteOfDay
      )
    ).map((knowledge) => ({
      providerId: knowledge.subjectId,
      position: bestKnownProviderLocation(character, knowledge.subjectId)
    })).filter(
      (entry) => entry.position !== void 0
    ).sort((first, second) => {
      const firstDistance = Math.hypot(
        first.position.x - character.position.x,
        first.position.y - character.position.y
      );
      const secondDistance = Math.hypot(
        second.position.x - character.position.x,
        second.position.y - character.position.y
      );
      return firstDistance - secondDistance;
    }).map((provider) => ({
      type: "location",
      subjectId: provider.providerId,
      position: { ...provider.position }
    }));
  }
  function isProviderContextUsableNow(character, providerId, context, time, minuteOfDay) {
    if (context.placeId && !isServicePlaceWorthTryingNow(character, context.placeId, context.service, time, minuteOfDay)) return false;
    return isCustomerServiceProviderEligible(character, providerId, context, time);
  }
  function rememberReportedProviderAvailability(asker, speaker, query, world2) {
    if (query.type !== "service-provider" || query.subjectId !== speaker.id || !query.context?.placeId) return;
    const placeId = query.context.placeId;
    const operation = speaker.memory.getByType("service-point-operation").filter((memory) => memory.subjectId === placeId).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
    if (operation?.context?.state !== "closed") return;
    const soldOut = typeof operation.context?.soldOutAt === "number" && typeof operation.context?.soldOutItemType === "string";
    const unavailableUntil = soldOut ? nextMorningRetryAt2(world2.time, world2.minuteOfDay) : world2.time + CLOSED_PROVIDER_RETRY_MINUTES;
    rememberServicePlaceUnavailable(asker, placeId, world2.time, unavailableUntil);
    logSimulation(
      world2,
      "event",
      soldOut ? `${speaker.name} tells ${asker.name} ${placeId} is sold out for the day` : `${speaker.name} tells ${asker.name} ${placeId} is currently closed`
    );
  }
  function nextMorningRetryAt2(time, minuteOfDay) {
    const normalized = (Math.floor(minuteOfDay) % MINUTES_PER_DAY20 + MINUTES_PER_DAY20) % MINUTES_PER_DAY20;
    const delta = normalized < MORNING_RECONSIDERATION_MINUTE3 ? MORNING_RECONSIDERATION_MINUTE3 - normalized : MINUTES_PER_DAY20 - normalized + MORNING_RECONSIDERATION_MINUTE3;
    return time + Math.max(1, delta);
  }
  function bestKnownProviderLocation(character, providerId) {
    if (providerId === character.id) return { ...character.position };
    const observed = character.memory.getByType("person-observed").filter((memory) => memory.context?.identifiedPersonId === providerId).filter((memory) => isPosition17(memory.context?.position)).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
    const known = character.knowledge.filter(
      (knowledge) => knowledge.type === "person-location" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.position !== void 0
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    if (observed && (!known || observed.lastObservedAt >= known.learnedAt)) {
      return { ...observed.context.position };
    }
    return known?.position ? { ...known.position } : void 0;
  }
  function rememberUnhelpfulInquiry2(character, target, query, time) {
    const sourceKey = target.personId ? `person:${target.personId}` : target.observationId ? `observation:${target.observationId}` : void 0;
    if (!sourceKey) return;
    const contextKey = knowledgeQueryContextKey(query);
    const subjectId = `${query.type}:${query.subjectId}:${contextKey}:${sourceKey}`;
    character.memory.remember({
      id: `${character.id}:knowledge-inquiry:${subjectId}`,
      type: "knowledge-inquiry",
      subjectId,
      persistence: 180,
      confidence: 1,
      createdAt: time,
      lastObservedAt: time,
      importance: 1,
      context: {
        knowledgeType: query.type,
        knowledgeSubjectId: query.subjectId,
        knowledgeContextKey: contextKey,
        sourceKey
      }
    });
  }
  function isPosition17(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }

  // src/services/PreparedMealExecution.ts
  var PREPARED_MEAL_PRICE = 5;
  var LEGACY_PREPARATION_MINUTES = 10;
  var PLATING_MINUTES = 2;
  var CUSTOMER_MAX_WAIT_MINUTES = 60;
  function registerPreparedMealHandlers(registry, commerce, social, accessibility, movement) {
    registry.register(
      "buy-food",
      (plan, character, world2) => acquireFood(plan, character, world2, social, movement)
    );
    registry.register(
      "serve-prepared-meal-request",
      (plan, character, world2) => servePreparedMealRequest(plan, character, world2, commerce, social, accessibility, movement)
    );
  }
  function acquireFood(plan, buyer, world2, social, movement) {
    const target = plan.target;
    if (target?.type !== "location" || target.subjectId === void 0) return { status: "failed" };
    const providerId = target.subjectId;
    const serviceContext = foodServiceContext2(buyer, providerId);
    const existingRequestId = plan.executionState?.purchaseRequestId;
    if (typeof existingRequestId === "string") {
      const existingRequest = buyer.requests.getOutgoingById(existingRequestId, world2.time);
      if (!existingRequest) return { status: "failed" };
      if (existingRequest.status === "completed") {
        return buyer.physical.getAll().some(
          (possession) => isDirectlyEdibleFood(possession.item)
        ) ? { status: "completed" } : { status: "failed" };
      }
      if (isTerminalFailure5(existingRequest)) {
        rememberRefusal2(buyer, providerId, serviceContext, existingRequest, world2.time);
        releaseRequestResource(existingRequest, buyer, world2);
        return { status: "failed" };
      }
      return waitForFoodRequest(
        plan,
        buyer,
        world2,
        existingRequest.id,
        movement,
        providerId,
        serviceContext
      );
    }
    const resolved = resolveServiceInteractionTarget(buyer, target, world2, social);
    if (resolved.status === "identity-checked") return { status: "failed" };
    if (resolved.status === "not-observed") {
      rememberServiceProviderUnavailable(
        buyer,
        providerId,
        serviceContext,
        world2.time,
        "not-found",
        15
      );
      return { status: "failed" };
    }
    const seller = resolved.provider;
    const preparedMealContext = buyer.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.context?.service === "food" && knowledge.context?.offering === "prepared-meal" && typeof knowledge.context.placeId === "string"
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0]?.context;
    const request = preparedMealContext?.offering === "prepared-meal" && typeof preparedMealContext.placeId === "string" ? social.sendRequest(
      buyer,
      seller,
      "prepared-meal",
      {
        service: "food",
        offering: "prepared-meal",
        placeId: preparedMealContext.placeId,
        quantity: 1,
        unitPrice: PREPARED_MEAL_PRICE
      },
      world2,
      45
    ) : social.sendRequest(
      buyer,
      seller,
      "purchase",
      { itemType: "food", quantity: 1, unitPrice: 3 },
      world2,
      45
    );
    if (!request) return { status: "failed" };
    plan.executionState = { ...plan.executionState ?? {}, purchaseRequestId: request.id };
    logSimulation(
      world2,
      "event",
      request.type === "prepared-meal" ? `${buyer.name} orders a prepared meal from ${seller.name}` : `${buyer.name} requests food from ${seller.name}`
    );
    return waitForFoodRequest(
      plan,
      buyer,
      world2,
      request.id,
      movement,
      providerId,
      serviceContext
    );
  }
  function waitForFoodRequest(plan, buyer, world2, requestId, movement, providerId, serviceContext) {
    const isFinished = () => {
      const request = buyer.requests.getOutgoingById(requestId, world2.time);
      if (!request) {
        plan.failed = true;
        return true;
      }
      if (request.type === "prepared-meal" && request.status === "accepted") {
        progressPreparedMealCustomer(plan, buyer, request, world2, movement);
        const refreshed2 = buyer.requests.getOutgoingById(requestId, world2.time);
        if (refreshed2 && world2.time >= refreshed2.createdAt + CUSTOMER_MAX_WAIT_MINUTES) {
          cancelRequest(refreshed2, buyer, world2);
          plan.failed = true;
          return true;
        }
      }
      const refreshed = buyer.requests.getOutgoingById(requestId, world2.time);
      if (!refreshed) {
        plan.failed = true;
        return true;
      }
      if (refreshed.status === "completed") return true;
      if (isTerminalFailure5(refreshed)) {
        rememberRefusal2(buyer, providerId, serviceContext, refreshed, world2.time);
        releaseRequestResource(refreshed, buyer, world2);
        plan.failed = true;
        return true;
      }
      return false;
    };
    if (isFinished()) return plan.failed ? { status: "failed" } : { status: "completed" };
    return startAction4(
      buyer,
      world2,
      `wait-for-${buyer.requests.getOutgoingById(requestId, world2.time)?.type ?? "food"}:${requestId}`,
      30,
      30,
      isFinished
    );
  }
  function progressPreparedMealCustomer(plan, buyer, request, world2, movement) {
    const fulfilment = request.fulfilment;
    if (!fulfilment?.resourceId || !fulfilment.resourcePosition) return;
    const distance10 = Math.hypot(
      fulfilment.resourcePosition.x - buyer.position.x,
      fulfilment.resourcePosition.y - buyer.position.y
    );
    if (fulfilment.stage === "awaiting-seat") {
      if (distance10 > 0.1) {
        movement.start(buyer, fulfilment.resourcePosition);
        return;
      }
      const next = {
        ...fulfilment,
        stage: "preparing",
        expectedAt: void 0
      };
      syncFulfilment2(request.id, buyer, request.toCharacterId, next, world2);
      if (plan.executionState?.preparedMealSeatId !== fulfilment.resourceId) {
        plan.executionState = {
          ...plan.executionState ?? {},
          preparedMealSeatId: fulfilment.resourceId
        };
        logSimulation(world2, "event", `${buyer.name} takes table ${fulfilment.resourceId}`);
      }
    }
  }
  function servePreparedMealRequest(plan, seller, world2, commerce, social, accessibility, movement) {
    const requestId = plan.goal?.parameters?.requestId;
    if (typeof requestId !== "string") return { status: "failed" };
    const request = seller.requests.getIncomingById(requestId, world2.time);
    if (!request || isTerminalFailure5(request)) return { status: "failed" };
    if (request.status === "completed") return { status: "completed" };
    if (request.type !== "prepared-meal") return { status: "failed" };
    const buyer = world2.characters.find((candidate) => candidate.id === request.fromCharacterId);
    if (!buyer) {
      seller.requests.updateIncomingStatus(requestId, "cancelled");
      releaseRequestResource(request, void 0, world2);
      return { status: "failed" };
    }
    const service = request.parameters?.service;
    const offering = request.parameters?.offering;
    const placeId = request.parameters?.placeId;
    const quantity = request.parameters?.quantity;
    const unitPrice = request.parameters?.unitPrice;
    if (service !== "food" || offering !== "prepared-meal" || typeof placeId !== "string" || quantity !== 1 || typeof unitPrice !== "number") {
      refuseRequest(seller, buyer, request, world2, social);
      return { status: "failed" };
    }
    if (request.status === "pending") {
      if (!arePositionsWithinConversationRange(buyer.position, seller.position, world2)) {
        seller.requests.updateIncomingStatus(requestId, "cancelled");
        return { status: "failed" };
      }
      if (!findPreparedMealStock(seller)) {
        refuseRequest(seller, buyer, request, world2, social);
        logSimulation(world2, "event", `${seller.name} cannot accept ${buyer.name}'s meal order; no prepared meal stock`);
        return { status: "failed" };
      }
      const assigned = assignDiningSeat(buyer, placeId, world2);
      if (!assigned) {
        refuseRequest(seller, buyer, request, world2, social);
        logSimulation(world2, "event", `${seller.name} cannot accept ${buyer.name}'s meal order; no table is available`);
        return { status: "failed" };
      }
      if (!social.respondToRequest(seller, buyer, requestId, "accepted", world2)) {
        world2.resourceUsage.release(assigned.id, buyer.id);
        return { status: "failed" };
      }
      const fulfilment2 = {
        stage: "awaiting-seat",
        resourceId: assigned.id,
        resourcePosition: { ...assigned.position }
      };
      syncFulfilment2(requestId, seller, buyer.id, fulfilment2, world2);
      logSimulation(world2, "event", `${seller.name} accepts ${buyer.name}'s meal order and assigns ${assigned.id}`);
      return { status: "completed" };
    }
    const current = seller.requests.getIncomingById(requestId, world2.time);
    if (!current?.fulfilment) return { status: "completed" };
    const fulfilment = current.fulfilment;
    if (fulfilment.stage === "awaiting-seat") {
      return { status: "completed" };
    }
    if (fulfilment.stage === "preparing") {
      if (fulfilment.expectedAt !== void 0) {
        return { status: "completed" };
      }
      const stock = findPreparedMealStock(seller);
      if (!stock) {
        cancelRequest(current, buyer, world2);
        return { status: "failed" };
      }
      if (!accessibility.canAccess(seller, stock)) {
        return retrieveMealStock(seller, stock.item.id, world2, accessibility, movement);
      }
      const physicalDish = isPreparedMealDish(stock.item);
      const preparationMinutes = physicalDish ? PLATING_MINUTES : LEGACY_PREPARATION_MINUTES;
      const readyAt = world2.time + preparationMinutes;
      syncFulfilment2(
        requestId,
        seller,
        buyer.id,
        { ...fulfilment, expectedAt: readyAt },
        world2
      );
      logSimulation(
        world2,
        "event",
        physicalDish ? `${seller.name} begins plating ${stock.item.food?.dishId ?? "a prepared meal"} for ${buyer.name}` : `${seller.name} begins preparing ${buyer.name}'s meal`
      );
      return startAction4(
        seller,
        world2,
        `prepare-meal:${requestId}`,
        preparationMinutes,
        2,
        () => {
          const latest = seller.requests.getIncomingById(requestId, world2.time);
          if (!latest || latest.status !== "accepted") return true;
          if (world2.time < readyAt) return false;
          const currentStock = seller.physical.get(stock.item.id);
          if (!currentStock) return true;
          let mealId;
          if (isPreparedMealDish(currentStock.item)) {
            if (currentStock.location.type !== "hand") {
              const leftOccupied = seller.physical.getAll().some(
                (item) => item.location.type === "hand" && item.location.hand === "left"
              );
              seller.physical.move(
                currentStock.item.id,
                { type: "hand", hand: leftOccupied ? "right" : "left" }
              );
            }
            mealId = currentStock.item.id;
          } else {
            const hand = currentStock.location.type === "hand" ? currentStock.location.hand : "right";
            seller.physical.remove(stock.item.id);
            const meal = {
              id: `${requestId}-meal`,
              type: "food",
              size: "small",
              physical: { carryHands: 1, useHands: 1 },
              food: {
                kind: "prepared-meal",
                directlyEdible: { hungerRelief: 90 }
              }
            };
            seller.physical.add(meal, { type: "hand", hand });
            mealId = meal.id;
          }
          const latestFulfilment = latest.fulfilment ?? fulfilment;
          syncFulfilment2(
            requestId,
            seller,
            buyer.id,
            {
              ...latestFulfilment,
              stage: "ready",
              expectedAt: void 0,
              itemId: mealId
            },
            world2
          );
          logSimulation(world2, "event", `${seller.name} finishes preparing ${buyer.name}'s meal`);
          return true;
        }
      );
    }
    if (fulfilment.stage === "ready" || fulfilment.stage === "delivering") {
      if (!fulfilment.resourcePosition || !fulfilment.itemId) return { status: "failed" };
      const meal = seller.physical.get(fulfilment.itemId);
      if (!meal) return { status: "failed" };
      if (!arePositionsWithinConversationRange(seller.position, fulfilment.resourcePosition, world2)) {
        if (fulfilment.stage !== "delivering") {
          syncFulfilment2(
            requestId,
            seller,
            buyer.id,
            { ...fulfilment, stage: "delivering" },
            world2
          );
          logSimulation(world2, "event", `${seller.name} carries ${buyer.name}'s meal to ${fulfilment.resourceId}`);
        }
        const travelDuration = movement.estimateApproachDuration(
          seller,
          fulfilment.resourcePosition,
          CONVERSATION_RANGE_METRES,
          world2
        );
        if (travelDuration === void 0) return { status: "failed" };
        movement.startWithinRangeOfPosition(seller, fulfilment.resourcePosition, CONVERSATION_RANGE_METRES);
        return startAction4(
          seller,
          world2,
          `deliver-meal:${requestId}`,
          travelDuration,
          Math.max(0.5, travelDuration * 0.5),
          () => arePositionsWithinConversationRange(
            seller.position,
            fulfilment.resourcePosition,
            world2
          )
        );
      }
      if (!arePositionsWithinConversationRange(buyer.position, seller.position, world2)) {
        return { status: "completed" };
      }
      const result = commerce.purchase({
        buyer,
        seller,
        itemId: "food",
        quantity: 1,
        unitPrice,
        specificItemIds: [fulfilment.itemId]
      }, world2);
      if (!result.success) {
        cancelRequest(current, buyer, world2);
        logSimulation(world2, "event", `${seller.name} cannot complete meal order ${requestId}: ${result.reason ?? "purchase failed"}`);
        return { status: "failed" };
      }
      if (!social.respondToRequest(seller, buyer, requestId, "completed", world2)) {
        return { status: "failed" };
      }
      logSimulation(
        world2,
        "event",
        `${seller.name} serves ${buyer.name}'s ${meal.item.food?.dishId ?? "prepared meal"} at ${fulfilment.resourceId}`
      );
      return { status: "completed" };
    }
    return { status: "failed" };
  }
  function findPreparedMealStock(seller) {
    const possessions = seller.physical.getAll();
    const preparedMeals = possessions.filter((possession) => isPreparedMealDish(possession.item)).sort(
      (first, second) => (second.item.food?.directlyEdible?.hungerRelief ?? 0) - (first.item.food?.directlyEdible?.hungerRelief ?? 0)
    );
    return preparedMeals[0] ?? possessions.find((possession) => possession.item.type === "meal-stock");
  }
  function isPreparedMealDish(item) {
    return item.type === "food" && item.food?.kind === "prepared-meal" && isDirectlyEdibleFood(item);
  }
  function assignDiningSeat(buyer, placeId, world2) {
    const candidates = world2.objects.filter(
      (object) => object.usableResource?.type === "dining-seat" && object.usableResource.placeId === placeId
    ).sort((first, second) => {
      const firstDistance = Math.hypot(first.position.x - buyer.position.x, first.position.y - buyer.position.y);
      const secondDistance = Math.hypot(second.position.x - buyer.position.x, second.position.y - buyer.position.y);
      return firstDistance - secondDistance;
    });
    for (const candidate of candidates) {
      const capacity = candidate.usableResource.capacity;
      if (world2.resourceUsage.claim(candidate.id, buyer.id, capacity)) return candidate;
    }
    return void 0;
  }
  function retrieveMealStock(seller, itemId, world2, accessibility, movement) {
    const possession = seller.physical.get(itemId);
    if (!possession || possession.location.type !== "container" || seller.movementSpeed <= 0) {
      return { status: "failed" };
    }
    const container = world2.getObject(possession.location.containerId);
    if (!container) return { status: "failed" };
    const returnPosition = { ...seller.position };
    const outboundDuration = movement.estimateTravelDurationBetween(
      seller.position,
      container.position,
      seller.movementSpeed,
      world2
    );
    const returnDuration = movement.estimateTravelDurationBetween(
      container.position,
      returnPosition,
      seller.movementSpeed,
      world2
    );
    if (outboundDuration === void 0 || returnDuration === void 0) {
      return { status: "failed" };
    }
    const expectedDuration = outboundDuration + returnDuration;
    let retrieved = false;
    movement.start(seller, container.position);
    return startAction4(
      seller,
      world2,
      `retrieve-meal-stock:${itemId}`,
      expectedDuration,
      Math.max(1, expectedDuration * 0.5),
      () => {
        if (!retrieved) {
          const atContainer = Math.hypot(seller.position.x - container.position.x, seller.position.y - container.position.y) <= 0.1;
          const current = seller.physical.get(itemId);
          if (!current || !atContainer || !accessibility.canAccess(seller, current)) return false;
          const leftOccupied = seller.physical.getAll().some((item) => item.location.type === "hand" && item.location.hand === "left");
          seller.physical.move(itemId, { type: "hand", hand: leftOccupied ? "right" : "left" });
          retrieved = true;
          logSimulation(world2, "event", `${seller.name} retrieves ${itemId} for meal preparation`);
          movement.start(seller, returnPosition);
        }
        return Math.hypot(seller.position.x - returnPosition.x, seller.position.y - returnPosition.y) <= 0.1;
      }
    );
  }
  function foodServiceContext2(character, providerId) {
    const fact = character.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.context?.service === "food"
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    return fact?.context ?? { service: "food" };
  }
  function rememberRefusal2(buyer, providerId, context, request, time) {
    if (request.status !== "refused") return;
    rememberServiceProviderUnavailable(buyer, providerId, context, time, "refused", 30);
  }
  function syncFulfilment2(requestId, actor, counterpartId, fulfilment, world2) {
    const counterpart = world2.characters.find((character) => character.id === counterpartId);
    if (!counterpart) return;
    const incoming = actor.requests.getIncomingById(requestId);
    if (incoming) {
      actor.requests.updateIncomingFulfilment(requestId, fulfilment);
      counterpart.requests.updateOutgoingFulfilment(requestId, fulfilment);
      return;
    }
    const outgoing = actor.requests.getOutgoingById(requestId);
    if (outgoing) {
      actor.requests.updateOutgoingFulfilment(requestId, fulfilment);
      counterpart.requests.updateIncomingFulfilment(requestId, fulfilment);
    }
  }
  function cancelRequest(request, actor, world2) {
    const counterpartId = request.fromCharacterId === actor.id ? request.toCharacterId : request.fromCharacterId;
    const counterpart = world2.characters.find((character) => character.id === counterpartId);
    if (request.fromCharacterId === actor.id) {
      actor.requests.updateOutgoingStatus(request.id, "cancelled");
      counterpart?.requests.updateIncomingStatus(request.id, "cancelled");
    } else {
      actor.requests.updateIncomingStatus(request.id, "cancelled");
      counterpart?.requests.updateOutgoingStatus(request.id, "cancelled");
    }
    releaseRequestResource(request, actor, world2);
    logSimulation(world2, "event", `${actor.name} cancels request ${request.id}`);
  }
  function refuseRequest(seller, buyer, request, world2, social) {
    if (!social.respondToRequest(seller, buyer, request.id, "refused", world2)) {
      seller.requests.updateIncomingStatus(request.id, "refused");
      buyer.requests.updateOutgoingStatus(request.id, "refused");
    }
    releaseRequestResource(request, buyer, world2);
  }
  function releaseRequestResource(request, character, world2) {
    const resourceId = request.fulfilment?.resourceId;
    if (!resourceId) return;
    const userId = request.fromCharacterId;
    world2.resourceUsage.release(resourceId, character?.id === userId ? character.id : userId);
  }
  function isTerminalFailure5(request) {
    return request.status === "refused" || request.status === "cancelled" || request.status === "expired";
  }
  function startAction4(character, world2, type, expectedDuration, tolerance, isComplete) {
    character.currentAction = {
      id: `${character.id}-${type}-${world2.time}`,
      type,
      startedAt: world2.time,
      expectedDuration,
      expectedAt: world2.time + expectedDuration,
      tolerance,
      expiresAt: world2.time + expectedDuration + tolerance,
      status: "active",
      interruptionPolicy: "atomic",
      isComplete
    };
    logSimulation(world2, "event", `${character.name} starts ${type}; expected ${expectedDuration}m`);
    return { status: "started" };
  }

  // src/services/DrinkServiceDiscoveryExecution.ts
  function registerDrinkServiceDiscoveryHandlers(registry, social, movement) {
    registry.register(
      "ask-drink-service-context",
      (plan, character, world2) => askDrinkServiceContext(plan, character, world2, social, movement)
    );
    registry.register(
      "wait-at-drink-service-point",
      (plan, character, world2) => waitAtDrinkServicePoint(plan, character, world2, social, movement)
    );
  }
  function askDrinkServiceContext(plan, character, world2, social, movement) {
    const context = getContext2(character, plan);
    if (!context) return { status: "failed" };
    let target = plan.executionState?.servicePersonTarget;
    if (!target) {
      const memory = getContextualServicePersonMemory(character, context.point, context.query, world2.time);
      if (!memory) return { status: "failed" };
      target = personTargetFromMemory2(memory, character);
      if (!target) return { status: "failed" };
      plan.executionState = {
        ...plan.executionState ?? {},
        servicePersonTarget: target,
        servicePlaceId: context.place.id
      };
    }
    const person = resolveSubjectivePersonTarget(character, world2, target);
    if (!person) return { status: "failed" };
    if (!arePositionsWithinConversationRange(character.position, person.position, world2)) {
      const expectedDuration = movement.estimateApproachDuration(
        character,
        target.position,
        CONVERSATION_RANGE_METRES,
        world2
      );
      if (expectedDuration === void 0) return { status: "failed" };
      movement.startWithinRangeOfPosition(character, target.position, CONVERSATION_RANGE_METRES);
      return startAction5(
        character,
        world2,
        `approach-drink-service-conversation:${targetLabel3(target)}`,
        expectedDuration,
        Math.max(0.5, expectedDuration * 0.5),
        () => {
          const current = resolveSubjectivePersonTarget(character, world2, target);
          return !!current && arePositionsWithinConversationRange(character.position, current.position, world2);
        }
      );
    }
    const result = social.askPerson(character, person, context.query, world2);
    if (result.type !== "information") return { status: "failed" };
    if (result.query.type === "service-provider") {
      const providerId = result.query.subjectId;
      if (!hasCurrentLocationKnowledge2(character, providerId)) {
        const locationResult = social.askPerson(
          character,
          person,
          { type: "person-location", subjectId: providerId },
          world2
        );
        if (locationResult.type !== "information") return { status: "failed" };
      }
      return hasCurrentLocationKnowledge2(character, providerId) ? { status: "completed" } : { status: "failed" };
    }
    if (result.query.type === "person-location") {
      return hasCurrentLocationKnowledge2(character, result.query.subjectId) ? { status: "completed" } : { status: "failed" };
    }
    return { status: "failed" };
  }
  function waitAtDrinkServicePoint(plan, character, world2, social, movement) {
    const context = getContext2(character, plan);
    if (!context) return { status: "failed" };
    const personMemory = getContextualServicePersonMemory(character, context.point, context.query, world2.time);
    if (personMemory) {
      const target = personTargetFromMemory2(personMemory, character);
      if (!target) return { status: "failed" };
      plan.executionState = {
        ...plan.executionState ?? {},
        servicePersonTarget: target,
        servicePlaceId: context.place.id
      };
      return askDrinkServiceContext(plan, character, world2, social, movement);
    }
    if (hasRecentServicePointWait(character, context.point.id, world2.time)) {
      return { status: "failed" };
    }
    rememberServicePointWait(character, context.point.id, world2.time);
    const travelDuration = movement.estimateTravelDuration(character, context.point.customerPosition, world2);
    if (travelDuration === void 0) return { status: "failed" };
    const waitMinutes = 10;
    movement.start(character, context.point.customerPosition);
    logSimulation(world2, "event", `${character.name} waits at ${context.point.id} for someone who may provide drink service`);
    return startAction5(
      character,
      world2,
      `wait-at-drink-service-point:${context.point.id}`,
      travelDuration + waitMinutes,
      1,
      () => {
        const refreshed = getContext2(character, plan);
        if (!refreshed) return false;
        const memory = getContextualServicePersonMemory(character, refreshed.point, refreshed.query, world2.time);
        if (!memory) return false;
        const target = personTargetFromMemory2(memory, character);
        if (!target) return false;
        const queryOverride = {
          type: "service-provider",
          subjectId: "*",
          context: {
            service: "drink",
            placeId: refreshed.point.placeId,
            offering: "served-drink"
          }
        };
        plan.executionState = {
          ...plan.executionState ?? {},
          servicePersonTarget: target,
          servicePlaceId: refreshed.place.id,
          serviceQueryOverride: queryOverride
        };
        character.movementTarget = void 0;
        return true;
      }
    );
  }
  function getContext2(character, plan) {
    const place = getSelectedPlace(character, plan) ?? nearestRecognisedDrinkServicePlace(character);
    if (!place) return void 0;
    const point = getObservedDrinkServicePoint(character, place);
    if (!point) return void 0;
    const override = asKnowledgeQuery2(plan.executionState?.serviceQueryOverride);
    const query = override ?? drinkServiceDiscoveryQuery(character, point.placeId);
    return { query, place, point };
  }
  function getSelectedPlace(character, plan) {
    const selectedId = typeof plan.executionState?.servicePlaceId === "string" ? plan.executionState.servicePlaceId : plan.target?.type === "location" && typeof plan.target.subjectId === "string" ? plan.target.subjectId : void 0;
    if (!selectedId) return void 0;
    return character.memory.getByType("place-observed").filter((memory) => memory.subjectId === selectedId || memory.context?.knownPlaceId === selectedId).filter((memory) => isPosition18(memory.context?.position)).map((memory) => ({ id: selectedId, position: { ...memory.context.position } }))[0];
  }
  function hasCurrentLocationKnowledge2(character, providerId) {
    return character.knowledge.some(
      (knowledge) => knowledge.type === "person-location" && knowledge.subjectId === providerId && knowledge.polarity === "positive" && knowledge.position !== void 0
    );
  }
  function personTargetFromMemory2(memory, character) {
    const position = memory.context?.position;
    if (!isPosition18(position)) return void 0;
    const personId = memory.context?.identifiedPersonId;
    const distance10 = Math.hypot(position.x - character.position.x, position.y - character.position.y);
    if (typeof personId === "string") {
      return { type: "person", personId, knowledge: "known", position: { ...position }, distance: distance10 };
    }
    return { type: "person", observationId: memory.subjectId, knowledge: "observed", position: { ...position }, distance: distance10 };
  }
  function asKnowledgeQuery2(value) {
    if (!value || typeof value !== "object") return void 0;
    const query = value;
    return typeof query.type === "string" && typeof query.subjectId === "string" ? query : void 0;
  }
  function startAction5(character, world2, type, expectedDuration, tolerance, isComplete) {
    character.currentAction = {
      id: `${character.id}-${type}-${world2.time}`,
      type,
      startedAt: world2.time,
      expectedDuration,
      expectedAt: world2.time + expectedDuration,
      tolerance,
      expiresAt: world2.time + expectedDuration + tolerance,
      status: "active",
      interruptionPolicy: "atomic",
      isComplete
    };
    logSimulation(world2, "event", `${character.name} starts ${type}; expected ${expectedDuration}m`);
    return { status: "started" };
  }
  function isPosition18(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }
  function targetLabel3(target) {
    return target.personId ?? target.observationId ?? "unknown-person";
  }

  // src/services/ServedDrinkExecution.ts
  var SERVED_DRINK_PRICE = 2;
  var DRINK_LIQUID_TYPE = "ale";
  var POUR_MINUTES = 1;
  var CUSTOMER_MAX_WAIT_MINUTES2 = 30;
  var transfer = new TransferSystem();
  function registerServedDrinkHandlers(registry, commerce, social, accessibility, movement) {
    registry.register(
      "buy-served-drink",
      (plan, character, world2) => buyServedDrink(plan, character, world2, social, movement)
    );
    registry.register(
      "serve-served-drink-request",
      (plan, character, world2) => serveServedDrinkRequest(plan, character, world2, commerce, social, accessibility)
    );
    registry.register(
      "drink-served-drink",
      (_plan, character, world2) => drinkServedDrink(character, world2)
    );
  }
  function buyServedDrink(plan, buyer, world2, social, movement) {
    const providerKnowledge = buyer.knowledge.filter(
      (knowledge) => knowledge.type === "service-provider" && knowledge.polarity === "positive" && knowledge.context?.service === "drink" && knowledge.context?.offering === "served-drink" && typeof knowledge.context.placeId === "string" && isCustomerServiceProviderEligible(buyer, knowledge.subjectId, knowledge.context, world2.time)
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    if (!providerKnowledge) return { status: "failed" };
    const providerId = providerKnowledge.subjectId;
    const providerContext = providerKnowledge.context;
    const existingRequestId = plan.executionState?.servedDrinkRequestId;
    if (typeof existingRequestId === "string") {
      const existing = buyer.requests.getOutgoingById(existingRequestId, world2.time);
      if (!existing) return { status: "failed" };
      if (existing.status === "completed") {
        return hasServedDrink(buyer) ? { status: "completed" } : { status: "failed" };
      }
      if (isTerminalFailure6(existing)) {
        if (existing.status === "refused") {
          rememberServiceProviderUnavailable(
            buyer,
            providerId,
            providerContext,
            world2.time,
            "refused",
            30
          );
        }
        return { status: "failed" };
      }
      return waitForServedDrink(plan, buyer, existing.id, world2);
    }
    const location = bestKnownPersonLocation(buyer, providerId);
    if (!location) return { status: "failed" };
    const target = {
      type: "location",
      subjectId: providerId,
      position: { ...location }
    };
    plan.target = target;
    const travelDuration = movement.estimateApproachDuration(
      buyer,
      location,
      CONVERSATION_RANGE_METRES,
      world2
    );
    if (travelDuration === void 0) return { status: "failed" };
    if (travelDuration > 1e-6) {
      movement.startWithinRangeOfPosition(buyer, location, CONVERSATION_RANGE_METRES);
      return startAction6(
        buyer,
        world2,
        `approach-drink-provider:${providerId}`,
        travelDuration,
        Math.max(0.5, travelDuration * 0.5),
        () => arePositionsWithinConversationRange(buyer.position, location, world2)
      );
    }
    const resolved = resolveServiceInteractionTarget(buyer, target, world2, social);
    if (resolved.status === "identity-checked") return { status: "failed" };
    if (resolved.status === "not-observed") {
      rememberServiceProviderUnavailable(
        buyer,
        providerId,
        providerContext,
        world2.time,
        "not-found",
        15
      );
      return { status: "failed" };
    }
    const seller = resolved.provider;
    const request = social.sendRequest(
      buyer,
      seller,
      "served-drink",
      {
        service: "drink",
        offering: "served-drink",
        placeId: providerContext.placeId,
        liquidType: DRINK_LIQUID_TYPE,
        quantity: 1,
        unitPrice: SERVED_DRINK_PRICE
      },
      world2,
      30
    );
    if (!request) return { status: "failed" };
    plan.executionState = {
      ...plan.executionState ?? {},
      servedDrinkRequestId: request.id
    };
    logSimulation(world2, "event", `${buyer.name} orders a drink from ${seller.name}`);
    return waitForServedDrink(plan, buyer, request.id, world2);
  }
  function waitForServedDrink(plan, buyer, requestId, world2) {
    const finished = () => {
      const request = buyer.requests.getOutgoingById(requestId, world2.time);
      if (!request) {
        plan.failed = true;
        return true;
      }
      if (request.status === "completed") return true;
      if (isTerminalFailure6(request)) {
        plan.failed = true;
        return true;
      }
      if (request.status === "accepted" && world2.time >= request.createdAt + CUSTOMER_MAX_WAIT_MINUTES2) {
        cancelRequest2(request, buyer, world2);
        plan.failed = true;
        return true;
      }
      return false;
    };
    if (finished()) return plan.failed ? { status: "failed" } : { status: "completed" };
    return startAction6(
      buyer,
      world2,
      `wait-for-served-drink:${requestId}`,
      10,
      20,
      finished
    );
  }
  function serveServedDrinkRequest(plan, seller, world2, commerce, social, accessibility) {
    const requestId = plan.goal?.parameters?.requestId;
    if (typeof requestId !== "string") return { status: "failed" };
    const request = seller.requests.getIncomingById(requestId, world2.time);
    if (!request || isTerminalFailure6(request)) return { status: "failed" };
    if (request.status === "completed") return { status: "completed" };
    if (request.type !== "served-drink") return { status: "failed" };
    const buyer = world2.characters.find((candidate) => candidate.id === request.fromCharacterId);
    if (!buyer) {
      seller.requests.updateIncomingStatus(requestId, "cancelled");
      return { status: "failed" };
    }
    const placeId = request.parameters?.placeId;
    if (request.parameters?.service !== "drink" || request.parameters?.offering !== "served-drink" || typeof placeId !== "string" || request.parameters?.liquidType !== DRINK_LIQUID_TYPE || request.parameters?.quantity !== 1 || request.parameters?.unitPrice !== SERVED_DRINK_PRICE) {
      refuseRequest2(seller, buyer, requestId, world2, social);
      return { status: "failed" };
    }
    const serviceContainerId = getDrinkServiceContainerId(world2, placeId);
    if (!serviceContainerId) {
      refuseRequest2(seller, buyer, requestId, world2, social);
      return { status: "failed" };
    }
    if (request.status === "pending") {
      if (!arePositionsWithinConversationRange(buyer.position, seller.position, world2)) {
        seller.requests.updateIncomingStatus(requestId, "cancelled");
        buyer.requests.updateOutgoingStatus(requestId, "cancelled");
        return { status: "failed" };
      }
      const cask = findAleCask(seller, accessibility, serviceContainerId);
      const mug = findEmptyServingMug(seller, accessibility, serviceContainerId);
      if (!cask || !mug) {
        refuseRequest2(seller, buyer, requestId, world2, social);
        logSimulation(world2, "event", `${seller.name} cannot accept ${buyer.name}'s drink order; bar stock or mugs are not physically accessible`);
        return { status: "failed" };
      }
      const mugOwner = world2.ownership.getOwner(mug.id);
      if (mugOwner !== void 0 && mugOwner !== seller.id) {
        refuseRequest2(seller, buyer, requestId, world2, social);
        logSimulation(world2, "event", `${seller.name} cannot lend ${mug.id}; it is owned by ${mugOwner}`);
        return { status: "failed" };
      }
      if (mugOwner === void 0) world2.ownership.setOwner(mug.id, seller.id);
      if (!social.respondToRequest(seller, buyer, requestId, "accepted", world2)) {
        return { status: "failed" };
      }
      syncFulfilment3(
        requestId,
        seller,
        buyer,
        { stage: "preparing", itemId: mug.id },
        world2
      );
      logSimulation(world2, "event", `${seller.name} accepts ${buyer.name}'s drink order`);
      return { status: "completed" };
    }
    const current = seller.requests.getIncomingById(requestId, world2.time);
    if (!current?.fulfilment) return { status: "failed" };
    const fulfilment = current.fulfilment;
    if (fulfilment.stage === "preparing") {
      if (!fulfilment.itemId) return { status: "failed" };
      if (fulfilment.expectedAt !== void 0) return { status: "completed" };
      const cask = findAleCask(seller, accessibility, serviceContainerId);
      const mugPossession = seller.physical.get(fulfilment.itemId);
      const mug = mugPossession?.item;
      if (!cask || !mugPossession || !accessibility.canAccess(seller, mugPossession) || !mug || getLiquidAmount(mug, DRINK_LIQUID_TYPE) > 0) {
        cancelRequest2(current, buyer, world2);
        return { status: "failed" };
      }
      const readyAt = world2.time + POUR_MINUTES;
      syncFulfilment3(
        requestId,
        seller,
        buyer,
        { ...fulfilment, expectedAt: readyAt },
        world2
      );
      logSimulation(world2, "event", `${seller.name} begins pouring ${buyer.name}'s drink`);
      return startAction6(
        seller,
        world2,
        `pour-drink:${requestId}`,
        POUR_MINUTES,
        1,
        () => {
          const latest = seller.requests.getIncomingById(requestId, world2.time);
          if (!latest || latest.status !== "accepted") return true;
          if (world2.time < readyAt) return false;
          const latestMugPossession = seller.physical.get(fulfilment.itemId);
          const latestCask = findAleCask(seller, accessibility, serviceContainerId);
          if (!latestMugPossession || !accessibility.canAccess(seller, latestMugPossession) || !latestCask) return true;
          if (transferLiquid(latestCask, latestMugPossession.item, DRINK_LIQUID_TYPE, 1) !== 1) return true;
          syncFulfilment3(
            requestId,
            seller,
            buyer,
            { ...latest.fulfilment, stage: "ready", expectedAt: void 0 },
            world2
          );
          logSimulation(world2, "event", `${seller.name} finishes pouring ${buyer.name}'s drink`);
          return true;
        }
      );
    }
    if (fulfilment.stage === "ready") {
      if (!fulfilment.itemId) return { status: "failed" };
      if (!arePositionsWithinConversationRange(buyer.position, seller.position, world2)) {
        return { status: "completed" };
      }
      const mugPossession = seller.physical.get(fulfilment.itemId);
      if (!mugPossession || !accessibility.canAccess(seller, mugPossession)) {
        cancelRequest2(current, buyer, world2);
        return { status: "failed" };
      }
      if (!world2.ownership.isOwnedBy(fulfilment.itemId, seller.id)) {
        cancelRequest2(current, buyer, world2);
        return { status: "failed" };
      }
      const payment = commerce.payForService({
        payer: buyer,
        payee: seller,
        amount: SERVED_DRINK_PRICE,
        description: "served drink"
      }, world2);
      if (!payment.success) {
        cancelRequest2(current, buyer, world2);
        logSimulation(world2, "event", `${seller.name} cannot complete drink order ${requestId}: ${payment.reason ?? "payment failed"}`);
        return { status: "failed" };
      }
      try {
        seller.physical.move(fulfilment.itemId, { type: "hand", hand: "right" });
        transfer.transfer({
          item: mugPossession.item,
          from: seller.physical,
          to: buyer.physical,
          destination: { type: "hand", hand: "right" }
        });
        world2.itemLoans.lend({
          itemId: fulfilment.itemId,
          ownerId: seller.id,
          borrowerId: buyer.id,
          returnContainerId: serviceContainerId
        });
      } catch (error) {
        cancelRequest2(current, buyer, world2);
        logSimulation(world2, "event", `${seller.name} cannot lend drink ware for ${requestId}: ${error instanceof Error ? error.message : "physical transfer failed"}`);
        return { status: "failed" };
      }
      if (!social.respondToRequest(seller, buyer, requestId, "completed", world2)) {
        return { status: "failed" };
      }
      logSimulation(world2, "event", `${seller.name} serves ${buyer.name}'s drink in borrowed ${fulfilment.itemId}`);
      return { status: "completed" };
    }
    return { status: "completed" };
  }
  function drinkServedDrink(character, world2) {
    const mug = character.physical.getAll().map((possession) => possession.item).find(
      (item) => item.drink !== void 0 && getLiquidAmount(item, item.drink.liquidType) >= 1
    );
    if (!mug?.drink) return { status: "failed" };
    const consumed = consumeLiquid(mug, mug.drink.liquidType, 1);
    if (consumed <= 0) return { status: "failed" };
    character.thirst = Math.max(0, character.thirst - mug.drink.thirstRelief * consumed);
    logSimulation(world2, "event", `${character.name} drinks ${mug.drink.kind} from ${mug.id}`);
    returnBorrowedItemIfPossible(character, mug, world2);
    return { status: "completed" };
  }
  function returnBorrowedItemIfPossible(character, item, world2) {
    const loan = world2.itemLoans.get(item.id);
    if (!loan || loan.borrowerId !== character.id) return false;
    const owner = world2.characters.find((candidate) => candidate.id === loan.ownerId);
    if (!owner || !arePositionsWithinConversationRange(character.position, owner.position, world2)) return false;
    if (!character.physical.has(item.id)) return false;
    try {
      transfer.transfer({
        item,
        from: character.physical,
        to: owner.physical,
        destination: { type: "hand", hand: "right" }
      });
      if (loan.returnContainerId) {
        owner.physical.move(item.id, { type: "container", containerId: loan.returnContainerId });
      }
      world2.itemLoans.complete(item.id);
      logSimulation(world2, "event", `${character.name} returns ${item.id} to ${owner.name}`);
      return true;
    } catch {
      return false;
    }
  }
  function hasServedDrink(character) {
    return character.physical.getAll().some(
      (possession) => possession.item.drink !== void 0 && getLiquidAmount(possession.item, possession.item.drink.liquidType) >= 1
    );
  }
  function getDrinkServiceContainerId(world2, placeId) {
    return world2.objects.find(
      (object) => object.containerId !== void 0 && object.servicePoint?.placeId === placeId && object.servicePoint.services.includes("drink")
    )?.containerId;
  }
  function findAleCask(character, accessibility, serviceContainerId) {
    return character.physical.getAll().filter(
      (possession) => possession.location.type === "container" && possession.location.containerId === serviceContainerId && accessibility.canAccess(character, possession)
    ).map((possession) => possession.item).find((item) => item.type === "ale-cask" && getLiquidAmount(item, DRINK_LIQUID_TYPE) >= 1);
  }
  function findEmptyServingMug(character, accessibility, serviceContainerId) {
    return character.physical.getAll().filter(
      (possession) => possession.location.type === "container" && possession.location.containerId === serviceContainerId && accessibility.canAccess(character, possession)
    ).map((possession) => possession.item).find(
      (item) => item.type === "mug" && item.drink?.liquidType === DRINK_LIQUID_TYPE && item.liquidContainer !== void 0 && item.liquidContainer.contents === void 0
    );
  }
  function bestKnownPersonLocation(character, personId) {
    const observed = character.memory.getByType("person-observed").filter((memory) => memory.context?.identifiedPersonId === personId).filter((memory) => isPosition19(memory.context?.position)).sort((first, second) => second.lastObservedAt - first.lastObservedAt)[0];
    if (observed) return { ...observed.context.position };
    const knowledge = character.knowledge.filter(
      (item) => item.type === "person-location" && item.subjectId === personId && item.polarity === "positive" && item.position !== void 0
    ).sort((first, second) => second.learnedAt - first.learnedAt)[0];
    return knowledge?.position ? { ...knowledge.position } : void 0;
  }
  function syncFulfilment3(requestId, seller, buyer, fulfilment, _world) {
    seller.requests.updateIncomingFulfilment(requestId, fulfilment);
    buyer.requests.updateOutgoingFulfilment(requestId, fulfilment);
  }
  function refuseRequest2(seller, buyer, requestId, world2, social) {
    if (!social.respondToRequest(seller, buyer, requestId, "refused", world2)) {
      seller.requests.updateIncomingStatus(requestId, "refused");
      buyer.requests.updateOutgoingStatus(requestId, "refused");
    }
  }
  function cancelRequest2(request, buyer, world2) {
    const seller = world2.characters.find((candidate) => candidate.id === request.toCharacterId);
    buyer.requests.updateOutgoingStatus(request.id, "cancelled");
    if (seller?.requests.getIncomingById(request.id, world2.time)) {
      seller.requests.updateIncomingStatus(request.id, "cancelled");
    }
    logSimulation(world2, "event", `${buyer.name} gives up waiting for drink order ${request.id}`);
  }
  function isTerminalFailure6(request) {
    return request.status === "refused" || request.status === "cancelled" || request.status === "expired";
  }
  function startAction6(character, world2, type, expectedDuration, tolerance, isComplete) {
    character.currentAction = {
      id: `${character.id}-${type}-${world2.time}`,
      type,
      startedAt: world2.time,
      expectedDuration,
      expectedAt: world2.time + expectedDuration,
      tolerance,
      expiresAt: world2.time + expectedDuration + tolerance,
      status: "active",
      interruptionPolicy: "atomic",
      isComplete
    };
    logSimulation(world2, "event", `${character.name} starts ${type}; expected ${expectedDuration}m`);
    return { status: "started" };
  }
  function isPosition19(value) {
    if (!value || typeof value !== "object") return false;
    const position = value;
    return typeof position.x === "number" && typeof position.y === "number";
  }

  // src/Simulation.ts
  var DEFAULT_SIMULATION_MINUTES = 2880;
  var Simulation = class {
    constructor(world2, brain, perception) {
      this.world = world2;
      this.brain = brain;
      this.perception = perception;
      this.events = new SimulationEventBus();
      this.movement = new MovementSystem();
      this.fixtureNavigationPerception = new FixtureNavigationPerception();
      this.pursuit = new PersonPursuitSystem(this.movement, this.events);
      this.commerce = new CommerceSystem(this.events);
      this.knowledge = new KnowledgeSystem();
      this.conversations = new ConversationSystem(this.world, this.events);
      this.social = new SocialInteractionSystem(this.knowledge, this.events, this.conversations);
      this.conversationTopics = new ConversationTopicSystem(this.world, this.conversations, this.social);
      this.relationships = new RelationshipSystem(this.world);
      this.interactionMemories = new InteractionMemorySystem(this.world);
      this.events.subscribe((event) => this.relationships.handle(event));
      this.events.subscribe((event) => this.interactionMemories.handle(event));
      this.events.subscribe((event) => this.conversationTopics.handle(event));
      this.accessibility = new AccessibilitySystem({
        getContainer: (id) => {
          const container = this.world.objects.find(
            (object) => object.containerId === id
          );
          return container ? {
            id,
            position: container.position,
            ownerId: container.ownerId
          } : void 0;
        },
        accessDistance: 1,
        isInteractionClear: (from, to) => this.world.navigation.isLineClear(from, to, "interaction")
      });
      const executionRegistry = new PlanExecutionRegistry();
      executionRegistry.register("small-talk", (plan, character, world3) => {
        const target = plan.target;
        if (target?.type !== "person") return { status: "failed" };
        const person = resolveSubjectivePersonTarget(character, world3, target);
        if (!person || !this.social.smallTalk(character, person, world3)) {
          return { status: "failed" };
        }
        return character.currentAction ? { status: "started" } : { status: "completed" };
      });
      registerContextualServiceDiscoveryHandlers(executionRegistry, this.social, this.movement);
      registerServiceProviderHandlers(executionRegistry, this.social, this.movement);
      registerDrinkServiceDiscoveryHandlers(executionRegistry, this.social, this.movement);
      registerPreparedMealHandlers(
        executionRegistry,
        this.commerce,
        this.social,
        this.accessibility,
        this.movement
      );
      registerServedDrinkHandlers(
        executionRegistry,
        this.commerce,
        this.social,
        this.accessibility,
        this.movement
      );
      this.executor = new PlanExecutor(
        this.commerce,
        this.social,
        this.accessibility,
        this.movement,
        executionRegistry
      );
    }
    run(minutes = DEFAULT_SIMULATION_MINUTES) {
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new Error("Simulation duration must be a non-negative number.");
      }
      for (const character of this.world.characters) {
        logSimulation(
          this.world,
          "trace",
          `${character.name} position snapshot pos=(${character.position.x.toFixed(2)},${character.position.y.toFixed(2)}) target=none action=none`
        );
      }
      for (let i = 0; i < minutes; i++) {
        this.tick();
      }
    }
    tick() {
      this.world.update();
      this.perception.update(this.world);
      this.fixtureNavigationPerception.update(this.world);
      this.pursuit.update(this.world);
      this.conversations.update(this.world);
      for (const character of this.world.characters) {
        this.brain.think(character, this.world);
      }
      for (const character of this.world.characters) {
        character.update(this.world, this.executor, this.movement);
      }
      this.events.dispatchPending();
      this.world.advanceTime(1);
    }
  };

  // src/world/Tavern.ts
  var DEFAULT_TAVERN_WIDTH_METRES = 9;
  var DEFAULT_TAVERN_HEIGHT_METRES = 10;
  var DEFAULT_TAVERN_ROOM_DAILY_RATE = DEFAULT_ROOM_DAY_PRICE;
  function tavernRoomIds(tavernId) {
    return {
      common: `${tavernId}-common-room`,
      resident: `${tavernId}-resident-room`,
      guest1: `${tavernId}-guest-room-1`,
      guest2: `${tavernId}-guest-room-2`
    };
  }
  function tavernBedId(roomId) {
    return `${roomId}-bed`;
  }
  function tavernKitchenId(tavernId) {
    return `${tavernId}-kitchen`;
  }
  function tavernKitchenHearthId(tavernId) {
    return `${tavernKitchenId(tavernId)}-hearth`;
  }
  function tavernKitchenWorkPosition(tavernPosition) {
    const origin = tavernOrigin(tavernPosition);
    return { x: origin.x + 7, y: origin.y + 8 };
  }
  function createTavern(options) {
    const origin = tavernOrigin(options.position);
    const roomDailyRate = options.roomDailyRate ?? DEFAULT_TAVERN_ROOM_DAILY_RATE;
    if (!Number.isInteger(roomDailyRate) || roomDailyRate < 0) {
      throw new Error("Tavern room daily rate must be a non-negative whole number of currency items.");
    }
    const doorSideLength = options.frontDoorSide === "north" || options.frontDoorSide === "south" ? DEFAULT_TAVERN_WIDTH_METRES : DEFAULT_TAVERN_HEIGHT_METRES;
    const frontDoorOffset = Math.floor(doorSideLength / 2);
    const ids = tavernRoomIds(options.id);
    const common = room4(ids.common, options.id, {
      x: origin.x,
      y: origin.y + 3
    }, 9, 7, "public");
    const resident = room4(ids.resident, options.id, origin, 3, 3, "private", options.ownerId);
    const guest1 = rentableRoom(ids.guest1, options.id, {
      x: origin.x + 3,
      y: origin.y
    }, roomDailyRate);
    const guest2 = rentableRoom(ids.guest2, options.id, {
      x: origin.x + 6,
      y: origin.y
    }, roomDailyRate);
    const rooms = [common, resident, guest1, guest2];
    const bedroomBoundaryDoors = [resident, guest1, guest2].map((bedroom, index) => ({
      id: `${bedroom.id}-door`,
      offset: index * 3 + 1,
      state: "open",
      barredFromInside: true
    }));
    const internalPartitions = [
      {
        origin: { x: origin.x, y: origin.y + 2 },
        side: "south",
        length: 9,
        doors: bedroomBoundaryDoors
      },
      {
        origin: { x: origin.x + 2, y: origin.y },
        side: "east",
        length: 3
      },
      {
        origin: { x: origin.x + 5, y: origin.y },
        side: "east",
        length: 3
      }
    ];
    const bedroomFixtures = [resident, guest1, guest2].map((bedroom) => {
      const bedActionPoint = roomCentre(bedroom);
      return createUsableResource({
        id: tavernBedId(bedroom.id),
        type: "bed",
        placeId: options.id,
        roomId: bedroom.id,
        position: bedActionPoint,
        physicalObstruction: bedObstructionWestOfActionPoint(bedActionPoint)
      });
    });
    const kitchenPosition = tavernKitchenWorkPosition(options.position);
    const kitchenId = tavernKitchenId(options.id);
    const kitchenFixtures = [
      {
        id: kitchenId,
        kind: "other",
        position: { x: kitchenPosition.x, y: kitchenPosition.y - 1 },
        ownerId: options.ownerId,
        containerId: kitchenId
      },
      createFacility({
        id: tavernKitchenHearthId(options.id),
        type: "hearth",
        placeId: options.id,
        roomId: ids.common,
        position: kitchenPosition,
        actionPointPosition: kitchenPosition,
        physicalObstruction: {
          origin: { x: origin.x + 8, y: origin.y + 8 },
          width: 1,
          height: 1
        }
      })
    ];
    return {
      id: options.id,
      kind: "building",
      visualSize: "large",
      recognisablePlaceType: "tavern",
      recognisableServices: ["food", "drink", "accommodation"],
      advertisedServiceOfferings: [
        {
          service: "food",
          offering: "prepared-meal",
          itemType: "food",
          foodKind: "prepared-meal"
        },
        {
          service: "drink",
          offering: "served-drink"
        },
        {
          service: "accommodation",
          offering: "room-day",
          terms: { price: roomDailyRate }
        }
      ],
      position: { ...options.position },
      ownerId: options.ownerId,
      containerId: options.id,
      physicalFootprint: {
        origin,
        width: DEFAULT_TAVERN_WIDTH_METRES,
        height: DEFAULT_TAVERN_HEIGHT_METRES,
        doors: [{
          id: `${options.id}-front-door`,
          side: options.frontDoorSide,
          offset: frontDoorOffset,
          state: "open",
          barredFromInside: true
        }]
      },
      physicalRooms: rooms,
      internalPartitions,
      fixtures: [...bedroomFixtures, ...kitchenFixtures]
    };
  }
  function tavernOrigin(position) {
    return {
      x: Math.floor(position.x) - Math.floor(DEFAULT_TAVERN_WIDTH_METRES / 2),
      y: Math.floor(position.y) - Math.floor(DEFAULT_TAVERN_HEIGHT_METRES / 2)
    };
  }
  function room4(id, placeId, origin, width, height, access, residentId) {
    return {
      id,
      placeId,
      access,
      ...residentId ? { residentId } : {},
      area: {
        origin: { ...origin },
        width,
        height
      }
    };
  }
  function rentableRoom(id, placeId, origin, dailyRate) {
    return {
      ...room4(id, placeId, origin, 3, 3, "private"),
      rental: { dailyRate }
    };
  }

  // src/world/DiningTable.ts
  function diningTableSeatId(tableId, index) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error("Dining table seat index must be a non-negative integer.");
    }
    return `${tableId}-seat-${index + 1}`;
  }
  function tableObstructionNorthOfSeat(position) {
    return {
      origin: {
        x: Math.floor(position.x),
        y: Math.floor(position.y) - 1
      },
      width: 1,
      height: 1
    };
  }
  function createDiningTable(options) {
    if (options.seatPositions.length === 0) {
      throw new Error("Dining table requires at least one seat action point.");
    }
    for (const [index, seat] of options.seatPositions.entries()) {
      if (isPositionInFixtureObstruction(seat, options.physicalObstruction)) {
        throw new Error(`Dining table ${options.id} seat ${index + 1} cannot be inside the table body.`);
      }
      if (!isSeatAdjacentToTable(seat, options.physicalObstruction)) {
        throw new Error(`Dining table ${options.id} seat ${index + 1} must be cardinally adjacent to the table body.`);
      }
    }
    return {
      id: options.id,
      kind: "other",
      position: {
        x: options.physicalObstruction.origin.x + options.physicalObstruction.width / 2,
        y: options.physicalObstruction.origin.y + options.physicalObstruction.height / 2
      },
      physicalObstruction: {
        origin: { ...options.physicalObstruction.origin },
        width: options.physicalObstruction.width,
        height: options.physicalObstruction.height
      },
      fixtures: options.seatPositions.map(
        (position, index) => createUsableResource({
          id: diningTableSeatId(options.id, index),
          type: "dining-seat",
          placeId: options.placeId,
          ...options.roomId ? { roomId: options.roomId } : {},
          position: { ...position }
        })
      )
    };
  }
  function isSeatAdjacentToTable(position, obstruction) {
    const seatCell = {
      x: Math.floor(position.x),
      y: Math.floor(position.y)
    };
    return fixtureObstructionCells(obstruction).some(
      (cell) => Math.abs(cell.x - seatCell.x) + Math.abs(cell.y - seatCell.y) === 1
    );
  }

  // src/scenarios/DefaultScenario.ts
  var HOT_HELD_STEW_SHELF_LIFE_MINUTES = 18 * 60;
  function createDefaultScenario(options = {}) {
    const world2 = new World(8 * 60, new SeededChanceSource(options.chanceSeed ?? 1));
    const layout = defaultVillageLayout;
    for (const feature of layout.mapFeatures) world2.addMapFeature(feature);
    const tavernPosition = layout.tavern.position;
    const tavernBarProviderPosition = layout.tavern.barProviderPosition;
    const tavernBarCustomerPosition = layout.tavern.barCustomerPosition;
    const alice = new Character("alice", "Alice", { ...layout.startingPositions.alice }, createPersonality({
      frugality: 0.35,
      caution: 0.35,
      patience: 0.3,
      conscientiousness: 0.45,
      sociability: 0.65,
      helpfulness: 0.6,
      curiosity: 0.8,
      assertiveness: 0.75,
      integrity: 0.55,
      emotionalStability: 0.55
    }));
    const bob = new Character("bob", "Bob", { ...layout.startingPositions.bob }, createPersonality({
      frugality: 0.7,
      caution: 0.75,
      patience: 0.75,
      conscientiousness: 0.65,
      sociability: 0.35,
      helpfulness: 0.7,
      curiosity: 0.35,
      assertiveness: 0.3,
      integrity: 0.8,
      emotionalStability: 0.75
    }));
    const charlie = new Character("charlie", "Charlie", { ...layout.startingPositions.charlie }, createPersonality({
      frugality: 0.5,
      caution: 0.4,
      patience: 0.5,
      conscientiousness: 0.45,
      sociability: 0.8,
      helpfulness: 0.65,
      curiosity: 0.75,
      assertiveness: 0.6,
      integrity: 0.6,
      emotionalStability: 0.45
    }));
    const dave = new Character("dave", "Dave", { ...layout.homes.dave.position }, createPersonality({
      frugality: 0.6,
      caution: 0.5,
      patience: 0.65,
      conscientiousness: 0.85,
      sociability: 0.85,
      helpfulness: 0.85,
      curiosity: 0.5,
      assertiveness: 0.75,
      integrity: 0.75,
      emotionalStability: 0.7
    }));
    const emma = new Character("emma", "Emma", { ...tavernBarProviderPosition }, createPersonality({
      frugality: 0.55,
      caution: 0.65,
      patience: 0.7,
      conscientiousness: 0.7,
      sociability: 0.55,
      helpfulness: 0.8,
      curiosity: 0.6,
      assertiveness: 0.4,
      integrity: 0.85,
      emotionalStability: 0.8
    }));
    for (const character of [alice, bob, charlie, dave, emma]) {
      character.thirst = 0;
      character.money = 10;
      character.addActivity(new WaterPreparationActivity(`${character.id}-water-preparation`));
    }
    const establishHome = (character, homeId, position, frontDoorSide) => {
      character.homeId = homeId;
      character.tiredness = 30;
      character.addKnowledge({ type: "home-location", subjectId: homeId, polarity: "positive", position: { ...position }, sourceType: "world-initiation", learnedAt: 0, confidence: 1 });
      const home = createHouse({ id: homeId, ownerId: character.id, position, frontDoorSide });
      const frontDoorId = `${homeId}-front-door`;
      const insidePosition = home.physicalFootprint ? getDoorInsidePosition(home.physicalFootprint, frontDoorId) : void 0;
      if (!insidePosition) {
        throw new Error(`${homeId} requires an inside-operable front door.`);
      }
      character.addActivity(new DoorScheduleActivity({
        id: `${character.id}-home-front-door-hours`,
        doorId: frontDoorId,
        placeId: homeId,
        insidePosition,
        opensAt: 6 * 60,
        closesAt: 22 * 60,
        startMinuteOfDay: world2.startMinuteOfDay,
        initialState: "open"
      }));
      world2.addObject(home);
    };
    establishHome(bob, "bob-home", layout.homes.bob.position, layout.homes.bob.frontDoorSide);
    establishHome(charlie, "charlie-home", layout.homes.charlie.position, layout.homes.charlie.frontDoorSide);
    establishHome(dave, "dave-home", layout.homes.dave.position, layout.homes.dave.frontDoorSide);
    const villageTavern = createTavern({
      id: "village-tavern",
      ownerId: emma.id,
      position: tavernPosition,
      frontDoorSide: layout.tavern.frontDoorSide
    });
    const tavernFrontDoorId = `${villageTavern.id}-front-door`;
    const tavernFrontDoorInsidePosition = villageTavern.physicalFootprint ? getDoorInsidePosition(villageTavern.physicalFootprint, tavernFrontDoorId) : void 0;
    if (!tavernFrontDoorInsidePosition) {
      throw new Error("Village tavern requires an inside-operable front door.");
    }
    const tavernKitchen = tavernKitchenId(villageTavern.id);
    const tavernKitchenPosition = tavernKitchenWorkPosition(tavernPosition);
    const tavernHearthActionPoint = facilityActionPointId(tavernKitchenHearthId(villageTavern.id));
    const tavernBar = createServicePoint({
      id: "village-tavern-bar",
      placeId: villageTavern.id,
      services: ["food", "drink"],
      providerPosition: tavernBarProviderPosition,
      customerPosition: tavernBarCustomerPosition,
      ownerId: emma.id,
      containerId: "village-tavern-bar",
      initialState: "open"
    });
    const tavernWaterBarrelId = "emma-tavern-water-barrel";
    const tavernTables = layout.tavern.seatPositions.map(
      (position, index) => createDiningTable({
        id: `village-tavern-table-${index + 1}`,
        placeId: villageTavern.id,
        roomId: tavernRoomIds(villageTavern.id).common,
        physicalObstruction: tableObstructionNorthOfSeat(position),
        seatPositions: [{ ...position }]
      })
    );
    emma.homeId = villageTavern.id;
    emma.tiredness = 30;
    emma.addKnowledge({ type: "home-location", subjectId: villageTavern.id, polarity: "positive", position: { ...tavernPosition }, sourceType: "world-initiation", learnedAt: 0, confidence: 1 });
    emma.addKnowledge({
      type: "service-provider",
      subjectId: emma.id,
      polarity: "positive",
      context: {
        service: "food",
        placeId: villageTavern.id,
        offering: "prepared-meal",
        terms: {
          price: 5,
          expectedDuration: 20,
          effects: { hungerRelief: 90 }
        }
      },
      sourceType: "world-initiation",
      learnedAt: 0,
      confidence: 1
    });
    emma.addKnowledge({
      type: "service-provider",
      subjectId: emma.id,
      polarity: "positive",
      context: {
        service: "drink",
        placeId: villageTavern.id,
        offering: "served-drink",
        terms: {
          price: 2,
          expectedDuration: 2,
          effects: { thirstRelief: 80 }
        }
      },
      sourceType: "world-initiation",
      learnedAt: 0,
      confidence: 1
    });
    emma.addKnowledge({
      type: "water-source",
      subjectId: tavernWaterBarrelId,
      polarity: "positive",
      shareable: false,
      position: { ...tavernKitchenPosition },
      sourceType: "world-initiation",
      learnedAt: 0,
      confidence: 1
    });
    world2.addObject(villageTavern);
    world2.addObject(tavernBar);
    world2.roomResources.registerLiquid({
      id: tavernWaterBarrelId,
      roomId: tavernRoomIds(villageTavern.id).common,
      liquidType: "water",
      capacity: 24,
      initialAmount: 24,
      ownerId: emma.id
    });
    for (const table of tavernTables) world2.addObject(table);
    dave.addActivity(new SellFoodActivity());
    dave.addActivity(new ServicePointOperationActivity({
      id: "dave-cart-operation",
      name: "Operate Food Cart",
      servicePointId: "dave-cart",
      providerPosition: { ...layout.daveSellingPosition },
      opensAt: 9 * 60,
      closesAt: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "closed"
    }));
    dave.addActivitySchedule({
      id: "dave-sell-food-shift",
      activityId: "sell-food",
      schedule: new DailySchedule(9 * 60, 17 * 60),
      priorityBoost: 30,
      commitment: {
        goal: { type: "atLocation", parameters: { subjectId: "dave-selling-position", position: { ...layout.daveSellingPosition } } },
        priority: 55
      }
    });
    dave.addRoutineTemplate({ id: "dave-normal-workday", name: "Dave's normal workday", activityScheduleId: "dave-sell-food-shift", planningHorizonMinutes: 120, arrivalBufferMinutes: 5 });
    dave.addKnowledge({ type: "water-source", subjectId: "village-fountain", polarity: "positive", position: { ...layout.fountainPosition }, sourceType: "world-initiation", learnedAt: 0, confidence: 1 });
    dave.addKnowledge({
      type: "service-provider",
      subjectId: dave.id,
      polarity: "positive",
      context: {
        service: "food",
        placeId: "dave-cart",
        offering: "portable-food",
        terms: {
          price: 3,
          expectedDuration: 5,
          effects: { hungerRelief: 70 }
        }
      },
      sourceType: "world-initiation",
      learnedAt: 0,
      confidence: 1
    });
    emma.addActivity(new PreparedMealServiceActivity());
    emma.addActivity(new ServedDrinkServiceActivity());
    emma.addActivity(new StagedWorkplaceProductionActivity({
      id: "emma-vegetable-stew-production",
      name: "Cook Vegetable Stew",
      recipeId: "vegetable-stew",
      workActionPointId: tavernHearthActionPoint,
      workPosition: { ...tavernKitchenPosition },
      outputContainerId: tavernKitchen,
      outputType: "food",
      outputFoodKind: "prepared-meal",
      outputDishId: "vegetable-stew",
      outputHungerRelief: 90,
      outputHydrationRelief: 20,
      outputStomachVolume: 55,
      outputShelfLifeMinutes: HOT_HELD_STEW_SHELF_LIFE_MINUTES,
      targetStock: 4,
      outputCountPerBatch: 2,
      inputItemType: "food",
      inputFoodKind: "vegetable",
      inputCountPerBatch: 2,
      liquidRoomResourceId: tavernWaterBarrelId,
      liquidType: "water",
      liquidAmountPerBatch: 2,
      stages: [
        { id: "prepare-stew", activeMinutes: 10, passiveMinutesAfter: 30 },
        { id: "finish-stew", activeMinutes: 5, passiveMinutesAfter: 0 }
      ],
      maxConcurrentBatches: 1,
      // Emma prepares the day's hot stew before opening. The effective shelf life
      // approximates keeping the pot hot on the hearth through tavern service.
      activeFrom: 6 * 60,
      activeUntil: 8 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: 55,
      waitingPriority: 20
    }));
    emma.addActivity(new ServicePointOperationActivity({
      id: "emma-tavern-bar-operation",
      name: "Operate Tavern Bar",
      servicePointId: tavernBar.id,
      providerPosition: { ...tavernBarProviderPosition },
      opensAt: 8 * 60,
      closesAt: 22 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open"
    }));
    emma.addActivity(new DoorScheduleActivity({
      id: "emma-tavern-front-door-hours",
      doorId: tavernFrontDoorId,
      placeId: villageTavern.id,
      insidePosition: tavernFrontDoorInsidePosition,
      opensAt: 8 * 60,
      closesAt: 22 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open",
      priority: 75
    }));
    emma.addActivitySchedule({
      id: "emma-prepared-meal-shift",
      activityId: "prepared-meal-service",
      schedule: new DailySchedule(8 * 60, 22 * 60),
      priorityBoost: 30,
      commitment: {
        goal: { type: "atLocation", parameters: { subjectId: tavernBar.id, position: { ...tavernBarProviderPosition } } },
        priority: 55
      }
    });
    emma.addActivitySchedule({
      id: "emma-served-drink-shift",
      activityId: "served-drink-service",
      schedule: new DailySchedule(8 * 60, 22 * 60),
      priorityBoost: 30,
      commitment: {
        goal: { type: "atLocation", parameters: { subjectId: tavernBar.id, position: { ...tavernBarProviderPosition } } },
        priority: 55
      }
    });
    emma.addRoutineTemplate({ id: "emma-tavern-workday", name: "Emma's tavern workday", activityScheduleId: "emma-prepared-meal-shift", planningHorizonMinutes: 120, arrivalBufferMinutes: 5 });
    const villageFountain = { id: "village-fountain", kind: "fountain", position: { ...layout.fountainPosition } };
    const daveCart = {
      id: "dave-cart",
      kind: "cart",
      position: { ...layout.daveCartPosition },
      ownerId: dave.id,
      containerId: "dave-cart",
      displayedForSale: true,
      recognisableServices: ["food"],
      servicePoint: {
        placeId: "dave-cart",
        services: ["food"],
        providerPosition: { ...layout.daveSellingPosition },
        customerPosition: {
          x: (layout.daveCartPosition.x + layout.daveSellingPosition.x) / 2,
          y: (layout.daveCartPosition.y + layout.daveSellingPosition.y) / 2
        },
        state: "closed"
      }
    };
    world2.addObject(villageFountain);
    world2.addObject(daveCart);
    const fruitItem = (id) => ({
      id,
      type: "food",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      food: { kind: "fruit", directlyEdible: { hungerRelief: 50 } }
    });
    const vegetableItem = (id) => ({
      id,
      type: "food",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      food: { kind: "vegetable", directlyEdible: { hungerRelief: 20 } }
    });
    const vegetableStewItem = (id) => ({
      id,
      type: "food",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      food: {
        kind: "prepared-meal",
        dishId: "vegetable-stew",
        stomachVolume: 55,
        directlyEdible: { hungerRelief: 90, hydrationRelief: 20 },
        spoilage: {
          ageMinutes: 0,
          shelfLifeMinutes: HOT_HELD_STEW_SHELF_LIFE_MINUTES
        }
      }
    });
    const aleCaskItem = (id) => ({
      id,
      type: "ale-cask",
      size: "medium",
      physical: { carryHands: 2, useHands: 2 },
      liquidContainer: { capacity: 12, contents: { type: "ale", amount: 6 } }
    });
    const servingMugItem = (id) => ({
      id,
      type: "mug",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 1 },
      drink: { kind: "ale", liquidType: "ale", thirstRelief: 80 }
    });
    dave.physical.add({
      id: "dave-waterskin",
      type: "waterskin",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 2 }
    }, { type: "equipped", slot: "waterskin" });
    for (let i = 1; i <= 3; i++) {
      dave.physical.add(fruitItem(`dave-cart-fruit-${i}`), { type: "container", containerId: daveCart.containerId });
      dave.physical.add(vegetableItem(`dave-cart-vegetable-${i}`), { type: "container", containerId: daveCart.containerId });
    }
    for (let i = 1; i <= 2; i++) {
      emma.physical.add(
        vegetableStewItem(`emma-tavern-vegetable-stew-${i}`),
        { type: "container", containerId: tavernKitchen }
      );
    }
    for (let i = 1; i <= 8; i++) {
      emma.physical.add(
        vegetableItem(`emma-tavern-stew-vegetable-${i}`),
        { type: "container", containerId: tavernKitchen }
      );
    }
    emma.physical.add(aleCaskItem("emma-tavern-ale-cask"), { type: "container", containerId: tavernBar.containerId });
    for (let i = 1; i <= 3; i++) {
      emma.physical.add(servingMugItem(`emma-tavern-mug-${i}`), { type: "container", containerId: tavernBar.containerId });
    }
    alice.hunger = 90;
    alice.knownPeople.add(bob.id);
    bob.knownPeople.add(charlie.id);
    charlie.addKnowledge({
      type: "service-provider",
      subjectId: dave.id,
      polarity: "positive",
      context: {
        service: "food",
        placeId: daveCart.id,
        offering: "portable-food",
        terms: {
          price: 3,
          expectedDuration: 5,
          effects: { hungerRelief: 70 }
        }
      },
      sourceType: "world-initiation",
      learnedAt: 0,
      confidence: 1
    });
    charlie.addKnowledge({
      type: "service-place",
      subjectId: daveCart.id,
      polarity: "positive",
      position: { ...daveCart.position },
      context: { service: "food" },
      sourceType: "world-initiation",
      learnedAt: 0,
      confidence: 1
    });
    charlie.addKnowledge({ type: "person-location", subjectId: dave.id, polarity: "positive", sourceType: "world-initiation", learnedAt: 0, confidence: 1, position: { ...layout.daveSellingPosition } });
    world2.addCharacter(alice);
    world2.addCharacter(bob);
    world2.addCharacter(charlie);
    world2.addCharacter(emma);
    world2.addCharacter(dave);
    const registry = new PlannerRegistry();
    registry.registerMany(foodPlans);
    registry.registerMany(servicePlans);
    registry.registerMany(sellerPlans);
    registry.registerMany(waterPlans);
    registry.registerMany(drinkPlans);
    registry.registerMany(sleepPlans);
    registry.registerMany(knowledgePlans);
    registry.registerMany(socialPlans);
    registry.registerMany(doorPlans);
    registry.registerMany(workplacePlans);
    registry.registerMany(huntingPlans);
    const planner = new Planner(registry);
    const brain = new Brain(planner);
    const perception = new PerceptionSystem();
    const simulation2 = new Simulation(world2, brain, perception);
    return { world: world2, simulation: simulation2 };
  }

  // src/activities/WorkplaceProcurementActivity.ts
  var WorkplaceProcurementActivity = class {
    constructor(options) {
      this.options = options;
      this.id = options.id;
      this.name = options.name ?? "Restock Workplace Supplies";
      if (!options.itemType && !options.itemCategory) {
        throw new Error("Workplace procurement requires an item type or category.");
      }
      if (!Number.isInteger(options.targetStock) || options.targetStock <= 0) {
        throw new Error("Workplace procurement target stock must be a positive integer.");
      }
      if (options.maxPurchaseQuantity !== void 0 && (!Number.isInteger(options.maxPurchaseQuantity) || options.maxPurchaseQuantity <= 0)) {
        throw new Error("Workplace procurement max purchase quantity must be a positive integer when provided.");
      }
      if (options.estimatedUnitStorageVolume !== void 0 && (!Number.isInteger(options.estimatedUnitStorageVolume) || options.estimatedUnitStorageVolume <= 0)) {
        throw new Error("Workplace procurement estimated unit storage volume must be a positive integer when provided.");
      }
      if (!Number.isInteger(options.maxUnitPrice) || options.maxUnitPrice < 0) {
        throw new Error("Workplace procurement max unit price must be a non-negative whole number.");
      }
    }
    getIntents({ character }) {
      const currentStock = character.physical.getAll().filter(
        (possession) => possession.location.type === "container" && possession.location.containerId === this.options.storageContainerId && itemMatchesSelector(possession.item, this.options)
      ).length;
      if (currentStock >= this.options.targetStock) return [];
      const unitVolume = this.options.estimatedUnitStorageVolume ?? 1;
      const carrier = character.physical.getAll().filter((possession) => possession.item.solidContainer !== void 0).filter(
        (possession) => possession.location.type === "hand" || possession.location.type === "equipped" || possession.location.type === "container" && possession.location.containerId === this.options.storageContainerId
      ).map((possession) => ({
        possession,
        remaining: character.physical.getSolidContainerRemainingCapacity(possession.item.id) ?? 0
      })).filter((candidate) => candidate.remaining >= unitVolume).sort(
        (first, second) => first.possession.item.solidContainer.capacity - second.possession.item.solidContainer.capacity || first.possession.item.id.localeCompare(second.possession.item.id)
      )[0];
      if (!carrier) return [];
      const shortage = this.options.targetStock - currentStock;
      const carrierLimit = Math.floor(carrier.remaining / unitVolume);
      const policyLimit = this.options.maxPurchaseQuantity ?? carrierLimit;
      const quantity = Math.min(shortage, carrierLimit, policyLimit);
      if (quantity <= 0) return [];
      const selectorLabel = this.options.itemType ?? this.options.itemCategory;
      return [{
        id: `${character.id}:activity:${this.id}:${selectorLabel}:${this.options.foodKind ?? "any"}`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "procureWorkplaceStock",
          parameters: {
            service: this.options.service,
            ...this.options.offering !== void 0 ? { offering: this.options.offering } : {},
            ...this.options.itemType !== void 0 ? { itemType: this.options.itemType } : {},
            ...this.options.itemCategory !== void 0 ? { itemCategory: this.options.itemCategory } : {},
            ...this.options.foodKind !== void 0 ? { foodKind: this.options.foodKind } : {},
            quantity,
            targetStock: this.options.targetStock,
            maxUnitPrice: this.options.maxUnitPrice,
            carrierItemId: carrier.possession.item.id,
            carrierHomeContainerId: this.options.storageContainerId,
            storageContainerId: this.options.storageContainerId,
            storagePosition: { ...this.options.storagePosition }
          }
        },
        priority: this.options.priority ?? 45
      }];
    }
  };

  // src/activities/SurplusFoodPreservationActivity.ts
  var MINUTES_PER_DAY21 = 24 * 60;
  var SurplusFoodPreservationActivity = class {
    constructor(options) {
      this.options = options;
      if (!options.inputItemType && !options.inputItemCategory) {
        throw new Error("Surplus food preservation requires an input item type or category.");
      }
      if (!Number.isInteger(options.reserveInputStock) || options.reserveInputStock < 0) {
        throw new Error("Surplus food preservation reserveInputStock must be a non-negative integer.");
      }
      if (!Number.isFinite(options.durationMinutes) || options.durationMinutes <= 0) {
        throw new Error("Surplus food preservation durationMinutes must be positive.");
      }
      this.id = options.id;
      this.name = options.name ?? "Preserve Surplus Food";
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY21;
      if (!isActive5(minuteOfDay, this.options.activeFrom, this.options.activeUntil)) return [];
      const remainingWorkMinutes = minutesUntilEnd3(
        minuteOfDay,
        this.options.activeFrom,
        this.options.activeUntil
      );
      if (remainingWorkMinutes < this.options.durationMinutes) return [];
      const inputStock = character.physical.getAll().filter(
        (possession) => possession.location.type === "container" && possession.location.containerId === this.options.storageContainerId && itemMatchesSelector(possession.item, {
          ...this.options.inputItemType !== void 0 ? { itemType: this.options.inputItemType } : {},
          ...this.options.inputItemCategory !== void 0 ? { itemCategory: this.options.inputItemCategory } : {},
          ...this.options.inputFoodKind !== void 0 ? { foodKind: this.options.inputFoodKind } : {}
        })
      ).length;
      if (inputStock <= this.options.reserveInputStock) return [];
      return [{
        id: `${character.id}:activity:${this.id}:preserve`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "preserveSurplusFood",
          parameters: {
            recipeId: this.options.recipeId,
            workActionPointId: this.options.workActionPointId,
            workPosition: { ...this.options.workPosition },
            storageContainerId: this.options.storageContainerId,
            ...this.options.inputItemType !== void 0 ? { inputItemType: this.options.inputItemType } : {},
            ...this.options.inputItemCategory !== void 0 ? { inputItemCategory: this.options.inputItemCategory } : {},
            ...this.options.inputFoodKind !== void 0 ? { inputFoodKind: this.options.inputFoodKind } : {},
            reserveInputStock: this.options.reserveInputStock,
            outputType: this.options.outputType,
            outputFoodKind: this.options.outputFoodKind,
            ...this.options.outputHungerRelief !== void 0 ? { outputHungerRelief: this.options.outputHungerRelief } : {},
            ...this.options.outputStomachVolume !== void 0 ? { outputStomachVolume: this.options.outputStomachVolume } : {},
            durationMinutes: this.options.durationMinutes,
            finishBy: time + remainingWorkMinutes
          }
        },
        priority: this.options.priority ?? 55
      }];
    }
  };
  function isActive5(minuteOfDay, start2, end) {
    if (start2 === end) return true;
    if (start2 < end) return minuteOfDay >= start2 && minuteOfDay < end;
    return minuteOfDay >= start2 || minuteOfDay < end;
  }
  function minutesUntilEnd3(minuteOfDay, start2, end) {
    if (!isActive5(minuteOfDay, start2, end)) return 0;
    if (start2 === end) return MINUTES_PER_DAY21;
    if (start2 < end) return end - minuteOfDay;
    return minuteOfDay >= start2 ? MINUTES_PER_DAY21 - minuteOfDay + end : end - minuteOfDay;
  }

  // src/activities/WorkplaceProductionActivity.ts
  var MINUTES_PER_DAY22 = 24 * 60;
  var WorkplaceProductionActivity = class {
    constructor(options) {
      this.options = options;
      if (options.outputStomachVolume !== void 0 && (!Number.isFinite(options.outputStomachVolume) || options.outputStomachVolume <= 0)) {
        throw new Error("Workplace production outputStomachVolume must be positive when provided.");
      }
      this.id = options.id;
      this.name = options.name ?? "Produce Workplace Stock";
    }
    getIntents({ character, time }) {
      const minuteOfDay = (this.options.startMinuteOfDay + time) % MINUTES_PER_DAY22;
      if (!isActive6(minuteOfDay, this.options.activeFrom, this.options.activeUntil)) return [];
      const remainingWorkMinutes = minutesUntilEnd4(
        minuteOfDay,
        this.options.activeFrom,
        this.options.activeUntil
      );
      if (remainingWorkMinutes < this.options.durationMinutes) return [];
      const possessions = character.physical.getAll();
      const outputStock = possessions.filter(
        (possession) => possession.location.type === "container" && possession.location.containerId === this.options.outputContainerId && possession.item.type === this.options.outputType && (this.options.outputFoodKind === void 0 || possession.item.food?.kind === this.options.outputFoodKind)
      ).length;
      if (outputStock >= this.options.targetStock) return [];
      const inputCount = possessions.filter((possession) => possession.item.type === this.options.inputItemType).length;
      if (inputCount < this.options.inputCountPerBatch) return [];
      const rememberedLiquid = getRememberedRoomLiquidResource(
        character,
        this.options.liquidRoomResourceId
      );
      if (!rememberedLiquid || rememberedLiquid.liquidType !== this.options.liquidType) return [];
      if (rememberedLiquid.amount < this.options.liquidAmountPerBatch) return [];
      return [{
        id: `${character.id}:activity:${this.id}:produce`,
        source: { type: "activity", id: this.id },
        goal: {
          type: "produceWorkplaceStock",
          parameters: {
            recipeId: this.options.recipeId,
            workActionPointId: this.options.workActionPointId,
            workPosition: { ...this.options.workPosition },
            outputContainerId: this.options.outputContainerId,
            outputType: this.options.outputType,
            ...this.options.outputFoodKind !== void 0 ? { outputFoodKind: this.options.outputFoodKind } : {},
            ...this.options.outputHungerRelief !== void 0 ? { outputHungerRelief: this.options.outputHungerRelief } : {},
            ...this.options.outputStomachVolume !== void 0 ? { outputStomachVolume: this.options.outputStomachVolume } : {},
            targetStock: this.options.targetStock,
            outputCountPerBatch: this.options.outputCountPerBatch,
            inputItemType: this.options.inputItemType,
            inputCountPerBatch: this.options.inputCountPerBatch,
            liquidRoomResourceId: this.options.liquidRoomResourceId,
            liquidType: this.options.liquidType,
            liquidAmountPerBatch: this.options.liquidAmountPerBatch,
            durationMinutes: this.options.durationMinutes,
            finishBy: time + remainingWorkMinutes
          }
        },
        priority: this.options.priority ?? 55
      }];
    }
  };
  function isActive6(minuteOfDay, start2, end) {
    if (start2 === end) return true;
    if (start2 < end) return minuteOfDay >= start2 && minuteOfDay < end;
    return minuteOfDay >= start2 || minuteOfDay < end;
  }
  function minutesUntilEnd4(minuteOfDay, start2, end) {
    if (!isActive6(minuteOfDay, start2, end)) return 0;
    if (start2 === end) return MINUTES_PER_DAY22;
    if (start2 < end) return end - minuteOfDay;
    return minuteOfDay >= start2 ? MINUTES_PER_DAY22 - minuteOfDay + end : end - minuteOfDay;
  }

  // src/world/ButcherShop.ts
  var DEFAULT_BUTCHER_SHOP_WIDTH_METRES = 8;
  var DEFAULT_BUTCHER_SHOP_HEIGHT_METRES = 8;
  function butcherShopRoomIds(shopId) {
    return {
      shop: `${shopId}-shop`,
      workroom: `${shopId}-workroom`,
      living: `${shopId}-living`
    };
  }
  function butcherShopBedId(shopId) {
    return `${shopId}-living-bed`;
  }
  function butcherShopBlockId(shopId) {
    return `${shopId}-butchering-block`;
  }
  function butcherShopWorkStorageId(shopId) {
    return `${shopId}-work-storage`;
  }
  function createButcherShop(options) {
    const origin = {
      x: Math.floor(options.position.x) - Math.floor(DEFAULT_BUTCHER_SHOP_WIDTH_METRES / 2),
      y: Math.floor(options.position.y) - Math.floor(DEFAULT_BUTCHER_SHOP_HEIGHT_METRES / 2)
    };
    const ids = butcherShopRoomIds(options.id);
    const frontDoorId = `${options.id}-front-door`;
    const workroomDoorId = `${options.id}-workroom-door`;
    const livingDoorId = `${options.id}-living-door`;
    const shop = room5(ids.shop, options.id, { x: origin.x + 4, y: origin.y }, 4, 8, "public");
    const workroom = room5(ids.workroom, options.id, origin, 4, 4, "private");
    const living = room5(ids.living, options.id, { x: origin.x, y: origin.y + 4 }, 4, 4, "private", options.ownerId);
    const internalPartitions = [
      {
        origin: { x: origin.x + 3, y: origin.y },
        side: "east",
        length: 8,
        doors: [
          { id: workroomDoorId, offset: 2, state: "open" },
          { id: livingDoorId, offset: 6, state: "open" }
        ]
      },
      {
        origin: { x: origin.x, y: origin.y + 3 },
        side: "south",
        length: 4
      }
    ];
    const livingCentre = roomCentre(living);
    const workCentre = roomCentre(workroom);
    return {
      id: options.id,
      kind: "building",
      visualSize: "medium",
      recognisablePlaceType: "shop",
      recognisableServices: ["food", "trade"],
      advertisedServiceOfferings: [
        {
          service: "food",
          offering: "portable-food",
          itemType: "food",
          itemCategory: "meat",
          foodKind: "meat",
          terms: { price: 3, expectedDuration: 5 }
        },
        {
          service: "trade",
          offering: "portable-food",
          itemType: "dressed-hookcrest-carcass",
          terms: { price: 4, expectedDuration: 5 }
        }
      ],
      advertisedServiceHours: options.advertisedServiceHours?.map((descriptor) => ({
        service: descriptor.service,
        windows: descriptor.windows.map((window) => ({ ...window }))
      })),
      position: { ...options.position },
      ownerId: options.ownerId,
      physicalFootprint: {
        origin,
        width: DEFAULT_BUTCHER_SHOP_WIDTH_METRES,
        height: DEFAULT_BUTCHER_SHOP_HEIGHT_METRES,
        doors: [{ id: frontDoorId, side: options.frontDoorSide, offset: 4, state: "open", barredFromInside: true }]
      },
      physicalRooms: [shop, workroom, living],
      internalPartitions,
      fixtures: [
        createUsableResource({
          id: butcherShopBedId(options.id),
          type: "bed",
          placeId: options.id,
          roomId: living.id,
          position: livingCentre,
          physicalObstruction: bedObstructionWestOfActionPoint(livingCentre)
        }),
        createFacility({
          id: butcherShopBlockId(options.id),
          type: "butchering-table",
          placeId: options.id,
          roomId: workroom.id,
          position: workCentre,
          actionPointPosition: workCentre,
          physicalObstruction: {
            origin: { x: Math.floor(workCentre.x) - 1, y: Math.floor(workCentre.y) },
            width: 1,
            height: 1
          }
        }),
        {
          id: butcherShopWorkStorageId(options.id),
          kind: "other",
          position: workCentre,
          ownerId: options.ownerId,
          containerId: butcherShopWorkStorageId(options.id)
        }
      ]
    };
  }
  function room5(id, placeId, origin, width, height, access, residentId) {
    return {
      id,
      placeId,
      access,
      ...residentId ? { residentId } : {},
      area: { origin: { ...origin }, width, height }
    };
  }

  // src/scenarios/DefaultButcher.ts
  var DEFAULT_BUTCHER_ID = "jack";
  var DEFAULT_BUTCHER_SHOP_ID = "village-butcher-shop";
  var DEFAULT_BUTCHER_COUNTER_ID = "village-butcher-counter";
  var DEFAULT_BUTCHER_WATER_RESERVE_ID = "jack-butcher-water-barrel";
  var DEFAULT_BUTCHER_BUCKET_ID = "jack-butcher-bucket";
  var DEFAULT_BUTCHER_WATERSKIN_ID = "jack-waterskin";
  var DEFAULT_DRESSED_HOOKCREST_PRICE = 4;
  var DEFAULT_RAW_MEAT_PRICE = 3;
  var DEFAULT_BUTCHER_FRESH_MEAT_RESERVE = 2;
  var DEFAULT_BUTCHER_SERVICE_HOURS = [
    { service: "food", windows: [{ startMinuteOfDay: 9 * 60, endMinuteOfDay: 17 * 60 }] },
    { service: "trade", windows: [{ startMinuteOfDay: 9 * 60, endMinuteOfDay: 17 * 60 }] }
  ];
  function createDefaultButcherWorkplace(world2, layout) {
    const site = layout.butcherSite;
    const butcher = new Character(DEFAULT_BUTCHER_ID, "Jack", { ...site.workPosition }, createPersonality({
      frugality: 0.65,
      caution: 0.55,
      patience: 0.65,
      conscientiousness: 0.85,
      sociability: 0.6,
      helpfulness: 0.55,
      curiosity: 0.35,
      assertiveness: 0.65,
      integrity: 0.8,
      emotionalStability: 0.75
    }));
    butcher.homeId = DEFAULT_BUTCHER_SHOP_ID;
    butcher.hunger = 0;
    butcher.thirst = 0;
    butcher.tiredness = 30;
    butcher.money = 20;
    const shop = createButcherShop({
      id: DEFAULT_BUTCHER_SHOP_ID,
      ownerId: butcher.id,
      position: { ...site.position },
      frontDoorSide: site.frontDoorSide,
      advertisedServiceHours: DEFAULT_BUTCHER_SERVICE_HOURS
    });
    const counter = createServicePoint({
      id: DEFAULT_BUTCHER_COUNTER_ID,
      placeId: shop.id,
      services: ["food", "trade"],
      providerPosition: { ...site.shopProviderPosition },
      customerPosition: { ...site.shopCustomerPosition },
      ownerId: butcher.id,
      containerId: DEFAULT_BUTCHER_COUNTER_ID,
      initialState: "closed"
    });
    world2.addObject(shop);
    world2.addObject(counter);
    const rooms = butcherShopRoomIds(shop.id);
    const workStorageId = butcherShopWorkStorageId(shop.id);
    const waterReserve = world2.roomResources.registerLiquid({
      id: DEFAULT_BUTCHER_WATER_RESERVE_ID,
      roomId: rooms.workroom,
      liquidType: "water",
      capacity: 12,
      initialAmount: 4,
      ownerId: butcher.id
    });
    rememberRoomLiquidResource(butcher, waterReserve, world2.time);
    const frontDoorId = `${shop.id}-front-door`;
    const frontDoorInside = shop.physicalFootprint ? getDoorInsidePosition(shop.physicalFootprint, frontDoorId) : void 0;
    if (!frontDoorInside) throw new Error("Village butcher shop requires an inside-operable front door.");
    const butcherWorkActionPointId = facilityActionPointId(butcherShopBlockId(shop.id));
    butcher.addActivity(new WaterPreparationActivity("jack-water-preparation"));
    butcher.addActivity(new SellFoodActivity());
    butcher.addActivity(new BuyOfferedGoodsActivity({
      id: "jack-buy-dressed-game",
      name: "Buy Dressed Game",
      policies: {
        "dressed-hookcrest-carcass": {
          maxUnitPrice: DEFAULT_DRESSED_HOOKCREST_PRICE,
          storageContainerId: workStorageId,
          storagePosition: { ...site.workPosition }
        }
      }
    }));
    butcher.addActivity(new WorkplaceProductionActivity({
      id: "jack-butcher-hookcrests",
      name: "Butcher Dressed Hookcrests",
      recipeId: "butcher-dressed-hookcrest",
      workActionPointId: butcherWorkActionPointId,
      workPosition: { ...site.workPosition },
      outputContainerId: workStorageId,
      outputType: "food",
      outputFoodKind: "meat",
      outputStomachVolume: 20,
      targetStock: 12,
      outputCountPerBatch: 3,
      inputItemType: "dressed-hookcrest-carcass",
      inputCountPerBatch: 1,
      liquidRoomResourceId: DEFAULT_BUTCHER_WATER_RESERVE_ID,
      liquidType: "water",
      liquidAmountPerBatch: 1,
      durationMinutes: 20,
      activeFrom: 8 * 60,
      activeUntil: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: 60
    }));
    butcher.addActivity(new SurplusFoodPreservationActivity({
      id: "jack-dry-surplus-meat",
      name: "Dry Surplus Meat",
      recipeId: "dry-surplus-meat",
      workActionPointId: butcherWorkActionPointId,
      workPosition: { ...site.workPosition },
      storageContainerId: workStorageId,
      inputItemType: "food",
      inputFoodKind: "meat",
      reserveInputStock: DEFAULT_BUTCHER_FRESH_MEAT_RESERVE,
      outputType: "food",
      outputFoodKind: "dried-meat",
      outputHungerRelief: 35,
      outputStomachVolume: 20,
      durationMinutes: 10,
      activeFrom: 17 * 60,
      activeUntil: 20 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: 60
    }));
    butcher.addActivity(new ServicePointOperationActivity({
      id: "jack-butcher-counter-operation",
      name: "Operate Butcher Shop",
      servicePointId: counter.id,
      providerPosition: { ...site.shopProviderPosition },
      opensAt: 9 * 60,
      closesAt: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "closed"
    }));
    butcher.addActivity(new WorkplaceLiquidReserveActivity({
      id: "jack-butcher-water-reserve",
      name: "Fill Butcher Water Reserve",
      reserveId: DEFAULT_BUTCHER_WATER_RESERVE_ID,
      roomId: rooms.workroom,
      roomPosition: { ...site.workPosition },
      bucketItemId: DEFAULT_BUTCHER_BUCKET_ID,
      sourceId: "village-fountain",
      liquidType: "water",
      targetAmount: 12,
      activeFrom: 17 * 60,
      activeUntil: 20 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: 55
    }));
    butcher.addActivity(new DoorScheduleActivity({
      id: "jack-butcher-front-door-hours",
      doorId: frontDoorId,
      placeId: shop.id,
      insidePosition: frontDoorInside,
      opensAt: 8 * 60,
      closesAt: 18 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open",
      priority: 75
    }));
    butcher.addKnowledge({
      type: "home-location",
      subjectId: shop.id,
      polarity: "positive",
      position: { ...site.livingPosition },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    for (const service of ["food", "trade"]) {
      const hours = DEFAULT_BUTCHER_SERVICE_HOURS.find((entry) => entry.service === service);
      butcher.addKnowledge({
        type: "service-place",
        subjectId: shop.id,
        polarity: "positive",
        position: { ...site.position },
        context: { service },
        sourceType: "world-initiation",
        learnedAt: world2.time,
        confidence: 1
      });
      butcher.addKnowledge({
        type: "service-hours",
        subjectId: shop.id,
        polarity: "positive",
        context: { service, hours: hours.windows.map((window) => ({ ...window })) },
        sourceType: "world-initiation",
        learnedAt: world2.time,
        confidence: 1
      });
    }
    butcher.addKnowledge({
      type: "service-provider",
      subjectId: butcher.id,
      polarity: "positive",
      context: {
        service: "food",
        placeId: shop.id,
        offering: "portable-food",
        itemType: "food",
        itemCategory: "meat",
        foodKind: "meat",
        terms: { price: DEFAULT_RAW_MEAT_PRICE, expectedDuration: 5 }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    butcher.addKnowledge({
      type: "water-source",
      subjectId: "village-fountain",
      polarity: "positive",
      position: { ...layout.fountainPosition },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    butcher.physical.add({
      id: DEFAULT_BUTCHER_BUCKET_ID,
      type: "bucket",
      size: "medium",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 4 }
    }, { type: "container", containerId: workStorageId });
    butcher.physical.add({
      id: DEFAULT_BUTCHER_WATERSKIN_ID,
      type: "waterskin",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 2, contents: { type: "water", amount: 2 } }
    }, { type: "equipped", slot: "waterskin" });
    for (let index = 1; index <= 2; index++) {
      butcher.physical.add({
        id: `jack-personal-bread-${index}`,
        type: "food",
        size: "small",
        physical: { carryHands: 1, useHands: 1 },
        food: { kind: "bread", directlyEdible: { hungerRelief: 70 } }
      }, { type: "equipped", slot: "food-satchel" });
    }
    return { butcher, shop, counter };
  }
  function configureDefaultHunterButcherTrade(world2, layout, hunter, butcher) {
    hunter.addActivity(new OfferGoodsForSaleActivity({
      id: "isaac-sell-dressed-game",
      name: "Sell Dressed Game",
      service: "trade",
      offering: "portable-food",
      itemType: "dressed-hookcrest-carcass",
      quantity: 1,
      reserveStock: 0,
      priority: 50
    }));
    hunter.knownPeople.add(butcher.id);
    hunter.addKnowledge({
      type: "service-provider",
      subjectId: butcher.id,
      polarity: "positive",
      context: {
        service: "trade",
        placeId: DEFAULT_BUTCHER_SHOP_ID,
        offering: "portable-food",
        itemType: "dressed-hookcrest-carcass",
        terms: { price: DEFAULT_DRESSED_HOOKCREST_PRICE, expectedDuration: 5 }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    hunter.addKnowledge({
      type: "service-place",
      subjectId: DEFAULT_BUTCHER_SHOP_ID,
      polarity: "positive",
      position: { ...layout.butcherSite.shopCustomerPosition },
      context: { service: "trade" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    hunter.addKnowledge({
      type: "service-hours",
      subjectId: DEFAULT_BUTCHER_SHOP_ID,
      polarity: "positive",
      context: {
        service: "trade",
        hours: DEFAULT_BUTCHER_SERVICE_HOURS.find((entry) => entry.service === "trade").windows.map((window) => ({ ...window }))
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
  }

  // src/scenarios/DefaultTavernProcurement.ts
  var DEFAULT_TAVERN_VEGETABLE_TARGET_STOCK = 8;
  var DEFAULT_TAVERN_MEAT_TARGET_STOCK = 4;
  var DEFAULT_DAVE_VEGETABLE_PRICE = 3;
  var DEFAULT_JACK_MEAT_PRICE = DEFAULT_RAW_MEAT_PRICE;
  var DEFAULT_TAVERN_BASKET_ID = "emma-tavern-basket";
  var DEFAULT_TAVERN_BUCKET_ID = "emma-tavern-bucket";
  var DEFAULT_WORKPLACE_BASKET_CAPACITY = 12;
  var DEFAULT_MEAT_STEW_DISH_ID = "meat-and-vegetable-stew";
  var HOT_HELD_STEW_SHELF_LIFE_MINUTES2 = 18 * 60;
  var DEFAULT_TAVERN_WORKPLACE_CHORE_PRIORITY = 58;
  function configureDefaultTavernIngredientProcurement(world2, layout, emma, dave) {
    const kitchenId = tavernKitchenId("village-tavern");
    const kitchenPosition = tavernKitchenWorkPosition(layout.tavern.position);
    const tavernHearthActionPoint = facilityActionPointId(tavernKitchenHearthId("village-tavern"));
    const cartCustomerPosition = {
      x: (layout.daveCartPosition.x + layout.daveSellingPosition.x) / 2,
      y: (layout.daveCartPosition.y + layout.daveSellingPosition.y) / 2
    };
    emma.physical.add({
      id: DEFAULT_TAVERN_BASKET_ID,
      type: "basket",
      size: "medium",
      physical: { carryHands: 1, useHands: 1 },
      solidContainer: { capacity: DEFAULT_WORKPLACE_BASKET_CAPACITY }
    }, { type: "container", containerId: kitchenId });
    emma.physical.add({
      id: DEFAULT_TAVERN_BUCKET_ID,
      type: "bucket",
      size: "medium",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 4 }
    }, { type: "container", containerId: kitchenId });
    world2.ownership.setOwner(DEFAULT_TAVERN_BASKET_ID, emma.id);
    world2.ownership.setOwner(DEFAULT_TAVERN_BUCKET_ID, emma.id);
    emma.addActivity(new StagedWorkplaceProductionActivity({
      id: "emma-meat-stew-production",
      name: "Cook Meat And Vegetable Stew",
      recipeId: DEFAULT_MEAT_STEW_DISH_ID,
      workActionPointId: tavernHearthActionPoint,
      workPosition: { ...kitchenPosition },
      outputContainerId: kitchenId,
      outputType: "food",
      outputFoodKind: "prepared-meal",
      outputDishId: DEFAULT_MEAT_STEW_DISH_ID,
      outputHungerRelief: 110,
      outputHydrationRelief: 20,
      outputStomachVolume: 60,
      outputShelfLifeMinutes: HOT_HELD_STEW_SHELF_LIFE_MINUTES2,
      targetStock: 4,
      outputCountPerBatch: 2,
      inputItemType: "food",
      inputFoodKind: "vegetable",
      inputCountPerBatch: 1,
      secondaryInputItemType: "food",
      secondaryInputFoodKind: "meat",
      secondaryInputCountPerBatch: 1,
      liquidRoomResourceId: "emma-tavern-water-barrel",
      liquidType: "water",
      liquidAmountPerBatch: 2,
      stages: [
        { id: "prepare-meat-stew", activeMinutes: 10, passiveMinutesAfter: 30 },
        { id: "finish-meat-stew", activeMinutes: 5, passiveMinutesAfter: 0 }
      ],
      maxConcurrentBatches: 1,
      activeFrom: 6 * 60,
      activeUntil: 8 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: 60,
      waitingPriority: 60
    }));
    emma.addActivity(new WorkplaceProcurementActivity({
      id: "emma-restock-stew-vegetables",
      name: "Restock Stew Vegetables",
      service: "food",
      offering: "portable-food",
      itemCategory: "vegetable",
      targetStock: DEFAULT_TAVERN_VEGETABLE_TARGET_STOCK,
      maxPurchaseQuantity: DEFAULT_WORKPLACE_BASKET_CAPACITY,
      estimatedUnitStorageVolume: 1,
      maxUnitPrice: DEFAULT_DAVE_VEGETABLE_PRICE,
      storageContainerId: kitchenId,
      storagePosition: { ...kitchenPosition },
      priority: DEFAULT_TAVERN_WORKPLACE_CHORE_PRIORITY
    }));
    emma.addActivity(new WorkplaceProcurementActivity({
      id: "emma-restock-stew-meat",
      name: "Restock Stew Meat",
      service: "food",
      offering: "portable-food",
      itemCategory: "meat",
      // Fresh meat is a cooking ingredient. Dried meat remains preserved food
      // rather than silently satisfying this recipe reserve.
      foodKind: "meat",
      targetStock: DEFAULT_TAVERN_MEAT_TARGET_STOCK,
      maxPurchaseQuantity: DEFAULT_WORKPLACE_BASKET_CAPACITY,
      estimatedUnitStorageVolume: 1,
      maxUnitPrice: DEFAULT_JACK_MEAT_PRICE,
      storageContainerId: kitchenId,
      storagePosition: { ...kitchenPosition },
      priority: DEFAULT_TAVERN_WORKPLACE_CHORE_PRIORITY
    }));
    emma.addActivity(new WorkplaceLiquidReserveActivity({
      id: "emma-tavern-water-reserve",
      name: "Fill Tavern Kitchen Water Reserve",
      reserveId: "emma-tavern-water-barrel",
      roomId: tavernRoomIds("village-tavern").common,
      roomPosition: { ...kitchenPosition },
      bucketItemId: DEFAULT_TAVERN_BUCKET_ID,
      sourceId: "village-fountain",
      liquidType: "water",
      targetAmount: 24,
      // Refill after the morning cooking window rather than competing with it.
      activeFrom: 8 * 60,
      activeUntil: 17 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      priority: DEFAULT_TAVERN_WORKPLACE_CHORE_PRIORITY
    }));
    emma.knownPeople.add(dave.id);
    emma.addKnowledge({
      type: "service-provider",
      subjectId: dave.id,
      polarity: "positive",
      context: {
        service: "food",
        placeId: "dave-cart",
        offering: "portable-food",
        itemCategory: "vegetable",
        terms: {
          price: DEFAULT_DAVE_VEGETABLE_PRICE,
          expectedDuration: 5
        }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    emma.addKnowledge({
      type: "service-place",
      subjectId: "dave-cart",
      polarity: "positive",
      position: cartCustomerPosition,
      context: { service: "food" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    emma.addKnowledge({
      type: "service-hours",
      subjectId: "dave-cart",
      polarity: "positive",
      context: {
        service: "food",
        hours: [{ startMinuteOfDay: 9 * 60, endMinuteOfDay: 17 * 60 }]
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    emma.knownPeople.add(DEFAULT_BUTCHER_ID);
    emma.addKnowledge({
      type: "service-provider",
      subjectId: DEFAULT_BUTCHER_ID,
      polarity: "positive",
      context: {
        service: "food",
        placeId: DEFAULT_BUTCHER_SHOP_ID,
        offering: "portable-food",
        itemType: "food",
        itemCategory: "meat",
        foodKind: "meat",
        terms: {
          price: DEFAULT_JACK_MEAT_PRICE,
          expectedDuration: 5
        }
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    emma.addKnowledge({
      type: "service-place",
      subjectId: DEFAULT_BUTCHER_SHOP_ID,
      polarity: "positive",
      position: { ...layout.butcherSite.shopCustomerPosition },
      context: { service: "food" },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    emma.addKnowledge({
      type: "service-hours",
      subjectId: DEFAULT_BUTCHER_SHOP_ID,
      polarity: "positive",
      context: {
        service: "food",
        hours: DEFAULT_BUTCHER_SERVICE_HOURS.find((entry) => entry.service === "food").windows.map((window) => ({ ...window }))
      },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
    emma.addKnowledge({
      type: "water-source",
      subjectId: "village-fountain",
      polarity: "positive",
      position: { ...layout.fountainPosition },
      sourceType: "world-initiation",
      learnedAt: world2.time,
      confidence: 1
    });
  }

  // src/scenarios/DefaultHunter.ts
  var DEFAULT_HUNTER_ID = "isaac";
  var DEFAULT_HUNTER_HOME_ID = "isaac-home";
  var DEFAULT_HUNTING_ACTIVITY_ID = "isaac-hookcrest-hunting";
  var DEFAULT_HUNTING_BOW_ID = "isaac-hunting-bow";
  var DEFAULT_BUTCHERING_TABLE_ID = "isaac-butchering-table";
  var DEFAULT_GAME_LARDER_ID = "isaac-game-larder";
  var DEFAULT_GAME_CARRIER_ID = "isaac-game-strap";
  var DEFAULT_GAME_CARRIER_SLOTS = ["game-strap-1", "game-strap-2"];
  function createDefaultHunter(world2, layout) {
    const homeSite = layout.homes.isaac;
    const hunter = new Character(DEFAULT_HUNTER_ID, "Isaac", { ...homeSite.position }, createPersonality({
      frugality: 0.6,
      caution: 0.7,
      patience: 0.75,
      conscientiousness: 0.75,
      sociability: 0.35,
      helpfulness: 0.6,
      curiosity: 0.65,
      assertiveness: 0.55,
      integrity: 0.8,
      emotionalStability: 0.8
    }));
    hunter.homeId = DEFAULT_HUNTER_HOME_ID;
    hunter.hunger = 0;
    hunter.thirst = 0;
    hunter.tiredness = 25;
    hunter.money = 10;
    const baseHome = createHouse({
      id: DEFAULT_HUNTER_HOME_ID,
      ownerId: hunter.id,
      position: { ...homeSite.position },
      frontDoorSide: homeSite.frontDoorSide
    });
    const preparationPosition = { x: homeSite.position.x + 1, y: homeSite.position.y - 1 };
    const facility = createFacility({
      id: DEFAULT_BUTCHERING_TABLE_ID,
      type: "butchering-table",
      placeId: DEFAULT_HUNTER_HOME_ID,
      position: { ...preparationPosition }
    });
    const butcheringTable = {
      ...facility,
      ownerId: hunter.id,
      containerId: DEFAULT_GAME_LARDER_ID
    };
    const home = {
      ...baseHome,
      fixtures: [...baseHome.fixtures ?? [], butcheringTable]
    };
    const frontDoorId = `${home.id}-front-door`;
    const insidePosition = home.physicalFootprint ? getDoorInsidePosition(home.physicalFootprint, frontDoorId) : void 0;
    if (!insidePosition) throw new Error("Isaac's home requires an inside-operable front door.");
    hunter.addActivity(new DoorScheduleActivity({
      id: "isaac-home-front-door-hours",
      doorId: frontDoorId,
      placeId: home.id,
      insidePosition,
      opensAt: 6 * 60,
      closesAt: 22 * 60,
      startMinuteOfDay: world2.startMinuteOfDay,
      initialState: "open"
    }));
    hunter.physical.add({
      id: DEFAULT_HUNTING_BOW_ID,
      type: "hunting-bow",
      size: "medium",
      physical: { carryHands: 1, useHands: 2 }
    }, { type: "equipped", slot: "bow-sling" });
    hunter.physical.add({
      id: DEFAULT_GAME_CARRIER_ID,
      type: "game-strap",
      size: "small",
      physical: { carryHands: 1, useHands: 1 }
    }, { type: "equipped", slot: "game-strap" });
    hunter.physical.add({
      id: "isaac-waterskin",
      type: "water-container",
      size: "small",
      physical: { carryHands: 1, useHands: 1 },
      liquidContainer: { capacity: 1, contents: { type: "water", amount: 1 } }
    }, { type: "equipped", slot: "waterskin" });
    hunter.addActivity(new WaterPreparationActivity("isaac-water-preparation"));
    for (const habitat of layout.hookcrestHabitats) {
      world2.hunting.registerHabitat({
        id: habitat.id,
        speciesId: "hookcrest",
        position: { ...habitat.position },
        capacity: 1,
        successChance: 0.65,
        recoveryMinutes: 8 * 60,
        disturbanceMinutes: 45
      });
    }
    hunter.addActivity(new HookcrestHuntingActivity({
      id: DEFAULT_HUNTING_ACTIVITY_ID,
      bowItemId: DEFAULT_HUNTING_BOW_ID,
      gameCarrierSlots: DEFAULT_GAME_CARRIER_SLOTS,
      habitats: layout.hookcrestHabitats.map((habitat) => ({
        id: habitat.id,
        speciesId: "hookcrest",
        position: { ...habitat.position }
      })),
      homeSubjectId: home.id,
      homePosition: { ...home.position },
      preparationFacilityId: butcheringTable.id,
      preparationActionPointId: facilityActionPointId(butcheringTable.id),
      preparationPosition: { ...preparationPosition },
      outputContainerId: DEFAULT_GAME_LARDER_ID,
      meatYield: 3,
      targetMeatStock: 3,
      startMinuteOfDay: world2.startMinuteOfDay,
      activeFrom: 8 * 60,
      activeUntil: 17 * 60,
      priority: 46
    }));
    world2.addObject(home);
    return {
      hunter,
      home,
      butcheringTable,
      habitatIds: layout.hookcrestHabitats.map((habitat) => habitat.id)
    };
  }

  // src/scenarios/DefaultVillageScenario.ts
  function createDefaultVillageScenario(options = {}) {
    const scenario = createDefaultScenario(options);
    scenario.world.dayNightEnvironmentEnabled = true;
    const bob = scenario.world.characters.find((character) => character.id === "bob");
    if (!bob) throw new Error("Default village requires Bob before the mill workplace is composed.");
    const millSetup = createDefaultMillWorkplace(scenario.world, defaultVillageLayout, bob);
    const merchantSetup = createDefaultMerchant(scenario.world, defaultVillageLayout);
    scenario.world.addCharacter(merchantSetup.merchant);
    const charlie = scenario.world.characters.find((character) => character.id === "charlie");
    if (!charlie) throw new Error("Default village requires Charlie before the farm trade is composed.");
    const farmerSetup = createDefaultFarmer(scenario.world, defaultVillageLayout, charlie);
    const bakerySetup = createDefaultBakeryWorkplace(scenario.world, defaultVillageLayout);
    scenario.world.addCharacter(bakerySetup.baker);
    const helenResidentSetup = createDefaultHelenResident(scenario.world, defaultVillageLayout);
    scenario.world.addCharacter(helenResidentSetup.farmer);
    const helenFarmerSetup = createDefaultFarmer(
      scenario.world,
      defaultVillageLayout,
      helenResidentSetup.farmer
    );
    const fieldTenancySetup = configureDefaultFieldTenancy(scenario.world, defaultVillageLayout);
    const agriculturalYearSetup = configureDefaultAgriculturalYear(
      scenario.world,
      fieldTenancySetup.fieldIds
    );
    configureDefaultFarmerFieldWork(scenario.world, charlie);
    configureDefaultFarmerFieldWork(scenario.world, helenResidentSetup.farmer);
    const hunterSetup = createDefaultHunter(scenario.world, defaultVillageLayout);
    scenario.world.addCharacter(hunterSetup.hunter);
    const butcherSetup = createDefaultButcherWorkplace(scenario.world, defaultVillageLayout);
    scenario.world.addCharacter(butcherSetup.butcher);
    configureDefaultHunterButcherTrade(
      scenario.world,
      defaultVillageLayout,
      hunterSetup.hunter,
      butcherSetup.butcher
    );
    const alice = scenario.world.characters.find((character) => character.id === "alice");
    const emma = scenario.world.characters.find((character) => character.id === "emma");
    const dave = scenario.world.characters.find((character) => character.id === "dave");
    if (!alice || !emma || !dave) {
      throw new Error("Default village requires Alice, Emma and Dave before appearance setup.");
    }
    configureDefaultTavernIngredientProcurement(scenario.world, defaultVillageLayout, emma, dave);
    for (let index = 1; index <= 3; index++) {
      const id = `dave-cart-dried-meat-${index}`;
      dave.physical.add({
        id,
        type: "food",
        size: "small",
        physical: { carryHands: 1, useHands: 1 },
        food: {
          kind: "dried-meat",
          stomachVolume: 20,
          directlyEdible: { hungerRelief: 35 }
        }
      }, { type: "container", containerId: "dave-cart" });
      scenario.world.ownership.setOwner(id, dave.id);
    }
    for (const character of scenario.world.characters) {
      character.addActivity(new CommercialPlaceInspectionActivity());
    }
    setCharacterAppearance(alice, {
      bodyType: "female",
      hairStyle: "long-bangs",
      hairColor: "auburn",
      lowerBody: "pants",
      lowerBodyColor: "green",
      torso: "shirt",
      torsoColor: "blue",
      outerwear: "none",
      outerwearColor: "brown",
      footwear: "boots",
      footwearColor: "dark-brown"
    });
    setCharacterAppearance(bob, {
      bodyType: "male",
      hairStyle: "balding",
      hairColor: "grey",
      lowerBody: "pants",
      lowerBodyColor: "charcoal",
      torso: "shirt",
      torsoColor: "ochre",
      outerwear: "apron",
      outerwearColor: "cream",
      footwear: "boots",
      footwearColor: "brown"
    });
    setCharacterAppearance(charlie, {
      bodyType: "male",
      hairStyle: "bedhead",
      hairColor: "dark-brown",
      lowerBody: "pants",
      lowerBodyColor: "brown",
      torso: "shirt",
      torsoColor: "green",
      outerwear: "none",
      outerwearColor: "brown",
      footwear: "boots",
      footwearColor: "dark-brown"
    });
    setCharacterAppearance(dave, {
      bodyType: "male",
      hairStyle: "bob-side-part",
      hairColor: "black",
      lowerBody: "pants",
      lowerBodyColor: "charcoal",
      torso: "shirt",
      torsoColor: "red",
      outerwear: "vest",
      outerwearColor: "brown",
      footwear: "boots",
      footwearColor: "black"
    });
    setCharacterAppearance(emma, {
      bodyType: "female",
      hairStyle: "bob",
      hairColor: "blonde",
      lowerBody: "pants",
      lowerBodyColor: "blue",
      torso: "shirt",
      torsoColor: "blue",
      outerwear: "apron",
      outerwearColor: "green",
      footwear: "boots",
      footwearColor: "brown"
    });
    setCharacterAppearance(merchantSetup.merchant, {
      bodyType: "male",
      hairStyle: "bob",
      hairColor: "brown",
      lowerBody: "pants",
      lowerBodyColor: "brown",
      torso: "shirt",
      torsoColor: "ochre",
      outerwear: "vest",
      outerwearColor: "blue",
      footwear: "boots",
      footwearColor: "black"
    });
    setCharacterAppearance(bakerySetup.baker, {
      bodyType: "female",
      hairStyle: "short-bangs",
      hairColor: "blonde",
      lowerBody: "pants",
      lowerBodyColor: "green",
      torso: "shirt",
      torsoColor: "red",
      outerwear: "apron",
      outerwearColor: "cream",
      footwear: "boots",
      footwearColor: "dark-brown"
    });
    setCharacterAppearance(helenResidentSetup.farmer, {
      bodyType: "female",
      hairStyle: "long-bangs",
      hairColor: "dark-brown",
      lowerBody: "pants",
      lowerBodyColor: "brown",
      torso: "shirt",
      torsoColor: "cream",
      outerwear: "apron",
      outerwearColor: "green",
      footwear: "boots",
      footwearColor: "brown"
    });
    setCharacterAppearance(hunterSetup.hunter, {
      bodyType: "male",
      hairStyle: "short-bangs",
      hairColor: "auburn",
      lowerBody: "pants",
      lowerBodyColor: "green",
      torso: "shirt",
      torsoColor: "charcoal",
      outerwear: "vest",
      outerwearColor: "ochre",
      footwear: "boots",
      footwearColor: "dark-brown"
    });
    setCharacterAppearance(butcherSetup.butcher, {
      bodyType: "male",
      hairStyle: "short-bangs",
      hairColor: "black",
      lowerBody: "pants",
      lowerBodyColor: "charcoal",
      torso: "shirt",
      torsoColor: "cream",
      outerwear: "apron",
      outerwearColor: "brown",
      footwear: "boots",
      footwearColor: "black"
    });
    return {
      ...scenario,
      agriculturalYearSetup,
      bakerySetup,
      fieldTenancySetup,
      farmerSetup,
      helenFarmerSetup,
      millSetup,
      merchantSetup,
      hunterSetup,
      butcherSetup
    };
  }

  // src/view/SimulationView.ts
  var SIMULATION_VIEW_SCHEMA_VERSION = 1;

  // src/view/SimulationViewAdapter.ts
  var MINUTES_PER_DAY23 = 24 * 60;
  var SimulationViewAdapter = class {
    frame(world2) {
      return {
        schemaVersion: SIMULATION_VIEW_SCHEMA_VERSION,
        tick: world2.time,
        time: this.time(world2),
        entities: [
          ...world2.mapFeatures.map((feature) => this.mapFeatureEntity(feature, world2)),
          ...world2.characters.map((character) => this.characterEntity(character)),
          ...world2.objects.flatMap((object) => [
            this.worldObjectEntity(object, world2),
            ...(object.physicalRooms ?? []).map((room6) => this.roomEntity(room6))
          ])
        ]
      };
    }
    time(world2) {
      const absoluteMinute = world2.startMinuteOfDay + world2.time;
      const day = Math.floor(absoluteMinute / MINUTES_PER_DAY23) + 1;
      const minuteOfDay = absoluteMinute % MINUTES_PER_DAY23;
      return {
        day,
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
        minuteOfDay
      };
    }
    mapFeatureEntity(feature, world2) {
      const geometry = feature.geometry.type === "polyline" ? {
        type: "polyline",
        width: feature.geometry.width,
        points: feature.geometry.points.map((point) => ({ ...point }))
      } : feature.geometry.type === "polygon" ? {
        type: "polygon",
        points: feature.geometry.points.map((point) => ({ ...point }))
      } : {
        type: "centered-rectangle",
        width: feature.geometry.width,
        height: feature.geometry.height
      };
      const entity = {
        id: feature.id,
        category: "map-feature",
        subtype: feature.kind,
        label: feature.label,
        position: { ...feature.position },
        geometry
      };
      if (feature.kind === "field") {
        const field = world2.agriculture.getField(feature.id);
        if (field) {
          const tiles = world2.agriculture.tilesForField(field.id);
          const rotationDefaultTileState = field.rotation === "fallow" ? "fallow" : "bare";
          const stateCounts = /* @__PURE__ */ new Map();
          for (const tile of tiles) {
            stateCounts.set(tile.state, (stateCounts.get(tile.state) ?? 0) + 1);
          }
          let defaultTileState = rotationDefaultTileState;
          let defaultStateCount = stateCounts.get(defaultTileState) ?? 0;
          for (const [state2, count] of stateCounts) {
            if (count > defaultStateCount) {
              defaultTileState = state2;
              defaultStateCount = count;
            }
          }
          const tileRuns = this.agriculturalTileRuns(
            world2,
            field.id,
            field.stripOrientation,
            defaultTileState
          );
          entity.properties = {
            fieldRotation: field.rotation,
            fieldTileCount: tiles.length
          };
          entity.agriculture = {
            rotation: field.rotation,
            defaultTileState,
            runOrientation: field.stripOrientation,
            tileRuns
          };
        }
      }
      return entity;
    }
    agriculturalTileRuns(world2, fieldId, orientation, defaultTileState) {
      const runs = [];
      for (const strip of world2.agriculture.getStripsForField(fieldId)) {
        let currentRun;
        for (const tile of world2.agriculture.tilesForStrip(strip.id)) {
          if (tile.state === defaultTileState) {
            currentRun = void 0;
            continue;
          }
          const expectedX = currentRun ? currentRun.x + (orientation === "east-west" ? currentRun.length : 0) : void 0;
          const expectedY = currentRun ? currentRun.y + (orientation === "north-south" ? currentRun.length : 0) : void 0;
          if (currentRun && currentRun.state === tile.state && tile.x === expectedX && tile.y === expectedY) {
            currentRun.length += 1;
            continue;
          }
          currentRun = {
            x: tile.x,
            y: tile.y,
            length: 1,
            state: tile.state
          };
          runs.push(currentRun);
        }
      }
      return runs;
    }
    characterEntity(character) {
      const state2 = {};
      if (character.currentAction) state2.action = character.currentAction.type;
      if (character.movementTarget) state2.movementTarget = { ...character.movementTarget };
      const activePlanPath = this.activePlanPath(character.currentPlan);
      const activePlanStep = activePlanPath.length > 0 ? activePlanPath[activePlanPath.length - 1] : void 0;
      return {
        id: character.id,
        category: "character",
        subtype: "person",
        label: character.name,
        position: { ...character.position },
        ...Object.keys(state2).length > 0 ? { state: state2 } : {},
        properties: {
          hunger: character.hunger,
          fullness: character.fullness,
          digestion: character.digestionSummary ?? null,
          digestionStacks: character.digestionStackCount,
          thirst: character.thirst,
          tiredness: character.tiredness,
          socialNeed: character.socialNeed,
          money: character.money,
          currentGoal: character.currentIntent?.goal.type ?? null,
          currentGoalReasonType: character.currentIntent?.source.type ?? null,
          currentGoalReasonId: character.currentIntent?.source.id ?? null,
          currentPlan: this.planPathLabel(activePlanPath),
          currentSubgoal: activePlanStep?.goal?.type ?? null,
          nextPlanStep: this.planLabel(activePlanStep),
          food: character.food,
          possessions: character.physical.getAll().length,
          knownPeople: character.knownPeople.size
        }
      };
    }
    /** Mirrors PlanExecutor's first-unfinished-prerequisite ordering without mutating the plan. */
    activePlanPath(plan) {
      if (!plan || plan.satisfied || plan.completed || plan.failed) return [];
      const nextPrerequisite = plan.prerequisites.find(
        (prerequisite) => !prerequisite.satisfied && !prerequisite.completed
      );
      return nextPrerequisite ? [plan, ...this.activePlanPath(nextPrerequisite)] : [plan];
    }
    planPathLabel(path) {
      const labels = path.map((plan) => this.planLabel(plan)).filter((label) => label !== null);
      return labels.length > 0 ? labels.join(" \u2192 ") : null;
    }
    planLabel(plan) {
      return plan?.definition?.name ?? plan?.goal?.type ?? null;
    }
    worldObjectEntity(object, world2) {
      const category = object.kind === "building" || object.kind === "fountain" ? "place" : "object";
      const obstruction = world2.getFixtureObstruction(object);
      const properties = {};
      if (object.visualSize !== void 0) properties.visualSize = object.visualSize;
      if (object.ownerId !== void 0) properties.ownerId = object.ownerId;
      if (object.containerId !== void 0) properties.containerId = object.containerId;
      if (object.displayedForSale !== void 0) properties.displayedForSale = object.displayedForSale;
      if (object.usableResource !== void 0) {
        const occupancy = world2.resourceUsage.occupancy(object.id);
        properties.resourceType = object.usableResource.type;
        properties.resourcePlaceId = object.usableResource.placeId;
        properties.resourceCapacity = object.usableResource.capacity;
        properties.resourceOccupancy = occupancy;
        properties.resourceOccupied = occupancy > 0;
      }
      if (object.facility !== void 0) {
        properties.facilityType = object.facility.type;
        properties.facilityPlaceId = object.facility.placeId;
      }
      if (object.servicePoint !== void 0) {
        properties.servicePointPlaceId = object.servicePoint.placeId;
        properties.servicePointServices = object.servicePoint.services.join(", ");
        properties.fixtureType = "service-counter";
      } else if (object.fixtures?.some((fixture) => fixture.usableResource?.type === "dining-seat")) {
        properties.fixtureType = "dining-table";
      }
      const geometry = this.worldObjectGeometry(object, world2, obstruction);
      return {
        id: object.id,
        category,
        subtype: object.kind,
        label: this.labelFromId(object.id),
        position: obstruction ? {
          x: obstruction.origin.x + obstruction.width / 2,
          y: obstruction.origin.y + obstruction.height / 2
        } : { ...object.position },
        ...geometry ? { geometry } : {},
        ...Object.keys(properties).length > 0 ? { properties } : {}
      };
    }
    roomEntity(room6) {
      const { origin, width, height } = room6.area;
      const properties = {
        roomPlaceId: room6.placeId,
        roomAccess: room6.access
      };
      if (room6.residentId !== void 0) properties.roomResidentId = room6.residentId;
      if (room6.rental !== void 0) properties.roomDailyRate = room6.rental.dailyRate;
      return {
        id: room6.id,
        category: "room",
        subtype: "building",
        label: this.roomLabel(room6),
        position: {
          x: origin.x + width / 2,
          y: origin.y + height / 2
        },
        // A room is an area, not a second source of wall geometry. The building
        // exterior and internal partitions remain the physical navigation truth.
        geometry: { type: "centered-rectangle", width, height },
        properties
      };
    }
    worldObjectGeometry(object, world2, obstruction) {
      const footprint = object.physicalFootprint;
      if (footprint) {
        return this.rectangularFootprintGeometry(
          footprint,
          world2,
          object.internalPartitions ?? []
        );
      }
      if (obstruction) {
        return {
          type: "centered-rectangle",
          width: obstruction.width,
          height: obstruction.height
        };
      }
      if (object.kind === "fountain") {
        return { type: "circle", radius: 0.55 };
      }
      if (object.usableResource?.type === "dining-seat") {
        return { type: "centered-rectangle", width: 0.8, height: 0.55 };
      }
      if (object.servicePoint !== void 0) {
        const barrier = object.physicalEdgeBarriers?.[0];
        if (barrier) {
          const crossesEastWest = barrier.first.x !== barrier.second.x;
          return crossesEastWest ? { type: "centered-rectangle", width: 0.5, height: 1.4 } : { type: "centered-rectangle", width: 1.4, height: 0.5 };
        }
        return { type: "centered-rectangle", width: 1.4, height: 0.5 };
      }
      return void 0;
    }
    rectangularFootprintGeometry(footprint, world2, partitions) {
      const projectedPartitions = partitions.map((partition) => this.wallPartitionGeometry(partition, world2));
      return {
        type: "rectangular-footprint",
        origin: { ...footprint.origin },
        width: footprint.width,
        height: footprint.height,
        doors: (footprint.doors ?? []).map((door) => ({
          id: door.id,
          side: door.side,
          offset: door.offset,
          state: this.currentFootprintDoorState(world2, footprint, door)
        })),
        ...projectedPartitions.length > 0 ? { partitions: projectedPartitions } : {}
      };
    }
    wallPartitionGeometry(partition, world2) {
      return {
        origin: { ...partition.origin },
        side: partition.side,
        length: partition.length,
        doors: (partition.doors ?? []).map((door) => ({
          id: door.id,
          side: partition.side,
          offset: door.offset,
          state: this.currentPartitionDoorState(world2, partition, door)
        }))
      };
    }
    currentFootprintDoorState(world2, footprint, door) {
      const { origin, width, height } = footprint;
      const cell = door.side === "north" ? { x: origin.x + door.offset, y: origin.y } : door.side === "south" ? { x: origin.x + door.offset, y: origin.y + height - 1 } : door.side === "west" ? { x: origin.x, y: origin.y + door.offset } : { x: origin.x + width - 1, y: origin.y + door.offset };
      return this.currentBoundaryDoorState(world2, cell, door.side, door.id, door.state ?? "open");
    }
    currentPartitionDoorState(world2, partition, door) {
      const horizontal = partition.side === "north" || partition.side === "south";
      const cell = horizontal ? { x: partition.origin.x + door.offset, y: partition.origin.y } : { x: partition.origin.x, y: partition.origin.y + door.offset };
      return this.currentBoundaryDoorState(world2, cell, partition.side, door.id, door.state ?? "open");
    }
    currentBoundaryDoorState(world2, cell, side, doorId, fallback) {
      const neighbour = world2.navigation.neighbour(cell, side);
      const barrier = world2.navigation.getBarrier(cell, neighbour);
      return barrier?.type === "door" && barrier.doorId === doorId ? barrier.state : fallback;
    }
    roomLabel(room6) {
      const placePrefix = `${room6.placeId}-`;
      const relativeId = room6.id.startsWith(placePrefix) ? room6.id.slice(placePrefix.length) : room6.id;
      return this.labelFromId(relativeId);
    }
    labelFromId(id) {
      return id.split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    }
  };

  // src/view/SimulationViewRecorder.ts
  function escapeRegularExpression(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function inferredActorIds(message, world2) {
    const actorIds = [];
    for (const character of world2.characters) {
      const name = character.name.trim();
      if (!name) continue;
      const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegularExpression(name)}(?=$|[^A-Za-z0-9])`, "i");
      if (pattern.test(message)) actorIds.push(character.id);
    }
    return actorIds;
  }
  var SimulationViewRecorder = class {
    constructor(adapter = new SimulationViewAdapter()) {
      this.adapter = adapter;
    }
    record(simulation2, world2, minutes, title = "Village simulation") {
      if (!Number.isInteger(minutes) || minutes < 0) {
        throw new Error("Viewer recording duration must be a non-negative integer.");
      }
      const events = [];
      const unsubscribe = subscribeSimulationLog((entry) => {
        const actorIds = entry.actorIds?.length ? [...entry.actorIds] : inferredActorIds(entry.message, world2);
        events.push({
          tick: entry.tick,
          level: entry.level,
          message: entry.message,
          ...actorIds.length ? { actorIds } : {},
          ...entry.entityIds?.length ? { entityIds: [...entry.entityIds] } : {},
          ...entry.type ? { type: entry.type } : {}
        });
      });
      try {
        const frames = [this.snapshot(world2)];
        for (let i = 0; i < minutes; i++) {
          simulation2.tick();
          frames.push(this.snapshot(world2));
        }
        return {
          schemaVersion: SIMULATION_VIEW_SCHEMA_VERSION,
          title,
          frames,
          events
        };
      } finally {
        unsubscribe();
      }
    }
    /**
     * Projects the current world into the same enriched frame used by recordings.
     * Live browser viewing uses this without retaining an unbounded frame history.
     */
    snapshot(world2) {
      const frame = this.adapter.frame(world2);
      for (const character of world2.characters) {
        const entity = frame.entities.find(
          (candidate) => candidate.category === "character" && candidate.id === character.id
        );
        if (!entity) continue;
        const appearance = getCharacterAppearance(character);
        const leftHandItem = character.physical.getAll().find(
          (possession) => possession.location.type === "hand" && possession.location.hand === "left"
        )?.item;
        const rightHandItem = character.physical.getAll().find(
          (possession) => possession.location.type === "hand" && possession.location.hand === "right"
        )?.item;
        entity.properties = {
          ...entity.properties,
          appearanceBodyType: appearance.bodyType,
          appearanceHairStyle: appearance.hairStyle,
          appearanceHairColor: appearance.hairColor,
          appearanceLowerBody: appearance.lowerBody,
          appearanceLowerBodyColor: appearance.lowerBodyColor,
          appearanceTorso: appearance.torso,
          appearanceTorsoColor: appearance.torsoColor,
          appearanceOuterwear: appearance.outerwear,
          appearanceOuterwearColor: appearance.outerwearColor,
          appearanceFootwear: appearance.footwear,
          appearanceFootwearColor: appearance.footwearColor,
          heldItemLeft: leftHandItem?.type ?? null,
          heldItemRight: rightHandItem?.type ?? null
        };
      }
      for (const object of world2.objects) {
        const entity = frame.entities.find((candidate) => candidate.id === object.id);
        if (!entity) continue;
        const contents = this.objectContents(object, world2);
        if (object.kind === "building" || object.containerId !== void 0 || contents.length > 0) {
          entity.contents = contents;
        }
      }
      return frame;
    }
    objectContents(object, world2) {
      const rootContainerIds = this.rootContainerIds(object, world2);
      const contents = this.itemContents(rootContainerIds, world2);
      if (object.kind === "building") {
        for (const room6 of object.physicalRooms ?? []) {
          for (const resource of world2.roomResources.getLiquidsInRoom(room6.id)) {
            contents.push({
              kind: "liquid",
              type: resource.liquidType,
              quantity: resource.amount,
              capacity: resource.capacity,
              locationId: resource.id,
              ...resource.ownerId ? { ownerId: resource.ownerId } : {}
            });
          }
        }
      }
      return contents.sort(
        (first, second) => first.kind.localeCompare(second.kind) || first.type.localeCompare(second.type) || first.locationId.localeCompare(second.locationId) || (first.ownerId ?? "").localeCompare(second.ownerId ?? "")
      );
    }
    rootContainerIds(object, world2) {
      const containerIds = /* @__PURE__ */ new Set();
      const includeContainer = (candidate) => {
        if (candidate.containerId) containerIds.add(candidate.containerId);
      };
      includeContainer(object);
      const fixtures = [...object.fixtures ?? []];
      while (fixtures.length > 0) {
        const fixture = fixtures.pop();
        if (!fixture) continue;
        includeContainer(fixture);
        fixtures.push(...fixture.fixtures ?? []);
      }
      if (object.kind === "building") {
        for (const candidate of world2.objects) {
          if (candidate.id === object.id) continue;
          const placeId = candidate.servicePoint?.placeId ?? candidate.usableResource?.placeId ?? candidate.facility?.placeId;
          if (placeId === object.id) includeContainer(candidate);
        }
      }
      return containerIds;
    }
    itemContents(rootContainerIds, world2) {
      if (rootContainerIds.size === 0) return [];
      const possessions = world2.characters.flatMap(
        (character) => character.physical.getAll().map((possession) => ({
          holderId: character.id,
          possession
        }))
      );
      const byItemId = new Map(possessions.map((record) => [record.possession.item.id, record]));
      const saleContainerIds = new Set(
        world2.objects.filter((object) => object.displayedForSale === true && object.containerId).map((object) => object.containerId)
      );
      const grouped = /* @__PURE__ */ new Map();
      const rootFor = (containerId) => {
        const visited = /* @__PURE__ */ new Set();
        let currentId = containerId;
        while (currentId) {
          if (rootContainerIds.has(currentId)) return currentId;
          if (visited.has(currentId)) return void 0;
          visited.add(currentId);
          const parent = byItemId.get(currentId)?.possession;
          if (!parent || parent.location.type !== "container") return void 0;
          currentId = parent.location.containerId;
        }
        return void 0;
      };
      for (const { holderId, possession } of possessions) {
        if (possession.location.type !== "container") continue;
        const rootContainerId = rootFor(possession.location.containerId);
        if (!rootContainerId) continue;
        const itemType = possession.item.food?.dishId ?? possession.item.food?.kind ?? possession.item.drink?.kind ?? possession.item.type;
        const ownerId = world2.ownership.getOwner(possession.item.id) ?? holderId;
        const forSale = saleContainerIds.has(rootContainerId);
        const key = JSON.stringify([
          itemType,
          possession.location.containerId,
          ownerId,
          forSale
        ]);
        const existing = grouped.get(key);
        if (existing) {
          existing.quantity += 1;
          continue;
        }
        grouped.set(key, {
          kind: "item",
          type: itemType,
          quantity: 1,
          locationId: possession.location.containerId,
          ownerId,
          ...forSale ? { forSale: true } : {}
        });
      }
      return [...grouped.values()];
    }
  };

  // src/view/browser/LiveSimulationWorker.ts
  var LOOP_INTERVAL_MS = 25;
  var VIEW_PUBLISH_INTERVAL_MS = 100;
  var DEFAULT_TICKS_PER_SECOND = 1;
  var MAX_TICKS_PER_SECOND = 1e3;
  var MAX_TICKS_PER_LOOP = 250;
  var MAX_STEP_MINUTES = 24 * 60;
  var DEFAULT_DIAGNOSTIC_CAPTURE_MINUTES = 6 * 60;
  var MAX_DIAGNOSTIC_CAPTURE_MINUTES = 24 * 60;
  var DIAGNOSTIC_SNAPSHOT_INTERVAL = 5;
  var RESTORE_TICKS_PER_CHUNK = 500;
  var workerScope = self;
  var { world, simulation } = createDefaultVillageScenario();
  var viewRecorder = new SimulationViewRecorder();
  var pendingEvents = [];
  var running = false;
  var ticksPerSecond = DEFAULT_TICKS_PER_SECOND;
  var timer;
  var lastLoopAt = performance.now();
  var lastPublishAt = lastLoopAt;
  var tickBudget = 0;
  var diagnosticRecorder;
  var diagnosticStartedAtTick;
  var diagnosticMaxMinutes;
  var diagnosticEvents = [];
  var restoring = false;
  var restoreTargetTick;
  setSimulationConsoleOutputEnabled(false);
  subscribeSimulationLog((entry) => {
    if (restoring) return;
    const event = {
      tick: entry.tick,
      level: entry.level,
      message: entry.message,
      ...entry.actorIds?.length ? { actorIds: [...entry.actorIds] } : {},
      ...entry.entityIds?.length ? { entityIds: [...entry.entityIds] } : {},
      ...entry.type ? { type: entry.type } : {}
    };
    if (diagnosticRecorder) diagnosticEvents.push(event);
    if (entry.level === "event" || entry.level === "decision") pendingEvents.push(event);
  });
  function diagnosticState() {
    return diagnosticRecorder ? {
      active: true,
      startedAtTick: diagnosticStartedAtTick,
      maxMinutes: diagnosticMaxMinutes
    } : { active: false };
  }
  function restorationState() {
    return restoring ? {
      active: true,
      currentTick: world.time,
      targetTick: restoreTargetTick
    } : { active: false };
  }
  function state() {
    return {
      running,
      ticksPerSecond,
      diagnosticCapture: diagnosticState(),
      restoration: restorationState()
    };
  }
  function drainEvents() {
    return pendingEvents.splice(0, pendingEvents.length);
  }
  function publish(type) {
    workerScope.postMessage({
      type,
      frame: viewRecorder.snapshot(world),
      events: drainEvents(),
      ...state()
    });
    lastPublishAt = performance.now();
  }
  function publishState() {
    workerScope.postMessage({ type: "state", ...state() });
  }
  function startDiagnosticCapture(maxMinutes = DEFAULT_DIAGNOSTIC_CAPTURE_MINUTES) {
    if (restoring) throw new Error("Wait for village restoration to finish before capturing diagnostics.");
    if (diagnosticRecorder) {
      throw new Error("A diagnostic capture is already active.");
    }
    const boundedMinutes = Math.max(
      1,
      Math.min(MAX_DIAGNOSTIC_CAPTURE_MINUTES, Math.floor(maxMinutes))
    );
    diagnosticRecorder = new SimulationDebugRecorder({
      snapshotInterval: DIAGNOSTIC_SNAPSHOT_INTERVAL
    });
    diagnosticStartedAtTick = world.time;
    diagnosticMaxMinutes = boundedMinutes;
    diagnosticEvents = [];
    diagnosticRecorder.start(world);
    publishState();
  }
  function finishDiagnosticCapture() {
    if (!diagnosticRecorder || diagnosticStartedAtTick === void 0) return;
    const duration = world.time - diagnosticStartedAtTick;
    const bundle = diagnosticRecorder.finish(world, diagnosticEvents, {
      title: "Village browser diagnostic capture",
      scenario: "default-village-browser",
      duration,
      sourceCommit: null,
      packageVersion: null,
      seed: world.chanceSeed
    });
    diagnosticRecorder = void 0;
    diagnosticStartedAtTick = void 0;
    diagnosticMaxMinutes = void 0;
    diagnosticEvents = [];
    workerScope.postMessage({ type: "diagnostic-capture", bundle });
    publishState();
  }
  function afterSimulationTick() {
    diagnosticRecorder?.afterTick(world);
    if (diagnosticRecorder && diagnosticStartedAtTick !== void 0 && diagnosticMaxMinutes !== void 0 && world.time - diagnosticStartedAtTick >= diagnosticMaxMinutes) {
      finishDiagnosticCapture();
    }
  }
  function runSimulationTicks(count) {
    for (let index = 0; index < count; index++) {
      simulation.tick();
      afterSimulationTick();
    }
  }
  function stopTimer() {
    if (timer !== void 0) clearTimeout(timer);
    timer = void 0;
  }
  function scheduleLoop() {
    stopTimer();
    if (!running) return;
    timer = setTimeout(runLoop, LOOP_INTERVAL_MS);
  }
  function runLoop() {
    if (!running) return;
    const now = performance.now();
    const elapsedMs = Math.max(0, now - lastLoopAt);
    lastLoopAt = now;
    tickBudget += elapsedMs * ticksPerSecond / 1e3;
    const ticksToRun = Math.min(MAX_TICKS_PER_LOOP, Math.floor(tickBudget));
    if (ticksToRun > 0) {
      tickBudget -= ticksToRun;
      runSimulationTicks(ticksToRun);
    }
    if (ticksToRun > 0 && now - lastPublishAt >= VIEW_PUBLISH_INTERVAL_MS) {
      publish("update");
    }
    scheduleLoop();
  }
  function start() {
    if (restoring) throw new Error("Village restoration is still in progress.");
    if (running) return;
    running = true;
    tickBudget = 0;
    lastLoopAt = performance.now();
    publishState();
    scheduleLoop();
  }
  function pause() {
    if (!running) return;
    running = false;
    tickBudget = 0;
    stopTimer();
    publish("update");
  }
  function step(minutes = 1) {
    if (restoring) throw new Error("Village restoration is still in progress.");
    const wholeMinutes = Math.max(1, Math.min(MAX_STEP_MINUTES, Math.floor(minutes)));
    if (running) pause();
    runSimulationTicks(wholeMinutes);
    publish("update");
  }
  function setSpeed(nextTicksPerSecond) {
    if (!Number.isFinite(nextTicksPerSecond) || nextTicksPerSecond <= 0) {
      throw new Error("Simulation speed must be a positive number of ticks per second.");
    }
    ticksPerSecond = Math.min(MAX_TICKS_PER_SECOND, nextTicksPerSecond);
    tickBudget = 0;
    lastLoopAt = performance.now();
    publishState();
  }
  function runRestoreChunk() {
    if (!restoring || restoreTargetTick === void 0) return;
    const remaining = restoreTargetTick - world.time;
    if (remaining <= 0) {
      restoring = false;
      restoreTargetTick = void 0;
      pendingEvents.length = 0;
      publish("update");
      return;
    }
    runSimulationTicks(Math.min(RESTORE_TICKS_PER_CHUNK, remaining));
    publishState();
    setTimeout(runRestoreChunk, 0);
  }
  function restoreToTick(targetTick) {
    if (!Number.isSafeInteger(targetTick) || targetTick < 0) {
      throw new Error("Saved simulation tick must be a non-negative safe integer.");
    }
    if (running) throw new Error("Pause the simulation before restoring a saved village.");
    if (diagnosticRecorder) throw new Error("Finish the diagnostic capture before restoring a saved village.");
    if (restoring) throw new Error("Village restoration is already in progress.");
    if (targetTick < world.time) {
      throw new Error("Replay restoration can only move a fresh village forward.");
    }
    if (targetTick === world.time) {
      publish("update");
      return;
    }
    pendingEvents.length = 0;
    restoring = true;
    restoreTargetTick = targetTick;
    publishState();
    setTimeout(runRestoreChunk, 0);
  }
  workerScope.onmessage = (event) => {
    try {
      const command = event.data;
      if (command.type === "start") start();
      else if (command.type === "pause") pause();
      else if (command.type === "step") step(command.minutes);
      else if (command.type === "set-speed") setSpeed(command.ticksPerSecond);
      else if (command.type === "start-diagnostic-capture") {
        startDiagnosticCapture(command.maxMinutes);
      } else if (command.type === "stop-diagnostic-capture") {
        finishDiagnosticCapture();
      } else if (command.type === "restore-to-tick") {
        restoreToTick(command.tick);
      }
    } catch (error) {
      workerScope.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };
  publish("ready");
})();
