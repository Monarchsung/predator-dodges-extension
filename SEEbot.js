(function() {
    'use strict';

    console.log("Initializing Advanced Missile Tracking and Adaptive Auto-Dodge module for Predator...");

    // Prevent multiple instances
    if (window.hasOwnProperty('missileTrackingModule')) {
        console.warn("Missile Tracking Module is already running.");
        return;
    }
    window.missileTrackingModule = true;

    // Ensure that necessary game objects are accessible
    if (typeof Mobs === 'undefined' || typeof MobType === 'undefined' || typeof Players === 'undefined' || typeof game === 'undefined' || typeof Network === 'undefined') {
        console.error('Required game objects (Mobs, MobType, Players, game, Network) are not defined.');
        return;
    }

    // Define the missile types you're interested in
    const missileTypes = new Set([
        MobType.PredatorMissile,
        MobType.TornadoSingleMissile,
        MobType.TornadoTripleMissile,
        MobType.ProwlerMissile,
        MobType.GoliathMissile,
        MobType.MohawkMissile,
        MobType.CarrotMissile
    ]);

    // Configurable threshold distance (in world units) to trigger dodge
    const DODGE_THRESHOLD_DISTANCE = 250;

    // Player and Dodge Variables
    let activeKeys = new Set();
    let dodgeInProgress = false;
    let dodgeCooldown = false;
    let currentManeuver = null;

    // Store ship orientation data
    let shipOrientation = 0; // in radians

    // Set to keep track of missiles that have already been dodged
    const dodgedMissiles = new Set();

    // Tracking dodge outcomes
    let dodgeHistory = [];
    const MAX_HISTORY_LENGTH = 50; // Adjust as needed
    let dodgeSuccessRates = { LEFT: 0.5, RIGHT: 0.5 }; // Initial success rates

    // Dynamic parameters for maneuvers
    let maneuverParams = {
        frontLeft: { downSpecial: 150, sideHold: 250 },
        frontRight: { downSpecial: 150, sideHold: 250 },
        exactSide: { downSpecial: 150, sideHold: 350 },
        fromBack: { upSpecial: 100, sideHold: 100 },
        frontExact: { downSpecial: 400, sideHold: 400 },
        tornadoTriple: { downSpecial: 300, sideHold: 500 }
    };

    // Function to get the player's current position and rotation
    function getPlayer() {
        const player = Players.get(game.myID);
        if (!player) {
            console.warn("Player data not available yet.");
            return null;
        }
        return player;
    }

    function getPlayerPosition(player) {
        if (player && player.status === 0 && !player.spectate) {
            const spritePos = player.pos;
            return { x: spritePos.x, y: spritePos.y, rot: player.rot };
        }
        // Default to (0,0) if player data is not available
        return { x: 0, y: 0, rot: 0 };
    }

    // Function to calculate Euclidean distance between two points
    function calculateDistance(x1, y1, x2, y2) {
        const deltaX = x1 - x2;
        const deltaY = y1 - y2;
        return Math.hypot(deltaX, deltaY);
    }

    // Function to calculate the relative angle between missile and player
    function calculateRelativeAngle(missilePos, playerPos) {
        const angleToMissile = Math.atan2(missilePos.y - playerPos.y, missilePos.x - playerPos.x);
        let relativeAngle = angleToMissile - playerPos.rot;
        relativeAngle = (relativeAngle + 2 * Math.PI) % (2 * Math.PI);
        return relativeAngle;
    }

    // Function to categorize the missile's approach direction
    function getApproachDirection(relativeAngle) {
        const angleDeg = relativeAngle * (180 / Math.PI);
        if (angleDeg >= 337.5 || angleDeg < 22.5) {
            return 'FRONT';
        } else if (angleDeg >= 22.5 && angleDeg < 67.5) {
            return 'FRONT_RIGHT';
        } else if (angleDeg >= 67.5 && angleDeg < 112.5) {
            return 'RIGHT';
        } else if (angleDeg >= 112.5 && angleDeg < 157.5) {
            return 'REAR_RIGHT';
        } else if (angleDeg >= 157.5 && angleDeg < 202.5) {
            return 'REAR';
        } else if (angleDeg >= 202.5 && angleDeg < 247.5) {
            return 'REAR_LEFT';
        } else if (angleDeg >= 247.5 && angleDeg < 292.5) {
            return 'LEFT';
        } else if (angleDeg >= 292.5 && angleDeg < 337.5) {
            return 'FRONT_LEFT';
        } else {
            return 'UNKNOWN';
        }
    }

    // Function to execute dodge maneuver based on specific strategy
    async function executeDodgeManeuver(player, missileGroup, approachDirection) {
        if (dodgeInProgress || dodgeCooldown) return;

        // Only apply maneuvers for Predator plane type
        if (player.type !== PlaneType.Predator) return;

        console.log(`Executing dodge maneuver for missile(s) ID(s) ${missileGroup.ids.join(', ')}, approach direction: ${approachDirection}`);

        // Choose the appropriate dodge maneuver based on missile type and approach direction
        let maneuverDuration = 0;

        if (missileGroup.type === MobType.TornadoTripleMissile) {
            // Dodge Strategy for Tornado Triple Missile
            await dodgeTornadoTripleMissile(missileGroup.ids);
            maneuverDuration = maneuverParams.tornadoTriple.downSpecial + maneuverParams.tornadoTriple.sideHold;
        } else {
            // General dodge strategies based on approach direction
            switch (approachDirection) {
                case 'FRONT_LEFT':
                    await dodgeFrontLeft(missileGroup.ids);
                    maneuverDuration = maneuverParams.frontLeft.downSpecial + maneuverParams.frontLeft.sideHold;
                    break;
                case 'FRONT_RIGHT':
                    await dodgeFrontRight(missileGroup.ids);
                    maneuverDuration = maneuverParams.frontRight.downSpecial + maneuverParams.frontRight.sideHold;
                    break;
                case 'LEFT':
                case 'RIGHT':
                    await dodgeExactSide(approachDirection, missileGroup.ids);
                    maneuverDuration = maneuverParams.exactSide.downSpecial + maneuverParams.exactSide.sideHold;
                    break;
                case 'REAR_LEFT':
                case 'REAR_RIGHT':
                case 'REAR':
                    await dodgeFromBack(missileGroup.ids);
                    maneuverDuration = maneuverParams.fromBack.upSpecial + maneuverParams.fromBack.sideHold;
                    break;
                case 'FRONT':
                    await dodgeFrontExact(missileGroup.ids);
                    maneuverDuration = maneuverParams.frontExact.downSpecial + maneuverParams.frontExact.sideHold;
                    break;
                default:
                    console.log(`No specific dodge strategy for approach direction: ${approachDirection}`);
                    return;
            }
        }

        // After executing the dodge, mark the missiles as dodged
        for (const missileId of missileGroup.ids) {
            dodgedMissiles.add(missileId);
            console.log(`Missile ID ${missileId} marked as dodged.`);
        }

        // Start the dodge cooldown based on the maneuver duration
        startDodgeCooldown(maneuverDuration);
    }

    // Implement specific dodge strategies with dynamic key hold durations
    async function dodgeFrontLeft(missileIds) {
        console.log("Dodge Strategy: Front Left Missile - Left Dodge");
        dodgeInProgress = true;
        currentManeuver = 'dodgeFrontLeft';

        // Record the dodge attempt
        recordDodgeAttempt('LEFT', missileIds);

        // Hold DOWN and SPECIAL
        sendKeyHold("DOWN", true);
        sendKeyHold("SPECIAL", true);
        await sleep(maneuverParams.frontLeft.downSpecial);

        // Hold LEFT
        sendKeyHold("LEFT", true);
        await sleep(maneuverParams.frontLeft.sideHold);

        // Release all keys
        sendKeyHold("DOWN", false);
        sendKeyHold("SPECIAL", false);
        sendKeyHold("LEFT", false);

        console.log("Dodge Strategy: Left Dodge Complete");
        dodgeInProgress = false;
        currentManeuver = null;
    }

    async function dodgeFrontRight(missileIds) {
        console.log("Dodge Strategy: Front Right Missile - Right Dodge");
        dodgeInProgress = true;
        currentManeuver = 'dodgeFrontRight';

        // Record the dodge attempt
        recordDodgeAttempt('RIGHT', missileIds);

        // Hold DOWN and SPECIAL
        sendKeyHold("DOWN", true);
        sendKeyHold("SPECIAL", true);
        await sleep(maneuverParams.frontRight.downSpecial);

        // Hold RIGHT
        sendKeyHold("RIGHT", true);
        await sleep(maneuverParams.frontRight.sideHold);

        // Release all keys
        sendKeyHold("DOWN", false);
        sendKeyHold("SPECIAL", false);
        sendKeyHold("RIGHT", false);

        console.log("Dodge Strategy: Right Dodge Complete");
        dodgeInProgress = false;
        currentManeuver = null;
    }

    async function dodgeExactSide(side, missileIds) {
        console.log(`Dodge Strategy: Exact Side Maneuver - ${side}`);
        dodgeInProgress = true;
        currentManeuver = `dodgeExactSide_${side}`;

        // Record the dodge attempt
        recordDodgeAttempt(side, missileIds);

        // Hold DOWN and SPECIAL
        sendKeyHold("DOWN", true);
        sendKeyHold("SPECIAL", true);
        await sleep(maneuverParams.exactSide.downSpecial);

        // Hold side key
        sendKeyHold(side, true);
        await sleep(maneuverParams.exactSide.sideHold);

        // Release all keys
        sendKeyHold("DOWN", false);
        sendKeyHold("SPECIAL", false);
        sendKeyHold(side, false);

        console.log(`Dodge Strategy: Exact Side Maneuver - ${side} Complete`);
        dodgeInProgress = false;
        currentManeuver = null;
    }

    async function dodgeFromBack(missileIds) {
        console.log("Dodge Strategy: Missile Coming from Back");
        dodgeInProgress = true;
        currentManeuver = 'dodgeFromBack';

        // Record the dodge attempt (use safe direction)
        const safeDirection = determineSafeDirection();
        recordDodgeAttempt(safeDirection, missileIds);

        // Hold UP and SPECIAL
        sendKeyHold("UP", true);
        sendKeyHold("SPECIAL", true);
        await sleep(maneuverParams.fromBack.upSpecial);

        // Hold LEFT or RIGHT based on safety
        sendKeyHold(safeDirection, true);
        await sleep(maneuverParams.fromBack.sideHold);

        // Release all keys
        sendKeyHold("UP", false);
        sendKeyHold("SPECIAL", false);
        sendKeyHold(safeDirection, false);

        console.log("Dodge Strategy: Missile Coming from Back Complete");
        dodgeInProgress = false;
        currentManeuver = null;
    }

    async function dodgeFrontExact(missileIds) {
        console.log("Dodge Strategy: Front Exact Missile Dodge");
        dodgeInProgress = true;
        currentManeuver = 'dodgeFrontExact';

        // Record the dodge attempt (use safe direction)
        const safeDirection = determineSafeDirection();
        recordDodgeAttempt(safeDirection, missileIds);

        // Hold DOWN and SPECIAL
        sendKeyHold("DOWN", true);
        sendKeyHold("SPECIAL", true);
        await sleep(maneuverParams.frontExact.downSpecial);

        // Hold LEFT or RIGHT based on safety
        sendKeyHold(safeDirection, true);
        await sleep(maneuverParams.frontExact.sideHold);

        // Release all keys
        sendKeyHold("DOWN", false);
        sendKeyHold("SPECIAL", false);
        sendKeyHold(safeDirection, false);

        console.log("Dodge Strategy: Front Exact Dodge Complete");
        dodgeInProgress = false;
        currentManeuver = null;
    }

    async function dodgeTornadoTripleMissile(missileIds) {
        console.log("Dodge Strategy: Tornado Triple Missile Dodge");
        dodgeInProgress = true;
        currentManeuver = 'dodgeTornadoTripleMissile';

        // Record the dodge attempt (use safe direction)
        const safeDirection = determineSafeDirection();
        recordDodgeAttempt(safeDirection, missileIds);

        // Hold DOWN and SPECIAL
        sendKeyHold("DOWN", true);
        sendKeyHold("SPECIAL", true);
        await sleep(maneuverParams.tornadoTriple.downSpecial);

        // Hold LEFT or RIGHT based on safety
        sendKeyHold(safeDirection, true);
        await sleep(maneuverParams.tornadoTriple.sideHold);

        // Release all keys
        sendKeyHold("DOWN", false);
        sendKeyHold("SPECIAL", false);
        sendKeyHold(safeDirection, false);

        console.log("Dodge Strategy: Tornado Triple Missile Dodge Complete");
        dodgeInProgress = false;
        currentManeuver = null;
    }

    // Function to send key hold/release events
    function sendKeyHold(key, state) {
        if (state && !activeKeys.has(key)) {
            Network.sendKey(key, true);
            activeKeys.add(key);
            console.log(`Holding ${key}`);
        } else if (!state && activeKeys.has(key)) {
            Network.sendKey(key, false);
            activeKeys.delete(key);
            console.log(`Released ${key}`);
        }
    }

    // Function to start dodge cooldown
    function startDodgeCooldown(duration) {
        dodgeCooldown = true;
        console.log(`Dodge cooldown started for ${duration} ms.`);

        setTimeout(() => {
            dodgeCooldown = false;
            console.log("Dodge cooldown ended.");
        }, duration);
    }

    // Sleep function for async delays
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Enhanced determineSafeDirection function with learning
    function determineSafeDirection() {
        const player = getPlayer();
        if (!player) return "LEFT"; // Default to LEFT if player not found

        const playerPos = getPlayerPosition(player);
        const activeMobs = Mobs.mobs();

        let leftThreatLevel = 0;
        let rightThreatLevel = 0;

        for (const mobId in activeMobs) {
            const missile = activeMobs[mobId];
            if (!missile || !missileTypes.has(missile.type)) continue;
            if (missile.owner === game.myID) continue; // Skip player's own missiles
            if (dodgedMissiles.has(missile.id)) continue;
            if (!missile.pos) continue;

            const missilePos = missile.pos;
            const distance = calculateDistance(missilePos.x, missilePos.y, playerPos.x, playerPos.y);

            if (distance > DODGE_THRESHOLD_DISTANCE) continue;

            const relativeAngle = calculateRelativeAngle(missilePos, playerPos);
            const approachDir = getApproachDirection(relativeAngle);

            // Assign threat levels based on missile approach direction and speed
            const missileSpeed = calculateMissileSpeed(missile);
            const threatContribution = (1 / distance) * missileSpeed;

            if (approachDir.includes('LEFT')) {
                leftThreatLevel += threatContribution;
            }
            if (approachDir.includes('RIGHT')) {
                rightThreatLevel += threatContribution;
            }
        }

        // Adjust threat levels based on dodge success rates
        leftThreatLevel /= dodgeSuccessRates.LEFT || 0.1; // Avoid division by zero
        rightThreatLevel /= dodgeSuccessRates.RIGHT || 0.1;

        console.log(`Left Threat Level: ${leftThreatLevel.toFixed(3)}, Right Threat Level: ${rightThreatLevel.toFixed(3)}`);
        console.log(`Dodge Success Rates - LEFT: ${(dodgeSuccessRates.LEFT * 100).toFixed(1)}%, RIGHT: ${(dodgeSuccessRates.RIGHT * 100).toFixed(1)}%`);

        if (leftThreatLevel < rightThreatLevel) {
            console.log("Choosing LEFT as safer direction based on threat level and success rate.");
            return "LEFT";
        } else if (rightThreatLevel < leftThreatLevel) {
            console.log("Choosing RIGHT as safer direction based on threat level and success rate.");
            return "RIGHT";
        } else {
            // If threat levels are equal, choose the direction with higher success rate
            if (dodgeSuccessRates.LEFT >= dodgeSuccessRates.RIGHT) {
                console.log("Threat levels equal, choosing LEFT based on higher success rate.");
                return "LEFT";
            } else {
                console.log("Threat levels equal, choosing RIGHT based on higher success rate.");
                return "RIGHT";
            }
        }
    }

    // Function to calculate missile speed
    function calculateMissileSpeed(missile) {
        if (!missile || !missile.speed) return 1; // Default speed factor
        return Math.hypot(missile.speed.x, missile.speed.y);
    }

    // Function to record dodge attempts
    function recordDodgeAttempt(direction, missileIds) {
        const attempt = {
            timestamp: Date.now(),
            direction: direction,
            missileIds: missileIds,
            success: null
        };
        dodgeHistory.push(attempt);

        // Limit the history length
        if (dodgeHistory.length > MAX_HISTORY_LENGTH) {
            dodgeHistory.shift();
        }
    }

    // Function to update dodge outcomes
    function updateDodgeOutcomes(hitMissileId) {
        // Find the dodge attempt associated with this missile
        for (let i = dodgeHistory.length - 1; i >= 0; i--) {
            const attempt = dodgeHistory[i];
            if (attempt.missileIds.includes(hitMissileId) && attempt.success === null) {
                attempt.success = false; // Dodge failed
                console.log(`Dodge attempt in direction ${attempt.direction} failed (Missile ID ${hitMissileId} hit the player).`);
                updateSuccessRates();
                return;
            }
        }
        // If the missile was not associated with any recorded dodge attempt, it's a hit without a dodge
    }

    // Function to update success rates based on dodge history
    function updateSuccessRates() {
        let leftSuccess = 0;
        let leftAttempts = 0;
        let rightSuccess = 0;
        let rightAttempts = 0;

        for (const attempt of dodgeHistory) {
            if (attempt.success !== null) {
                if (attempt.direction === 'LEFT') {
                    leftAttempts++;
                    if (attempt.success) leftSuccess++;
                } else if (attempt.direction === 'RIGHT') {
                    rightAttempts++;
                    if (attempt.success) rightSuccess++;
                }
            }
        }

        dodgeSuccessRates.LEFT = leftAttempts > 0 ? leftSuccess / leftAttempts : 0.5;
        dodgeSuccessRates.RIGHT = rightAttempts > 0 ? rightSuccess / rightAttempts : 0.5;

        // Dynamically adjust maneuver parameters based on success rates
        adjustManeuverParameters();
    }

    // Function to adjust maneuver parameters dynamically
    function adjustManeuverParameters() {
        // Example: If success rate is low, increase side hold duration
        if (dodgeSuccessRates.LEFT < 0.5) {
            maneuverParams.frontLeft.sideHold += 50;
            maneuverParams.exactSide.sideHold += 50;
            console.log("Increasing LEFT side hold duration due to low success rate.");
        }
        if (dodgeSuccessRates.RIGHT < 0.5) {
            maneuverParams.frontRight.sideHold += 50;
            maneuverParams.exactSide.sideHold += 50;
            console.log("Increasing RIGHT side hold duration due to low success rate.");
        }
        // Limit the maximum hold duration
        maneuverParams.frontLeft.sideHold = Math.min(maneuverParams.frontLeft.sideHold, 500);
        maneuverParams.frontRight.sideHold = Math.min(maneuverParams.frontRight.sideHold, 500);
        maneuverParams.exactSide.sideHold = Math.min(maneuverParams.exactSide.sideHold, 600);
    }

    // Function to mark dodge attempts as successful after a certain time without being hit
    function evaluateDodgeSuccesses() {
        const now = Date.now();
        const SUCCESS_THRESHOLD = 2000; // Time in ms after which we consider the dodge successful

        for (const attempt of dodgeHistory) {
            if (attempt.success === null && now - attempt.timestamp > SUCCESS_THRESHOLD) {
                attempt.success = true; // Dodge was successful
                console.log(`Dodge attempt in direction ${attempt.direction} was successful.`);
                updateSuccessRates();
            }
        }
    }

    // Hook into the game's event system to detect when the player is hit
    const originalPlayerHitHandler = Players.impact;
    Players.impact = function(msg) {
        if (msg.id === game.myID) {
            // Player was hit
            const hitMissileId = msg.projectileId; // Assuming projectileId is available
            updateDodgeOutcomes(hitMissileId);
        }
        // Call the original handler
        originalPlayerHitHandler.call(Players, msg);
    };

    // Main tracking function
    function trackPlayerAndMissiles() {
        const player = getPlayer();
        if (!player) {
            requestAnimationFrame(trackPlayerAndMissiles);
            return;
        }

        const playerPos = getPlayerPosition(player);
        shipOrientation = playerPos.rot;

        // Evaluate pending dodge successes
        evaluateDodgeSuccesses();

        // Get all missiles
        const activeMobs = Mobs.mobs();

        // Group missiles that come in sets of three
        const missileGroups = [];
        const processedMissiles = new Set();

        for (const mobId in activeMobs) {
            const missile = activeMobs[mobId];

            // Skip if missile has already been dodged or processed
            if (dodgedMissiles.has(missile.id) || processedMissiles.has(missile.id)) continue;

            if (!missile || !missileTypes.has(missile.type)) continue;
            if (missile.owner === game.myID) continue; // Skip player's own missiles

            // Safety checks
            if (!missile.pos || typeof missile.pos.x !== 'number' || typeof missile.pos.y !== 'number') {
                continue;
            }

            const missilePos = missile.pos;
            const distance = calculateDistance(missilePos.x, missilePos.y, playerPos.x, playerPos.y);

            // Prioritize extremely close missiles
            if (distance < DODGE_THRESHOLD_DISTANCE / 2) {
                // Immediate reaction for close missiles
                console.log(`Immediate dodge for extremely close missile ID ${missile.id}`);
                const relativeAngle = calculateRelativeAngle(missilePos, playerPos);
                const approachDirection = getApproachDirection(relativeAngle);

                executeDodgeManeuver(player, {
                    type: missile.type,
                    ids: [missile.id],
                    positions: [missilePos],
                    averagePos: missilePos
                }, approachDirection);
                processedMissiles.add(missile.id);
                continue;
            }

            // Only consider missiles within the threshold distance
            if (distance > DODGE_THRESHOLD_DISTANCE) continue;

            if (missile.type === MobType.TornadoTripleMissile) {
                // Group Tornado Triple Missiles that are close together
                const group = {
                    type: missile.type,
                    ids: [missile.id],
                    positions: [missilePos],
                    averagePos: { x: missilePos.x, y: missilePos.y },
                };
                processedMissiles.add(missile.id);

                // Find other missiles close to this one
                for (const otherId in activeMobs) {
                    if (otherId === mobId) continue;
                    const otherMissile = activeMobs[otherId];

                    if (!otherMissile || otherMissile.type !== MobType.TornadoTripleMissile) continue;
                    if (dodgedMissiles.has(otherMissile.id) || processedMissiles.has(otherMissile.id)) continue;
                    if (!otherMissile.pos) continue;
                    if (otherMissile.owner === game.myID) continue; // Skip player's own missiles

                    const otherPos = otherMissile.pos;
                    const groupDistance = calculateDistance(missilePos.x, missilePos.y, otherPos.x, otherPos.y);
                    if (groupDistance < 50) { // Threshold to consider missiles part of the same group
                        group.ids.push(otherMissile.id);
                        group.positions.push(otherPos);
                        group.averagePos.x += otherPos.x;
                        group.averagePos.y += otherPos.y;
                        processedMissiles.add(otherMissile.id);
                    }
                }

                // Calculate average position
                group.averagePos.x /= group.ids.length;
                group.averagePos.y /= group.ids.length;
                missileGroups.push(group);
            } else {
                // Treat other missiles individually
                missileGroups.push({
                    type: missile.type,
                    ids: [missile.id],
                    positions: [missilePos],
                    averagePos: missilePos,
                });
                processedMissiles.add(missile.id);
            }
        }

        // Find the closest missile group
        let closestGroup = null;
        let minDistance = Infinity;

        for (const group of missileGroups) {
            const groupDistance = calculateDistance(group.averagePos.x, group.averagePos.y, playerPos.x, playerPos.y);
            if (groupDistance < minDistance) {
                minDistance = groupDistance;
                closestGroup = group;
            }
        }

        // If the closest group is within the threshold, assess it
        if (closestGroup && minDistance <= DODGE_THRESHOLD_DISTANCE) {
            const relativeAngle = calculateRelativeAngle(closestGroup.averagePos, playerPos);
            const approachDirection = getApproachDirection(relativeAngle);

            console.log(`Threat detected! Closest Missile Group IDs ${closestGroup.ids.join(', ')} approaching from ${approachDirection}.`);
            executeDodgeManeuver(player, closestGroup, approachDirection);
        }

        // Clean up the dodgedMissiles set
        for (const missileId of dodgedMissiles) {
            if (!(missileId in activeMobs)) {
                dodgedMissiles.delete(missileId);
                console.log(`Missile ID ${missileId} has been removed from dodgedMissiles set.`);
            }
        }

        // Continue the tracking loop
        requestAnimationFrame(trackPlayerAndMissiles);
    }

    // Start the tracking process
    trackPlayerAndMissiles();

    // Handle key events during maneuvers
    window.addEventListener('keydown', function(event) {
        if (dodgeInProgress) {
            const maneuverKeys = ["DOWN", "LEFT", "RIGHT", "UP", "SPECIAL"];
            if (maneuverKeys.includes(event.key.toUpperCase())) {
                event.preventDefault();
            }
        }
    });

    window.addEventListener('keyup', function(event) {
        if (dodgeInProgress) {
            const maneuverKeys = ["DOWN", "LEFT", "RIGHT", "UP", "SPECIAL"];
            if (maneuverKeys.includes(event.key.toUpperCase())) {
                event.preventDefault();
            }
        }
    });

    console.log("Advanced Missile Tracking and Adaptive Auto-Dodge module for Predator initialized successfully.");
})();