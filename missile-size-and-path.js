(function() {
  /**
   * Missile Size and Path Extension for SWAM
   * Author: YourName
   * Description: Customize missile sizes and display missile paths.
   * Version: 1.1.0
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

    // Apply green color to the missile
    mob.sprites.sprite.tint = 0x00FF00; // Green color in hexadecimal

    if (SWAM.Theme?._getMobScale && game.gameType === 2) return;

    mob.sprites.sprite.scale.set(...scale);
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
   * This section has been commented out to disable missile paths.
   */
  // SWAM.on('mobAdded', (mob, player) => {
  //   if ([1, 2, 3, 5, 6, 7].includes(mob.type)) {
  //     mob.missilePath = addMissilePath(mob, player);
  //   }
  // });

  /**
   * Register the extension with SWAM
   */
  SWAM.registerExtension({
    name: "Missile Size and Path",
    id: "missile-size-and-path",
    description: "Customize missile sizes and display missile paths. TESTING",
    author: "MONARCH",
    version: "1.3.0",
    settingsProvider: createSettingsProvider()
  });

})();
