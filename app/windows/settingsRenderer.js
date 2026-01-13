(function () {
  const form = document.getElementById('settings-form');
  const cancelButton = document.getElementById('cancel-button');

  function populateForm(config) {
    if (!config) {
      return;
    }

    form.server_host.value = config.server_host ?? '';
    form.server_port.value = config.server_port ?? '';
    form.use_ssl.checked = Boolean(config.use_ssl);
    form.udp_port.value = config.udp_port ?? '';
    form.discord_webhook_path.value = config.discord_webhook_path ?? '';
    form.api_token.value = config.api_token ?? '';
  }

  function readForm() {
    return {
      server_host: form.server_host.value.trim(),
      server_port: form.server_port.value.trim(),
      use_ssl: form.use_ssl.checked,
      udp_port: Number(form.udp_port.value),
      discord_webhook_path: form.discord_webhook_path.value.trim(),
      api_token: form.api_token.value.trim(),
    };
  }

  async function initialise() {
    try {
      const config = await window.settings.load();
      populateForm(config);
    } catch (error) {
      console.error('Failed to load settings', error);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = readForm();

    try {
      await window.settings.save(payload);
      window.close();
    } catch (error) {
      console.error('Failed to save settings', error);
    }
  });

  cancelButton.addEventListener('click', () => {
    window.close();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      window.close();
    }
  });

  initialise();
})();
