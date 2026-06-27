-- lua/spec/mission/weapon_enums_spec.lua
-- Tests CheckrideMission.dumpDcsEnums — the one-time probe that logs DCS's live enum
-- tables (Weapon.*, Airbase.Category, Unit/Object.Category; all C++-exposed, in no Lua
-- file) so our name tables / category reads can be verified against the actual DCS build.

local loader = require("helpers.mission_loader")

describe("CheckrideMission.dumpDcsEnums", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    local function capture(fn)
        local logged = {}
        local orig = CheckrideMission.log
        CheckrideMission.log = function(str) logged[#logged + 1] = str end
        fn()
        CheckrideMission.log = orig
        return logged
    end

    local function has(lines, needle)
        for _, line in ipairs(lines) do
            if line:find(needle, 1, true) then return true end
        end
        return false
    end

    it("logs each name->value entry of the live Weapon and Airbase enums", function()
        _G.Weapon = {
            GuidanceType = { IR = 2, LASER = 7 },
            Category = { MISSILE = 1 },
        }
        _G.Airbase = { Category = { AIRDROME = 0, HELIPAD = 1, SHIP = 2 } }

        local logged = capture(function() CheckrideMission.dumpDcsEnums() end)

        assert.is_true(has(logged, "Weapon.GuidanceType.LASER = 7"))
        assert.is_true(has(logged, "Weapon.Category.MISSILE = 1"))
        assert.is_true(has(logged, "Airbase.Category.SHIP = 2"))
        assert.is_true(has(logged, "Airbase.Category.HELIPAD = 1"))
    end)

    it("is safe when a global is unavailable", function()
        _G.Weapon = nil
        _G.Airbase = nil
        assert.has_no.errors(function()
            capture(function() CheckrideMission.dumpDcsEnums() end)
        end)
    end)
end)
