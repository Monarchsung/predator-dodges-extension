(function() {
  /**
   * Missile Size and Path Extension for SWAM
   * Author: MONARCH
   * Description: Customize missile sizes, display missile paths, track missile positions, and visualize paths with dots.
   * Version: 1.2.0
   */

  // Define default settings
  const DEFAULT_MISSILE_SIZE = 100; // Percentage
  const DEFAULT_MISSILE_PATH_SIZE = 500; // 0 means no path visualization

  let settings = {
    missileSize: DEFAULT_MISSILE_SIZE,
    missilePointerSize: DEFAULT_MISSILE_PATH_SIZE,
  };

  /**
   * Function to apply updated settings
   * @param {Object} values - The updated settings values
   */
  function settingsApplied(values) {
    settings = values;
    SWAM.trigger("settingsUpdated", values);
  }

  /**
   * Function to create settings provider
   */
  function createSettingsProvider() {
    const sp = new SettingsProvider(settings, settingsApplied);
    const missileSection = sp.addSection("Missile Settings");

    // Add missile size slider
    missileSection.addSliderField("missileSize", "Adjust Missile Size (in %)", {
      min: 10,
      max: 400,
      step: 10,
      default: DEFAULT_MISSILE_SIZE,
    });

    // Add missile path size slider
    missileSection.addSliderField("missilePointerSize", "Missile Path Size", {
      min: 0,
      max: 1000,
      step: 50,
      default: DEFAULT_MISSILE_PATH_SIZE,
      description: "Set to 0 to disable missile path visualization",
    });

    return sp;
  }

  /**
   * Utility function to check deep equality
   * @param {any} x 
   * @param {any} y 
   * @returns {boolean}
   */
  function deepEqual(x, y) {
    if (typeof x !== "object" || x === null ||
        typeof y !== "object" || y === null)
      return Object.is(x, y);

    if (x === y)
      return true;

    if (Array.isArray(x)) {
      if (!Array.isArray(y) || x.length !== y.length)
        return false;

      for (let i = 0; i < x.length; i++) {
        if (!deepEqual(x[i], y[i]))
          return false;
      }
    } else {
      if (Array.isArray(y))
        return false;

      const keys = Object.keys(x);
      if (Object.keys(y).length !== keys.length)
        return false;

      for (const key of keys) {
        if (!Object.prototype.propertyIsEnumerable.call(y, key) ||
            !deepEqual(x[key], y[key]))
          return false;
      }
    }
    return true;
  }

  /**
   * Function to handle settings updates
   * @param {Array|string} key - The setting key(s) to listen for
   * @param {Function} callback - The callback to execute on setting change
   */
  const onSettingsUpdated = (key, callback) => {
    let previousSettings = settings;
    const keys = [].concat(key);
    SWAM.on("settingsUpdated", (nextSettings) => {
      if (keys.some(k => !deepEqual(previousSettings[k], nextSettings[k]))) {
        callback(
          typeof key === "string" ? nextSettings[key] : Object.fromEntries(keys.map(k => [k, nextSettings[k]])),
          false
        );
      }
      previousSettings = nextSettings;
    });
    callback(
      typeof key === "string" ? settings[key] : Object.fromEntries(keys.map(k => [k, settings[k]])),
      true
    );
  };

  /**
   * Function to create missile path texture
   * @returns {PIXI.Texture}
   */
  function createMissilePathTexture() {
    const width = 1;  // Width of the rectangle
    const height = 500; // Height of the rectangle
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); // White
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // Transparent
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return PIXI.Texture.from(canvas);
  }

  /**
   * Missile Size and Path Extension Core Logic
   */
  SWAM.on("gameRunning", function() {
    // Create missile path texture
    const MissilePathTexture = createMissilePathTexture();

    // Reference objects to store current missile size and path size
    let missileSizeRef = { current: settings.missileSize };
    let missilePathRef = { current: settings.missilePointerSize };

    // Store original _getMobScale from theme
    const originalMobScaler = SWAM.Theme?._getMobScale;

    /**
     * Deferred update function to avoid blocking
     */
    const deferredUpdateMissileSize = (...args) => setTimeout(() => updateMissileSize(...args), 0);

    /**
     * Function to add missile path sprite to a mob
     * @param {Object} mob - The mob (player/enemy) object
     * @param {Object} player - The player object
     * @returns {PIXI.Sprite} - The missile path sprite
     */
    const addMissilePath = (mob, player) => {
      if (!missilePathRef.current) return null;

      const missilePath = new PIXI.Sprite(MissilePathTexture);
      missilePath.rotation = Math.PI;
      const w = 2 / game.graphics.layers.groundobjects.scale.x;
      missilePath.x = w / 2;
      missilePath.width = w;
      missilePath.height = missilePathRef.current; // Use missilePathRef.current for dynamic height
      missilePath.alpha = 0.3;

      if (SWAM.Theme?._getThrusterTint) {
        missilePath.tint = SWAM.Theme._getThrusterTint(player);
      }

      game.graphics.layers.projectiles.addChild(missilePath);
      return missilePath;
    };

    /**
     * Function to determine mob scale based on missile size
     * @param {Object} mob - The mob object
     * @returns {Array} - [scaleX, scaleY]
     */
    const getMobScale = (mob) => {
      const missileSizeMultiplier = missileSizeRef.current / 100;

      switch (mob.type) {
        case 2:
        case 3:
          return [0.2 * missileSizeMultiplier, 0.2 * missileSizeMultiplier];
        default:
          return [0.2 * missileSizeMultiplier, 0.15 * missileSizeMultiplier];
      }
    };

    /**
     * Function to update missile size for a mob
     * @param {Object} data - Data containing mob id
     * @param {Object} ex - Extra data (unused)
     * @param {String} playerId - The ID of the player
     */
    const updateMissileSize = (data, ex, playerId) => {
      const mob = Mobs.get(data.id);
      const player = Players.get(playerId);
      if (!mob) return;
      if (![1, 2, 3, 5, 6, 7].includes(mob.type)) return;

      const scale = getMobScale(mob);
      mob.sprites.shadow.scale.set(...scale);

      if (SWAM.Theme?._getMobScale && game.gameType === 2) return;

      mob.sprites.sprite.scale.set(...scale);

      // Tracking Missile Position on Size Change
      trackMissilePosition(mob);
    };

    /**
     * Missile Position Tracking and Dot Visualization
     * @param {Object} mob - The missile mob object
     */
    const trackMissilePosition = (mob) => {
      if (!mob) return;

      // Initialize tracking for this missile
      if (!mob.trackingData) {
        mob.trackingData = {
          positions: [],
          dot: createTrackingDot(),
        };
        game.graphics.layers.projectiles.addChild(mob.trackingData.dot);
      }

      // Function to update the dot's position
      const updateDotPosition = () => {
        if (!mob || !mob.trackingData || !mob.trackingData.dot) return;
        mob.trackingData.positions.push({ x: mob.pos.x, y: mob.pos.y, timestamp: Date.now() });
        mob.trackingData.dot.position.set(mob.pos.x, mob.pos.y);
      };

      // Listen to frame updates to move the dot
      mob.frameListener = updateDotPosition;
      SWAM.on('frameUpdate', updateDotPosition);

      // Cleanup when missile is destroyed
      mob.destroyListener = () => {
        if (mob.trackingData && mob.trackingData.dot) {
          game.graphics.layers.projectiles.removeChild(mob.trackingData.dot);
          mob.trackingData.dot.destroy();
        }
        SWAM.off('frameUpdate', mob.frameListener);
      };

      SWAM.on('mobDestroyed', mob.destroyListener);
    };

    /**
     * Function to create a small tracking dot
     * @returns {PIXI.Sprite} - The tracking dot sprite
     */
    const createTrackingDot = () => {
      const dot = new PIXI.Graphics();
      dot.beginFill(0xFF0000); // Red color
      dot.drawCircle(0, 0, 3); // Small radius
      dot.endFill();
      dot.alpha = 0.8;
      return dot;
    };

    /**
     * Initialize missile size and path based on settings
     */
    onSettingsUpdated(['missileSize', 'missilePointerSize'], ({ missileSize, missilePointerSize }) => {
      missileSizeRef.current = Number(missileSize);
      missilePathRef.current = missilePointerSize;

      if (SWAM.Theme?._getMobScale) {
        if (Number(missileSize) !== 100) {
          SWAM.Theme._getMobScale = getMobScale;
        } else {
          SWAM.Theme._getMobScale = originalMobScaler;
        }
      }

      if (Number(missileSize) !== 100) {
        SWAM.on('mobAdded', deferredUpdateMissileSize);
      } else {
        SWAM.off('mobAdded', deferredUpdateMissileSize);
      }
    });

    /**
     * Adding Missile Path to Newly Added Mobs
     * This section has been uncommented to ensure missile paths are always added.
     */
    SWAM.on('mobAdded', (mob, player) => {
      if ([1, 2, 3, 5, 6, 7].includes(mob.type)) {
        mob.missilePath = addMissilePath(mob, player);
      }
    });

  });

  /**
   * Register the extension with SWAM
   */
  SWAM.registerExtension({
    name: "Missile Size and Path",
    id: "missile-size-and-path",
    description: "Customize missile sizes, display missile paths, track missile positions, and visualize paths with dots.",
    author: "MONARCH",
    version: "1.2.0",
    settingsProvider: createSettingsProvider()
  });

})();
