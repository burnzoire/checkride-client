const { createHash } = require('crypto');

function createSeededRandom(seed) {
  const seedString = seed == null ? '' : String(seed);

  let state = hashToUint32(seedString);

  return {
    next() {
      // xorshift32
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0x100000000;
    },
    int(minInclusive, maxInclusive) {
      const min = Math.ceil(minInclusive);
      const max = Math.floor(maxInclusive);
      if (max < min) {
        throw new Error('Invalid range');
      }
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick(list) {
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('Cannot pick from empty list');
      }
      return list[this.int(0, list.length - 1)];
    },
    chance(probability) {
      return this.next() < probability;
    }
  };
}

function hashToUint32(value) {
  const digest = createHash('sha256').update(value).digest();
  return digest.readUInt32LE(0) >>> 0;
}

module.exports = {
  createSeededRandom
};
