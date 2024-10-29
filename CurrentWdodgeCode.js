(function() {
    'use strict';

    console.log("Initializing Optimized Missile Tracking and Auto-Dodge module...");

    // Ensure that necessary game objects are accessible
    if (typeof Mobs === 'undefined' || typeof MobType === 'undefined' || typeof Players === 'undefined' || typeof game === 'undefined') {
        console.error('Required game objects (Mobs, MobType, Players, game) are not defined.');
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
    const DODGE_THRESHOLD_DISTANCE = 150; // Increased from 100 to 150 for earlier detection

    // Create a canvas overlay for visualization
    const canvas = document.createElement('canvas');
    canvas.id = 'missileOverlay';
    canvas.style.position = 'fixed'; // Fixed to viewport
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.pointerEvents = 'none'; // Allow clicks to pass through
    canvas.style.zIndex = '1000'; // Ensure it's on top
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    // Function to resize the canvas when the window size changes
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    // Add event listener for window resize
    window.addEventListener('resize', resizeCanvas);

    // Player and Dodge Variables
    let activeKeys = new Set();
    let dodgeInProgress = false;
    let dodgeCooldown = false;
    let myShipHitbox = null;
    let isHitboxVisible = false;

    // Function to get the player's current position
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
            const spritePos = player.sprites.sprite.position;
            return { x: spritePos.x, y: spritePos.y };
        }
        // Default to (0,0) if player data is not available
        return { x: 0, y: 0 };
    }

    // Function to convert world coordinates to screen coordinates based on player's position
    function worldToScreen(worldX, worldY, playerX, playerY) {
        const scale = game.scale || 1; // Assuming 'scale' is the zoom level, default to 1 if undefined
        const halfScreenX = window.innerWidth / 2;
        const halfScreenY = window.innerHeight / 2;

        // Calculate the difference between missile and player positions
        const deltaX = (worldX - playerX) * scale;
        const deltaY = (worldY - playerY) * scale;

        // Convert to screen coordinates with the player at the center
        const screenX = halfScreenX + deltaX;
        const screenY = halfScreenY + deltaY;

        return { screenX, screenY };
    }

    // Function to create the player's hitbox if it doesn't exist
    function createHitboxIfNeeded(playerPos, player) {
        if (!myShipHitbox) {
            myShipHitbox = new PIXI.Graphics();
            game.graphics.layers.playernames.addChild(myShipHitbox);
            console.log("Hitbox created.");
        }

        myShipHitbox.clear();
        myShipHitbox.lineStyle(2, 0x00FF00, 1);

        const isGoliath = player.type === PlaneType.Goliath;

        // Define hitbox dimensions based on player type
        const width = isGoliath ? 87 : 25;
        const height = isGoliath ? 42 : 35;

        // Draw the hitbox rectangle centered at (0,0)
        myShipHitbox.drawRect(-width, -height, width * 2, height * 2);

        // Position the hitbox at the center of the screen (assuming player is centered)
        myShipHitbox.position.set(playerPos.screenX, playerPos.screenY);
        myShipHitbox.rotation = player.sprites.sprite.rotation;
        myShipHitbox.visible = isHitboxVisible;
    }

    // Function to toggle hitbox visibility
    function toggleHitboxVisibility(event) {
        if (event.key === 'M' || event.key === 'm') {
            isHitboxVisible = !isHitboxVisible;
            if (myShipHitbox) {
                myShipHitbox.visible = isHitboxVisible;
            }
            console.log(`Hitbox visibility: ${isHitboxVisible}`);
        }
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

    // Function to calculate Euclidean distance between two points in world coordinates
    function calculateDistance(x1, y1, x2, y2) {
        const deltaX = x1 - x2;
        const deltaY = y1 - y2;
        return Math.hypot(deltaX, deltaY);
    }

    // Function to predict if a missile will hit the hitbox based on threshold distance
    function willMissileHitHitbox(missile, playerPos) {
        // Calculate current distance
        const currentDistance = calculateDistance(missile.pos.x, missile.pos.y, playerPos.x, playerPos.y);

        console.log(`Missile ID ${missile.id} Current Distance: ${currentDistance.toFixed(2)} units`);

        // If current distance is less than or equal to threshold, consider it a threat
        if (currentDistance <= DODGE_THRESHOLD_DISTANCE) {
            console.log(`Missile ID ${missile.id} is within the threshold distance (${DODGE_THRESHOLD_DISTANCE} units).`);
            return true;
        }

        return false;
    }

    // Function to execute dodge maneuver
    async function executeDodgeManeuver(player, missile, playerPos) {
        if (dodgeInProgress || dodgeCooldown) return;

        console.log("Executing dodge maneuver...");
        dodgeInProgress = true;

        // Hold DOWN and SPECIAL keys
        sendKeyHold("DOWN", true);
        sendKeyHold("SPECIAL", true);
        await sleep(100); // Reduced delay from 200ms to 100ms

        // Determine dodge direction based on missile's relative position
        const direction = missile.pos.x < playerPos.x ? "LEFT" : "RIGHT";
        sendKeyHold(direction, true);
        await sleep(150); // Reduced delay from 300ms to 150ms

        // Release all keys
        sendKeyHold("DOWN", false);
        sendKeyHold("SPECIAL", false);
        sendKeyHold(direction, false);

        console.log("Dodge complete.");
        dodgeInProgress = false;
        startDodgeCooldown();
    }

    // Function to start dodge cooldown
    function startDodgeCooldown() {
        dodgeCooldown = true;
        console.log("Dodge cooldown started.");

        setTimeout(() => {
            dodgeCooldown = false;
            console.log("Dodge cooldown ended.");
        }, 500); // Reduced cooldown from 1000ms to 500ms
    }

    // Sleep function for async delays
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Function to draw missiles on the canvas
    function drawMissiles(playerPos) {
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Iterate over all active mobs to find missiles
        const activeMobs = Mobs.mobs(); // Assuming Mobs.mobs() returns an object of active mobs

        for (const mobId in activeMobs) {
            const mob = activeMobs[mobId];
            if (!mob || !missileTypes.has(mob.type)) continue;

            // Safety checks to ensure required properties exist
            if (!mob.pos || typeof mob.pos.x !== 'number' || typeof mob.pos.y !== 'number') {
                console.warn(`Missile ID ${mobId} lacks position data.`);
                continue;
            }

            // Get current missile position directly from the game
            const missilePosX = mob.pos.x;
            const missilePosY = mob.pos.y;

            // Convert world coordinates to screen coordinates
            const { screenX, screenY } = worldToScreen(missilePosX, missilePosY, playerPos.x, playerPos.y);

            // Only draw if the missile is within the visible screen area
            if (screenX < 0 || screenX > window.innerWidth || screenY < 0 || screenY > window.innerHeight) continue;

            // Draw a circle representing the missile
            ctx.beginPath();
            ctx.arc(screenX, screenY, 5, 0, 2 * Math.PI); // Radius of 5 pixels
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)'; // Semi-transparent red
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'black';
            ctx.stroke();

            // Optionally, display missile type
            ctx.font = '12px Arial';
            ctx.fillStyle = 'white';
            ctx.fillText(mob.type, screenX + 6, screenY - 6);
        }
    }

    // Function to update hitbox based on player position
    function updateHitbox(playerPos, player) {
        createHitboxIfNeeded(playerPos, player);
    }

    // Main tracking function
    function trackPlayerAndMissiles() {
        const player = getPlayer();
        if (!player) {
            requestAnimationFrame(trackPlayerAndMissiles);
            return;
        }

        const playerPos = getPlayerPosition(player);

        // Draw missiles on the canvas
        drawMissiles(playerPos);

        // Iterate over active missiles to detect threats
        const activeMobs = Mobs.mobs();

        for (const mobId in activeMobs) {
            const missile = activeMobs[mobId];
            if (!missile || !missileTypes.has(missile.type)) continue;

            // Safety checks
            if (!missile.pos || typeof missile.pos.x !== 'number' || typeof missile.pos.y !== 'number') {
                console.warn(`Missile ID ${mobId} lacks position data.`);
                continue;
            }

            // Predict if this missile will hit the hitbox based on threshold distance
            if (willMissileHitHitbox(missile, playerPos)) {
                console.warn(`Threat detected! Missile ID ${mobId} is approaching.`);
                executeDodgeManeuver(player, missile, playerPos);
                break; // Handle one threat at a time
            }
        }

        // Continue the tracking loop
        requestAnimationFrame(trackPlayerAndMissiles);
    }

    // Initialize the hitbox
    function initializeHitbox() {
        const player = getPlayer();
        if (!player) return;

        const playerPos = getPlayerPosition(player);
        const transformedPlayerPos = { screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 };
        createHitboxIfNeeded(transformedPlayerPos, player);
    }

    // Start the tracking process
    initializeHitbox();
    trackPlayerAndMissiles();

    // Event listener for toggling hitbox visibility
    window.addEventListener('keydown', toggleHitboxVisibility);

    console.log("Optimized Missile Tracking and Auto-Dodge module initialized successfully.");
})();
