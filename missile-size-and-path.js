(function() {
  /**
   * Missile Size and Path Extension for SWAM
   * Author: YourName
   * Description: Customize missile sizes.
   * Version: 1.1.0
   */

  // Define default settings
  const DEFAULT_MISSILE_SIZE = 100; // Percentage
  const DEFAULT_MISSILE_PATH_SIZE = 500; // 0 means no path visualization (currently disabled)

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

    return sp;
  }

  /**
   * Function to determine mob scale based on missile size
   * @param {Object} mob - The mob object
   * @returns {Array} - [scaleX, scaleY]
   */
  const getMobScale = (mob) => {
    const missileSizeMultiplier = settings.missileSize / 100;

    switch (mob.type) {
      case 2:
      case 3:
        return [0.2 * missileSizeMultiplier, 0.2 * missileSizeMultiplier];
      default:
        return [0.2 * missileSizeMultiplier, 0.15 * missileSizeMultiplier];
    }
  };

  /**
   * Function to update missile size and color for a mob
   * @param {Object} mob - The mob (player/enemy) object
   */
  const updateMissileSize = (mob) => {
    if (!mob || ![1, 2, 3, 5, 6, 7].includes(mob.type)) return;

    const scale = getMobScale(mob);
    mob.sprites.sprite.scale.set(...scale);
    mob.sprites.sprite.tint = 0x00FF00; // Set missile color to green
  };

  /**
   * Initialize missile size and color based on settings
   */
  SWAM.on('mobAdded', (mob) => {
    updateMissileSize(mob);
  });

  /**
   * Register the extension with SWAM
   */
  SWAM.registerExtension({
    name: "Missile Size",
    id: "missile-size",
    description: "Customize missile sizes and color.",
    author: "TESTING",
    version: "1.1.0",
    settingsProvider: createSettingsProvider()
  });

})();
