const { v5: uuidv5 } = require('uuid');
const { FlightTracker } = require('./flightTracker');

const EVENT_UID_NAMESPACE = uuidv5('checkride-client:event', uuidv5.URL);

class EventProcessor {
  constructor({ flightTracker } = {}) {
    this.flightTracker = flightTracker || new FlightTracker();
  }

  process(rawEvent, preparedPayload) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      throw new Error('rawEvent must be an object');
    }

    if (!preparedPayload || typeof preparedPayload !== 'object') {
      throw new Error('preparedPayload must be an object');
    }

    if (!preparedPayload.event || typeof preparedPayload.event !== 'object') {
      throw new Error('preparedPayload must contain an event object');
    }

    const payload = {
      ...preparedPayload,
      event: {
        ...preparedPayload.event,
        event_data: {
          ...(preparedPayload.event.event_data || {})
        }
      }
    };

    this.flightTracker.decorate(rawEvent, payload.event.event_data);

    payload.event.event_uid = this.buildEventUid(payload.event);

    return payload;
  }

  buildEventUid(stableSource) {
    return uuidv5(stableStringify(stableSource), EVENT_UID_NAMESPACE);
  }
}

function stableStringify(value) {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'undefined') {
    return 'undefined';
  }

  const valueType = typeof value;

  if (valueType === 'number' || valueType === 'boolean') {
    return JSON.stringify(value);
  }

  if (valueType === 'string') {
    return JSON.stringify(value);
  }

  if (valueType === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => stableStringify(item)).join(',');
    return `[${items}]`;
  }

  if (valueType === 'object') {
    const keys = Object.keys(value).sort();
    const items = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${items.join(',')}}`;
  }

  return '';
}

module.exports = {
  EventProcessor,
  stableStringify
};
