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
        frontExact: { downSpecial: 140, sideHold: 200 },
        tornadoTriple: { downSpecial: 300, sideHold: 500 }
    };

    // ------------------ Begin Visualization Setup ------------------

    // Create and initialize the Canvas overlay for visualization
    const canvas = document.createElement('canvas');
    canvas.id = 'visualizationCanvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none'; // Allow clicks to pass through
    canvas.style.zIndex = '1000'; // Ensure the Canvas is on top
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    // Function to resize the Canvas to match the window size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial resize

    // Define directional sectors with their angle ranges in degrees
    const directionalSectors = [
        { name: 'FRONT', start: 337.5, end: 22.5, color: 'rgba(0, 255, 0, 0.2)' },
        { name: 'FRONT_RIGHT', start: 22.5, end: 67.5, color: 'rgba(255, 165, 0, 0.2)' },
        { name: 'RIGHT', start: 67.5, end: 112.5, color: 'rgba(255, 0, 0, 0.2)' },
        { name: 'REAR_RIGHT', start: 112.5, end: 157.5, color: 'rgba(255, 165, 0, 0.2)' },
        { name: 'REAR', start: 157.5, end: 202.5, color: 'rgba(0, 255, 0, 0.2)' },
        { name: 'REAR_LEFT', start: 202.5, end: 247.5, color: 'rgba(255, 165, 0, 0.2)' },
        { name: 'LEFT', start: 247.5, end: 292.5, color: 'rgba(255, 0, 0, 0.2)' },
        { name: 'FRONT_LEFT', start: 292.5, end: 337.5, color: 'rgba(255, 165, 0, 0.2)' }
    ];

    // Variable to track Canvas visibility
    let canvasVisible = true;

    // Function to toggle Canvas visibility
    function toggleCanvasVisibility() {
        canvasVisible = !canvasVisible;
        canvas.style.display = canvasVisible ? 'block' : 'none';
        console.log(`Canvas visibility set to ${canvasVisible ? 'VISIBLE' : 'INVISIBLE'}.`);
    }

    // Function to handle 'P' key press for toggling Canvas
    window.addEventListener('keydown', function(event) {
        if (event.key.toUpperCase() === 'P') {
            toggleCanvasVisibility();
        }
    });

    // Function to convert degrees to radians
    function degToRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    // Function to convert world coordinates to screen coordinates with rotation
    function worldToScreen(x, y, playerPos, camera) {
        // Calculate the difference between the missile position and the camera (player) position
        const dx = x - camera.x;
        const dy = y - camera.y;
        
        // Apply rotation based on player's rotation
        const rotatedX = dx * Math.cos(-camera.rot) - dy * Math.sin(-camera.rot);
        const rotatedY = dx * Math.sin(-camera.rot) + dy * Math.cos(-camera.rot);
        
        // Scale if necessary (assuming scale = 1 for simplicity)
        const scale = 1;
        
        // Translate to screen coordinates (player is centered)
        const screenX = canvas.width / 2 + rotatedX * scale;
        const screenY = canvas.height / 2 + rotatedY * scale;
        
        return { x: screenX, y: screenY };
    }

    // Function to draw directional sectors with rotation
    function drawDirectionalSectors(playerPos, playerRotation) {
        const { x, y } = playerPos; // Player's position in game world
        const camera = { x: x, y: y, rot: playerRotation }; // Camera centered on player
        const playerScreenPos = worldToScreen(x, y, playerPos, camera); // Centered on screen

        const radius = 150; // Radius of the sectors in pixels

        // Save the current context state
        ctx.save();

        // Translate to the player's screen position
        ctx.translate(playerScreenPos.x, playerScreenPos.y);

        // Rotate the context by the player's rotation
        ctx.rotate(playerRotation);

        directionalSectors.forEach(sector => {
            let startAngle = degToRad(sector.start);
            let endAngle = degToRad(sector.end);

            // Handle sectors that span across 0 degrees
            if (sector.start > sector.end) {
                endAngle += 2 * Math.PI;
            }

            ctx.beginPath();
            ctx.moveTo(0, 0); // Player's position
            ctx.arc(0, 0, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = sector.color;
            ctx.fill();

            // Optional: Draw sector labels
            const midAngle = (startAngle + endAngle) / 2;
            const labelX = (radius + 20) * Math.cos(midAngle);
            const labelY = (radius + 20) * Math.sin(midAngle);
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sector.name, labelX, labelY);
        });

        // Restore the context to its original state
        ctx.restore();
    }

    // Function to draw relative angle lines for each missile with rotation
    function drawMissileAngles(missileGroups, playerPos, playerRotation) {
        const { x, y, rot } = playerPos;
        const camera = { x: x, y: y, rot: playerRotation }; // Camera centered on player
        const playerScreenPos = worldToScreen(x, y, playerPos, camera); // Centered on screen

        // Save the current context state
        ctx.save();

        // Translate to the player's screen position
        ctx.translate(playerScreenPos.x, playerScreenPos.y);

        // Rotate the context by the player's rotation
        ctx.rotate(playerRotation);

        missileGroups.forEach(group => {
            const relativeAngle = calculateRelativeAngle(group.averagePos, playerPos);
            const angleDeg = relativeAngle * (180 / Math.PI);

            // Calculate end point of the line
            const lineLength = 100; // Length of the angle line in pixels
            const endX = lineLength * Math.cos(relativeAngle);
            const endY = lineLength * Math.sin(relativeAngle);

            // Draw the line
            ctx.beginPath();
            ctx.moveTo(0, 0); // Player's position
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Optional: Display angle value
            ctx.fillStyle = 'yellow';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${angleDeg.toFixed(1)}°`, endX, endY);
        });

        // Restore the context to its original state
        ctx.restore();
    }

    // ------------------ End Visualization Setup ------------------

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
            // COMMENTED OUT: handle Tornado Triple Missile as per request
            // await dodgeTornadoTripleMissile(missileGroup.ids);
            // maneuverDuration = maneuverParams.tornadoTriple.downSpecial + maneuverParams.tornadoTriple.sideHold;
            console.log("Tornado Triple Missile dodge maneuver is disabled.");
            return; // Exit as the maneuver is disabled
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
                case 'FRONT':
                    await dodgeFrontExact(missileGroup.ids);
                    maneuverDuration = maneuverParams.frontExact.downSpecial + maneuverParams.frontExact.sideHold;
                    break;
                // COMMENTED OUT: Maneuvers for other sectors
                /*
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
                */
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

    // COMMENTED OUT: Dodge strategies for other sectors
    /*
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
    */

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
            // maneuverParams.exactSide.sideHold += 50; // Not used since exactSide maneuvers are commented out
            console.log("Increasing LEFT side hold duration due to low success rate.");
        }
        if (dodgeSuccessRates.RIGHT < 0.5) {
            maneuverParams.frontRight.sideHold += 50;
            // maneuverParams.exactSide.sideHold += 50; // Not used since exactSide maneuvers are commented out
            console.log("Increasing RIGHT side hold duration due to low success rate.");
        }
        // Limit the maximum hold duration
        maneuverParams.frontLeft.sideHold = Math.min(maneuverParams.frontLeft.sideHold, 500);
        maneuverParams.frontRight.sideHold = Math.min(maneuverParams.frontRight.sideHold, 500);
        // maneuverParams.exactSide.sideHold = Math.min(maneuverParams.exactSide.sideHold, 600); // Not used
    }

    // Function to adjust successful dodges after a certain time
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

        // ------------------ Begin Visualization Drawing ------------------

        if (canvasVisible) {
            // Clear the Canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw directional sectors with rotation
            drawDirectionalSectors(playerPos, shipOrientation);

            // Draw missile relative angle lines with rotation
            drawMissileAngles(missileGroups, playerPos, shipOrientation);
        }

        // ------------------ End Visualization Drawing ------------------

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
