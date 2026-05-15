-- lua/spec/mission/parse_comment_spec.lua
-- Tests CheckrideMission.parseComment (LSO grade string parser).

local loader = require("helpers.mission_loader")

describe("CheckrideMission.parseComment", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    -- nil / empty inputs
    it("returns nil, nil, nil for nil input", function()
        local grade, wire, raw = CheckrideMission.parseComment(nil)
        assert.is_nil(grade)
        assert.is_nil(wire)
        assert.is_nil(raw)
    end)

    it("returns nil, nil, nil for empty string", function()
        local grade, wire, raw = CheckrideMission.parseComment("")
        assert.is_nil(grade)
        assert.is_nil(wire)
        assert.is_nil(raw)
    end)

    -- No GRADE: token
    it("returns nil, nil, raw comment when no GRADE: token", function()
        local comment = "LSO: no grade here"
        local grade, wire, raw = CheckrideMission.parseComment(comment)
        assert.is_nil(grade)
        assert.is_nil(wire)
        assert.are.equal(comment, raw)
    end)

    -- Standard grades
    it("parses _OK_ grade", function()
        local grade, wire, _ = CheckrideMission.parseComment("LSO: GRADE:_OK_ : WIRE# 3")
        assert.are.equal("_OK_", grade)
        assert.are.equal(3, wire)
    end)

    it("parses (OK) grade", function()
        local grade, wire, _ = CheckrideMission.parseComment("LSO: GRADE:(OK) :X LUL WIRE# 2")
        assert.are.equal("(OK)", grade)
        assert.are.equal(2, wire)
    end)

    it("parses OK grade with wire 4", function()
        local grade, wire, _ = CheckrideMission.parseComment("LSO: GRADE:OK : WIRE# 4")
        assert.are.equal("OK", grade)
        assert.are.equal(4, wire)
    end)

    it("parses B (Bolter) with no wire", function()
        local grade, wire, _ = CheckrideMission.parseComment("LSO: GRADE:B ")
        assert.are.equal("B", grade)
        assert.is_nil(wire)
    end)

    it("parses -- (no grade) with no wire", function()
        local grade, wire, _ = CheckrideMission.parseComment("LSO: GRADE:-- ")
        assert.are.equal("--", grade)
        assert.is_nil(wire)
    end)

    -- Normalization aliases
    it("normalises CUT to C", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:CUT ")
        assert.are.equal("C", grade)
    end)

    it("normalises BOLTER to B", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:BOLTER ")
        assert.are.equal("B", grade)
    end)

    it("normalises WOP to WO", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:WOP ")
        assert.are.equal("WO", grade)
    end)

    it("normalises WOFD to WO", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:WOFD ")
        assert.are.equal("WO", grade)
    end)

    it("normalises OWO to WO", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:OWO ")
        assert.are.equal("WO", grade)
    end)

    it("normalises TWO to WO", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:TWO ")
        assert.are.equal("WO", grade)
    end)

    it("normalises TLU to WO", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:TLU ")
        assert.are.equal("WO", grade)
    end)

    it("normalises triple-dash to double-dash", function()
        local grade, _, _ = CheckrideMission.parseComment("LSO: GRADE:--- ")
        assert.are.equal("--", grade)
    end)

    -- Wire extraction
    it("extracts wire number from comment", function()
        local _, wire, _ = CheckrideMission.parseComment("GRADE:OK WIRE# 3")
        assert.are.equal(3, wire)
    end)

    it("extracts wire with whitespace WIRE# 1", function()
        local _, wire, _ = CheckrideMission.parseComment("GRADE:OK WIRE#1")
        assert.are.equal(1, wire)
    end)

    it("returns nil wire when no WIRE# in comment", function()
        local _, wire, _ = CheckrideMission.parseComment("GRADE:WO ")
        assert.is_nil(wire)
    end)

    -- Raw comment always returned
    it("returns original comment as the third return value", function()
        local comment = "LSO: GRADE:_OK_ : WIRE# 3"
        local _, _, raw = CheckrideMission.parseComment(comment)
        assert.are.equal(comment, raw)
    end)
end)
