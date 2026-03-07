const Achievement = require('./achievement');

class BasketCase extends Achievement {
  constructor() {
    super({
      id: 'first_basket_contact',
      name: 'Basket Case',
      description: 'Make your first successful contact with a tanker basket.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Probe and drogue basket contact',
      iconDescription: 'A naval fighter probe contacting a tanker drogue basket with fuel hose tension visible against sky.',
    });
  }

  evaluate(event) {
    const contactEvent = event.contactEvent ?? event.contact_event ?? event.contact;
    if (contactEvent !== 'contact_start') return false;

    const system = String(event.system || '').toLowerCase();
    return system === 'basket';
  }
}

module.exports = new BasketCase();
