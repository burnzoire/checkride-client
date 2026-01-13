const StoreModule = require('electron-store');
const Store = StoreModule.default || StoreModule; // electron-store v11 exposes the constructor on the default export

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
  udp_port: {
    type: 'number',
    default: 41234,
  },
  api_token: {
    type: 'string',
    default: '',
  },
  discord_webhook_path: {
    type: 'string',
    default: '',
  },
};

const store = new Store({ schema });

module.exports = store;

