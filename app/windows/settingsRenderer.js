(function () {
  const form = document.getElementById('settings-form');
  const cancelButton = document.getElementById('cancel-button');
  const getField = (name) => form.elements.namedItem(name) || document.getElementById(name);

  const serverHostInput = getField('server_host');
  const serverPortInput = getField('server_port');
  const useSslInput = getField('use_ssl');
  const discordWebhookInput = getField('discord_webhook_path');
  const apiTokenInput = getField('api_token');

  function populateForm(config) {
    if (!config) {
      return;
    }

    if (serverHostInput) serverHostInput.value = config.server_host ?? '';
    if (serverPortInput) serverPortInput.value = config.server_port ?? '';
    if (useSslInput) useSslInput.checked = Boolean(config.use_ssl);
    if (discordWebhookInput) discordWebhookInput.value = config.discord_webhook_path ?? '';
    if (apiTokenInput) apiTokenInput.value = config.api_token ?? '';
  }

  function readForm() {
    return {
      server_host: serverHostInput?.value.trim() ?? '',
      server_port: serverPortInput?.value.trim() ?? '',
      use_ssl: Boolean(useSslInput?.checked),
      discord_webhook_path: discordWebhookInput?.value.trim() ?? '',
      api_token: apiTokenInput?.value.trim() ?? '',
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
