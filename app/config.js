const Store = require('electron-store');

const schema = {
  server_host: {
    type: 'string',
    default: 'localhost',
  },
  server_port: {
    type: 'string',
    default: '80',
  },
  use_ssl: {
    type: 'boolean',
    default: false,
  },
  discord_webhook_path: {
    type: 'string',
    default: '',
  },
};

const store = new Store({ schema });

module.exports = store;

