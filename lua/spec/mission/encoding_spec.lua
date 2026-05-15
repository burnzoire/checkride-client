-- lua/spec/mission/encoding_spec.lua
-- Tests CheckrideMission.encodeMessage (the local JSON encoder).

local loader = require("helpers.mission_loader")

describe("CheckrideMission.encodeMessage", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    it("returns 'null' for nil input", function()
        assert.are.equal("null", CheckrideMission.encodeMessage(nil))
    end)

    it("encodes a number", function()
        local result = CheckrideMission.encodeMessage({ n = 42 })
        assert.is_truthy(result)
        assert.is_truthy(result:find('"n":42'))
    end)

    it("encodes a boolean true", function()
        local result = CheckrideMission.encodeMessage({ flag = true })
        assert.is_truthy(result:find('"flag":true'))
    end)

    it("encodes a boolean false", function()
        local result = CheckrideMission.encodeMessage({ flag = false })
        assert.is_truthy(result:find('"flag":false'))
    end)

    it("encodes a string value", function()
        local result = CheckrideMission.encodeMessage({ type = "grading" })
        assert.is_truthy(result:find('"type":"grading"'))
    end)

    it("escapes backslashes in strings", function()
        local result = CheckrideMission.encodeMessage({ path = "a\\b" })
        assert.is_truthy(result:find('a\\\\b'))
    end)

    it("escapes double-quotes in strings", function()
        local result = CheckrideMission.encodeMessage({ q = 'say "hi"' })
        assert.is_truthy(result:find('\\"hi\\"'))
    end)

    it("escapes newlines in strings", function()
        local result = CheckrideMission.encodeMessage({ s = "line1\nline2" })
        -- JSON encoder replaces newline with literal \n (two chars: backslash + n).
        assert.is_truthy(result:find("\\n", 1, true))
    end)

    it("encodes a nested table as an object", function()
        local result = CheckrideMission.encodeMessage({ outer = { inner = 1 } })
        assert.is_truthy(result:find('"inner":1'))
    end)

    it("encodes a numeric array table", function()
        local result = CheckrideMission.encodeMessage({ arr = { 10, 20, 30 } })
        assert.is_truthy(result:find('%[10,20,30%]'))
    end)

    it("encodes an empty table as an array (Lua empty tables are treated as arrays)", function()
        local result = CheckrideMission.encodeMessage({})
        assert.are.equal("[]", result)
    end)

    it("returns a string for valid input", function()
        local result = CheckrideMission.encodeMessage({ type = "test" })
        assert.is_string(result)
    end)
end)
