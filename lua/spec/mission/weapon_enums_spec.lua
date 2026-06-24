-- lua/spec/mission/weapon_enums_spec.lua
-- Tests CheckrideMission.dumpWeaponEnums — the one-time probe that logs DCS's live
-- Weapon enum tables (C++-exposed, not in any Lua file) so GUIDANCE_NAMES and friends can
-- be verified against the actual DCS/mod build.

local loader = require("helpers.mission_loader")

describe("CheckrideMission.dumpWeaponEnums", function()
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

    it("logs each name->value entry of the live Weapon enums", function()
        _G.Weapon = {
            GuidanceType = { IR = 2, LASER = 7 },
            Category = { MISSILE = 1 },
        }

        local logged = capture(function() CheckrideMission.dumpWeaponEnums() end)

        assert.is_true(has(logged, "Weapon.GuidanceType.LASER = 7"))
        assert.is_true(has(logged, "Weapon.GuidanceType.IR = 2"))
        assert.is_true(has(logged, "Weapon.Category.MISSILE = 1"))
    end)

    it("is safe when the Weapon global is unavailable", function()
        _G.Weapon = nil
        assert.has_no.errors(function()
            capture(function() CheckrideMission.dumpWeaponEnums() end)
        end)
    end)
end)
