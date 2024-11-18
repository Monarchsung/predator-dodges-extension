(function() {
    'use strict';

    if (typeof Players === 'undefined' || typeof Mobs === 'undefined' || typeof MobType === 'undefined' || typeof game === 'undefined') {
        console.error('Required game objects (Players, Mobs, MobType, game) are not defined.');
        return;
    }

    console.log('Missile Tracker Overlay script initialized.');

    const missileTypes = new Set([
        MobType.PredatorMissile,
        MobType.TornadoSingleMissile,
        MobType.TornadoTripleMissile,
        MobType.ProwlerMissile,
        MobType.GoliathMissile,
        MobType.MohawkMissile,
        MobType.CarrotMissile
    ]);

    const canvas = document.createElement('canvas');
    canvas.id = 'missileOverlay';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1000';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    window.addEventListener('resize', function() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    // Variables for tracking evasion statistics
    let missilesEvaded = 0;
    let missilesTracked = {};

    // Variable to control visibility of yellow lines
    let showYellowLines = false; // By default, yellow lines are invisible

    function getPlayer() {
        const myPlayer = Players.getMe();
        if (!myPlayer) {
            console.error('Could not retrieve player object.');
            return null;
        }
        return myPlayer;
    }

    function worldToScreen(worldX, worldY, playerX, playerY) {
        const scale = game.scale;
        const deltaX = (worldX - playerX) * scale;
        const deltaY = (worldY - playerY) * scale;
        return {
            screenX: window.innerWidth / 2 + deltaX,
            screenY: window.innerHeight / 2 + deltaY
        };
    }

    // Collision prediction function
    function predictCollision(missile, player) {
        const missilePos = { x: missile.pos.x, y: missile.pos.y };
        const missileVel = { x: missile.speed.x, y: missile.speed.y };

        const playerPos = { x: player.pos.x, y: player.pos.y };
        const playerVel = { x: player.speed.x, y: player.speed.y };

        // Relative position and velocity
        const relPos = { x: missilePos.x - playerPos.x, y: missilePos.y - playerPos.y };
        const relVel = { x: missileVel.x - playerVel.x, y: missileVel.y - playerVel.y };

        const a = relVel.x * relVel.x + relVel.y * relVel.y;
        if (a === 0) {
            // The missile and player are moving at the same speed and direction
            return { willCollide: false, timeToCollision: 0 };
        }

        const b = 2 * (relPos.x * relVel.x + relPos.y * relVel.y);
        const c = relPos.x * relPos.x + relPos.y * relPos.y - 2500; // 2500 = (collision radius)^2

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) {
            // No collision
            return { willCollide: false, timeToCollision: 0 };
        }

        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t1 = (-b - sqrtDiscriminant) / (2 * a);
        const t2 = (-b + sqrtDiscriminant) / (2 * a);

        const collisionTime = Math.min(t1, t2);

        if (collisionTime > 0) {
            return { willCollide: true, timeToCollision: collisionTime };
        } else {
            return { willCollide: false, timeToCollision: 0 };
        }
    }

    function drawMissiles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const player = getPlayer();
        if (!player) return;

        const playerPos = { x: player.pos.x, y: player.pos.y };
        const playerScreenX = window.innerWidth / 2;
        const playerScreenY = window.innerHeight / 2;
        const myTeam = player.team;

        const mobs = Mobs.mobs();
        for (const mobId in mobs) {
            const mob = mobs[mobId];
            if (missileTypes.has(mob.type) && mob.ownerId !== game.myID) {
                const ownerPlayer = Players.get(mob.ownerId);
                if (ownerPlayer && ownerPlayer.team === myTeam) continue; // Skip missiles from same team

                const { screenX, screenY } = worldToScreen(mob.pos.x, mob.pos.y, playerPos.x, playerPos.y);

                if (screenX >= 0 && screenX <= window.innerWidth && screenY >= 0 && screenY <= window.innerHeight) {
                    // Predict collision
                    const collisionPrediction = predictCollision(mob, player);

                    // Store missile data for evasion tracking
                    if (!missilesTracked[mobId]) {
                        missilesTracked[mobId] = {
                            predictedToHit: collisionPrediction.willCollide,
                            evaded: false,
                            startTime: performance.now()
                        };
                    } else {
                        // Update predictedToHit in case the situation changes
                        missilesTracked[mobId].predictedToHit = collisionPrediction.willCollide;
                    }

                    // Set line color based on collision prediction
                    let lineColor = 'rgba(255, 255, 0, 0.5)'; // Default: Yellow (not predicted to hit)
                    let drawLine = false;

                    if (collisionPrediction.willCollide) {
                        lineColor = 'rgba(255, 0, 0, 0.7)'; // Predicted to hit: Red
                        drawLine = true; // Always draw red lines
                    } else if (showYellowLines) {
                        // Only draw yellow lines if showYellowLines is true
                        drawLine = true;
                    }

                    if (drawLine) {
                        // Draw line from player to missile
                        ctx.beginPath();
                        ctx.moveTo(playerScreenX, playerScreenY);
                        ctx.lineTo(screenX, screenY);
                        ctx.strokeStyle = lineColor;
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        // Draw the circle at missile position
                        ctx.beginPath();
                        ctx.arc(screenX, screenY, 5, 0, 2 * Math.PI);
                        ctx.fillStyle = lineColor;
                        ctx.fill();
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'black';
                        ctx.stroke();

                        // Draw missile trajectory
                        const timeToCollision = collisionPrediction.willCollide ? collisionPrediction.timeToCollision : 2; // Predict 2 seconds ahead if no collision
                        const missileFuturePosX = mob.pos.x + mob.speed.x * timeToCollision;
                        const missileFuturePosY = mob.pos.y + mob.speed.y * timeToCollision;
                        const futureScreenPos = worldToScreen(missileFuturePosX, missileFuturePosY, playerPos.x, playerPos.y);

                        ctx.beginPath();
                        ctx.moveTo(screenX, screenY);
                        ctx.lineTo(futureScreenPos.screenX, futureScreenPos.screenY);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.lineWidth = 1;
                        ctx.setLineDash([5, 5]);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // Draw arrow pointing away from predicted collision path
                        if (collisionPrediction.willCollide) {
                            const arrowLength = 30;
                            const angle = Math.atan2(futureScreenPos.screenY - screenY, futureScreenPos.screenX - screenX);
                            const arrowX = futureScreenPos.screenX - arrowLength * Math.cos(angle);
                            const arrowY = futureScreenPos.screenY - arrowLength * Math.sin(angle);

                            ctx.beginPath();
                            ctx.moveTo(futureScreenPos.screenX, futureScreenPos.screenY);
                            ctx.lineTo(arrowX, arrowY);
                            ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
                            ctx.lineWidth = 2;
                            ctx.stroke();
                        }
                    }
                }
            }
        }

        // Check for missiles that are no longer tracked (evaded or hit)
        for (const mobId in missilesTracked) {
            if (!mobs[mobId]) {
                const missileData = missilesTracked[mobId];
                const timeElapsed = (performance.now() - missileData.startTime) / 1000;

                if (missileData.predictedToHit && !missileData.evaded) {
                    // Missile was predicted to hit but didn't impact
                    missilesEvaded++;
                    missileData.evaded = true;
                    console.log(`Missile ${mobId} evaded after ${timeElapsed.toFixed(1)}s`);
                }

                // Remove missile from tracking after evasion or impact
                delete missilesTracked[mobId];
            }
        }
    }

    function showFeedback() {
        // Display evasion statistics
        ctx.font = '16px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(`Missiles Dodged: ${missilesEvaded}`, 10, 20);
    }

    function updateCanvas() {
        drawMissiles();
        showFeedback();
        requestAnimationFrame(updateCanvas);
    }

    // Key listener to toggle yellow lines when 'O' key is pressed
    window.addEventListener('keydown', function(event) {
        if (event.key === 'o' || event.key === 'O') {
            showYellowLines = !showYellowLines;
            console.log(`Show yellow lines: ${showYellowLines}`);
        }
    });

    requestAnimationFrame(updateCanvas);
})();
