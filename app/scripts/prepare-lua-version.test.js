const fs = require('fs');
const os = require('os');
const path = require('path');

const { getClientVersion, stampLua } = require('./prepare-lua-version');

describe('prepare-lua-version', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'checkride-prepare-lua-'));
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('reads version from package json path', () => {
    const packageJsonPath = path.join(tempRoot, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '9.8.7' }), 'utf8');

    expect(getClientVersion(packageJsonPath)).toBe('9.8.7');
  });

  it('stamps Lua files with version from token', () => {
    const srcFile = path.join(tempRoot, 'src.lua');
    const outputRoot = path.join(tempRoot, 'out');

    fs.writeFileSync(srcFile, 'Checkride.version = "__CHECKRIDE_CLIENT_VERSION__"\n', 'utf8');

    stampLua('1.2.3', {
      outputRoot,
      sourceRoot: tempRoot,
      luaFiles: [
        {
          src: srcFile,
          outputRel: path.join('Scripts', 'Hooks', 'DCS-Checkride-hook.lua'),
        },
      ],
    });

    const outputPath = path.join(outputRoot, 'Scripts', 'Hooks', 'DCS-Checkride-hook.lua');
    const output = fs.readFileSync(outputPath, 'utf8');

    expect(output).toContain('Checkride.version = "1.2.3"');
    expect(output).not.toContain('__CHECKRIDE_CLIENT_VERSION__');
  });

  it('throws if token is missing from source Lua', () => {
    const srcFile = path.join(tempRoot, 'src.lua');
    const outputRoot = path.join(tempRoot, 'out');

    fs.writeFileSync(srcFile, 'Checkride.version = "static"\n', 'utf8');

    expect(() => {
      stampLua('1.2.3', {
        outputRoot,
        sourceRoot: tempRoot,
        luaFiles: [
          {
            src: srcFile,
            outputRel: 'x.lua',
          },
        ],
      });
    }).toThrow(`Version token not found in ${srcFile}`);
  });
});
