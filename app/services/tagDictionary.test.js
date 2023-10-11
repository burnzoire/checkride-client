const path = require('path');
const fs = require('fs');
const TagDictionary = require('./tagDictionary');

jest.mock('fs'); // Mock the fs module to control file read operations

describe('TagDictionary', () => {
  let tagDictionary;

  beforeEach(() => {
    tagDictionary = new TagDictionary();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads and returns tags from a dictionary', () => {
    const dictionaryName = 'units';
    const value = 'F-14A';
    const tags = ['tomcat', 'fighter'];

    fs.readFileSync.mockReturnValue(JSON.stringify({ [value]: tags }));

    const result = tagDictionary.getTagsForField(dictionaryName, value);

    expect(result).toEqual(tags);
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.join(__dirname, '..', 'data', `${dictionaryName}.json`),
      'utf8'
    );
  });

  it('returns an empty array for unknown values', () => {
    const dictionaryName = 'units';
    const value = 'UnknownUnit';

    fs.readFileSync.mockReturnValue(JSON.stringify({}));

    const result = tagDictionary.getTagsForField(dictionaryName, value);

    expect(result).toEqual([]);
    expect(fs.readFileSync).toHaveBeenCalledWith(
      path.join(__dirname, '..', 'data', `${dictionaryName}.json`),
      'utf8'
    );
  });

  it('loads dictionary only once for multiple calls', () => {
    const dictionaryName = 'units';
    const value = 'F-14A';
    const tags = ['tomcat', 'fighter'];

    fs.readFileSync.mockReturnValue(JSON.stringify({ [value]: tags }));

    tagDictionary.getTagsForField(dictionaryName, value);
    tagDictionary.getTagsForField(dictionaryName, value);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });
});
