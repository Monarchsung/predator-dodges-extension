(function() {
    'use strict';

    if (typeof Mobs === 'undefined' || typeof MobType === 'undefined' || typeof Players === 'undefined' || typeof game === 'undefined') {
        console.error('Required game objects (Mobs, MobType, Players, game) are not defined.');
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

    function getPlayerPosition() {
        const myPlayer = Players.get(game.myID);
        return myPlayer ? { x: myPlayer.pos.x, y: myPlayer.pos.y } : { x: 0, y: 0 };
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

    function drawMissiles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const playerPos = getPlayerPosition();
        const myPlayer = Players.get(game.myID);
        const myTeam = myPlayer ? myPlayer.team : null;

        const mobs = Mobs.mobs();
        for (const mobId in mobs) {
            const mob = mobs[mobId];
            if (missileTypes.has(mob.type) && mob.ownerId !== game.myID && (!myTeam || Players.get(mob.ownerId).team !== myTeam)) {
                const { screenX, screenY } = worldToScreen(mob.pos.x, mob.pos.y, playerPos.x, playerPos.y);
                if (screenX >= 0 && screenX <= window.innerWidth && screenY >= 0 && screenY <= window.innerHeight) {
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, 5, 0, 2 * Math.PI);
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
                    ctx.fill();
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'black';
                    ctx.stroke();
                    ctx.font = '12px Arial';
                    ctx.fillStyle = 'white';
                    ctx.fillText(mob.type, screenX + 6, screenY - 6);
                }
            }
        }
    }

    function updateCanvas() {
        drawMissiles();
        requestAnimationFrame(updateCanvas);
    }

    requestAnimationFrame(updateCanvas);
})();
