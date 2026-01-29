function createDemoModeMenu(demoController, { onChange, enabled = true } = {}) {
  if (!demoController) {
    return [];
  }

  const running = Boolean(demoController.isRunning);

  return [
    {
      label: running ? 'Stop Demo Mode' : 'Start Demo Mode',
      enabled,
      click() {
        if (demoController.isRunning) {
          demoController.stop();
        } else {
          demoController.start();
        }

        if (typeof onChange === 'function') {
          onChange();
        }
      }
    },
    { type: 'separator' }
  ];
}

module.exports = {
  createDemoModeMenu
};
