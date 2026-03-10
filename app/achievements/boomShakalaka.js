const Achievement = require('./achievement');

class BoomShakalaka extends Achievement {
  constructor() {
    super({
      id: 'first_boom_contact',
      name: 'Boom Shakalaka',
      description: 'Make your first successful contact with a tanker boom.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Flying boom contact',
      iconDescription: 'A tanker boom operator perspective showing boom nozzle contacting the receiver aircraft refueling receptacle.',
    });
  }

  evaluate(event) {
    const contactEvent = event.contactEvent ?? event.contact_event ?? event.contact;
    if (contactEvent !== 'contact_start') return false;

    const system = String(event.system || '').toLowerCase();
    return system === 'boom';
  }
}

module.exports = new BoomShakalaka();
