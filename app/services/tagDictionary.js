const path = require('path');
const fs = require('fs');

class TagDictionary {
  constructor() {
    this.data = {};
  }

  loadDictionary(dictionaryName) {
    if (this.data[dictionaryName]) {
      return;
    }

    const filePath = path.join(__dirname, 'data', `${dictionaryName}.json`);
    this.data[dictionaryName] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  getTagsForField(dictionaryName, value) {
    this.loadDictionary(dictionaryName);

    if (value in this.data[dictionaryName]) {
      return this.data[dictionaryName][value];
    }
    return [];
  }
}

module.exports = TagDictionary;
