"use strict";

(function() {
  // Settings
  const DEFAULT_SETTINGS = {
    scriptActive: false,
    currentScript: 1,
  };

  let settings = DEFAULT_SETTINGS;

  const settingsProvider = () => {
    let sp = new SettingsProvider(DEFAULT_SETTINGS, newSettings => {
      settings = newSettings;
    });

    let section = sp.addSection('Predator Dodges');
    section.addBoolean('scriptActive', 'Enable Predator Dodges');
    section.addString('currentScript', 'Current Script');

    return sp;
  };

  const extensionConfig = {
    name: 'Predator Dodges',
    id: 'PredatorDodges',
    description: 'Automates dodging maneuvers for the Predator.',
    author: 'Monarch',
    version: '1.0',
    settingsProvider: settingsProvider()
  };

  /* VARIABLES */
  const PI2 = Math.PI * 2;
  let prevAngle,
      $laserPointer;

  /* INIT */
  function init() {
    initHTML();
    initStyle();
    initGame();
    initEvents();
  }

  function initHTML() {
    const html = '<div id="laser-pointer"></div>';
    $('body').append(html);
    toggle(false);
  }

  function initStyle() {
    const style = `
      <style>
        #laser-pointer {
          display: block;
          height: 1px;
          width: calc(50vw * 1.5);
          opacity: .25;
          background: white;
          position: fixed;
          top: 50%;
          left: 50%;
          transform-origin: 0;
        }
      </style>
    `;
    $('head').append(style);
  }

  function initGame() {
    $laserPointer = $('#laser-pointer');

    SWAM.one('playerAdded', Player => {
      const proto = Object.getPrototypeOf(Player);
      const prev = proto.update;

      proto.update = function(...args) {
        prev.call(this, ...args);

        const me = Players.getMe();
        if (me && this.id === me.id && settings.scriptActive) {
          update(this.rot);
        }
      };
    });
  }

  function initEvents() {
    SWAM.on('keydown', onKeydown);
    SWAM.on('keyup', onKeyup);
  }

  SWAM.on('gameLoaded', init);

  /* EVENTS */
  function onKeydown(event) {
    if (event.originalEvent.key === 'p') {
      event.stopImmediatePropagation();
      toggleScriptActive(true);
    } else if (event.originalEvent.code === 'Pause') {
      event.stopImmediatePropagation();
      toggleScriptActive(false);
    } else if (settings.scriptActive && event.originalEvent.key >= '1' && event.originalEvent.key <= '9') {
      settings.currentScript = parseInt(event.originalEvent.key);
      console.log(`Switched to script ${settings.currentScript}`);
    } else if (settings.scriptActive && event.originalEvent.key === '0') {
      settings.currentScript = 10;
      console.log(`Switched to script ${settings.currentScript}`);
    } else if (settings.scriptActive && (event.originalEvent.key === 'q' || event.originalEvent.key === 'e')) {
      let arrowSide = event.originalEvent.key === 'q' ? 'ArrowLeft' : 'ArrowRight';
      executeScript(settings.currentScript, 'ArrowDown', arrowSide);
    }
  }

  function onKeyup(event) {
    if (event.originalEvent.key === 's' || event.originalEvent.key === 'w') {
      handleKeyRelease(event.originalEvent.key);
    }
  }

  /* API */
  function toggleScriptActive(force) {
    settings.scriptActive = force === undefined ? !settings.scriptActive : force;
    if (settings.scriptActive) {
      SWAM.showMessage("Predator dodges begins");
      console.log("Predator dodges begins");
    } else {
      SWAM.showMessage("Predator dodges ends");
      console.log("Predator dodges ends");
    }
  }

  function update(angle) {
    if (!settings.scriptActive) return;
    if (angle === prevAngle) return;

    const deg = (360 * angle / PI2) - 90;
    $laserPointer[0].style.transform = `rotate(${deg}deg)`;

    prevAngle = angle;
  }

  function toggle(force) {
    settings.scriptActive = force === undefined ? !settings.scriptActive : force;
    if (settings.scriptActive) {
      UI.show('#laser-pointer');
    } else {
      UI.hide('#laser-pointer');
    }
  }

  function executeScript(scriptNumber, arrowDown, arrowSide) {
    switch (scriptNumber) {
      case 1:
        holdCtrlArrow(arrowDown, arrowSide, 10, 500);
        break;
      case 2:
        holdCtrlArrow(arrowDown, arrowSide, 200, 500);
        break;
      case 3:
        holdCtrlArrow(arrowDown, arrowSide, 500, 700);
        break;
      case 4:
        holdCtrlArrow(arrowDown, arrowSide, 300, 500);
        break;
      case 5:
        holdCtrlArrowSingle(arrowSide === 'ArrowLeft' ? 'ArrowUp' : 'ArrowDown', 500);
        break;
      case 6:
        holdCtrlArrow(arrowDown, arrowSide, 0, 500);
        break;
      case 7:
        holdCtrlArrowSingle(arrowSide === 'ArrowLeft' ? 'ArrowUp' : 'ArrowDown', 230);
        break;
      case 8:
        holdCtrlArrowSingle(arrowSide === 'ArrowLeft' ? 'ArrowUp' : 'ArrowDown', 300);
        break;
      case 9:
        holdCtrlArrow(arrowDown, arrowSide, 300, 700);
        break;
      case 10:
        holdCtrlArrow(arrowDown, arrowSide, 500, 1000);
        break;
      default:
        console.log("Invalid script number");
    }
  }

  function holdCtrlArrow(arrowDown, arrowSide, holdTime, releaseTime) {
    const ctrlKeyDownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Control',
      code: 'ControlLeft',
      keyCode: 17,
      which: 17
    });

    const ctrlKeyUpEvent = new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'Control',
      code: 'ControlLeft',
      keyCode: 17,
      which: 17
    });

    const arrowDownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: arrowDown,
      code: arrowDown,
      keyCode: 40,
      which: 40
    });

    const arrowDownUpEvent = new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: arrowDown,
      code: arrowDown,
      keyCode: 40,
      which: 40
    });

    const arrowSideEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: arrowSide,
      code: arrowSide,
      keyCode: arrowSide === 'ArrowLeft' ? 37 : 39,
      which: arrowSide === 'ArrowLeft' ? 37 : 39
    });

    const arrowSideUpEvent = new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: arrowSide,
      code: arrowSide,
      keyCode: arrowSide === 'ArrowLeft' ? 37 : 39,
      which: arrowSide === 'ArrowLeft' ? 37 : 39
    });

    document.dispatchEvent(ctrlKeyDownEvent);
    document.dispatchEvent(arrowDownEvent);
    document.dispatchEvent(arrowSideEvent);

    setTimeout(() => {
      document.dispatchEvent(arrowDownUpEvent);
      document.dispatchEvent(arrowSideUpEvent);
      document.dispatchEvent(ctrlKeyUpEvent);
    }, holdTime);

    setTimeout(() => {
      document.dispatchEvent(ctrlKeyDownEvent);
      document.dispatchEvent(arrowDownEvent);
      document.dispatchEvent(arrowSideEvent);

      setTimeout(() => {
        document.dispatchEvent(arrowDownUpEvent);
        document.dispatchEvent(arrowSideUpEvent);
        document.dispatchEvent(ctrlKeyUpEvent);
      }, holdTime);
    }, releaseTime);
  }

  function holdCtrlArrowSingle(arrow, time) {
    const ctrlKeyDownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Control',
      code: 'ControlLeft',
      keyCode: 17,
      which: 17
    });

    const ctrlKeyUpEvent = new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'Control',
      code: 'ControlLeft',
      keyCode: 17,
      which: 17
    });

    const arrowDownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: arrow,
      code: arrow,
      keyCode: 40,
      which: 40
    });

    const arrowDownUpEvent = new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: arrow,
      code: arrow,
      keyCode: 40,
      which: 40
    });

    document.dispatchEvent(ctrlKeyDownEvent);
    document.dispatchEvent(arrowDownEvent);

    setTimeout(() => {
      document.dispatchEvent(arrowDownUpEvent);
      document.dispatchEvent(ctrlKeyUpEvent);
    }, time);
  }

  // Register mod
  SWAM.registerExtension(extensionConfig);

}());
