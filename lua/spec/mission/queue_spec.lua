-- lua/spec/mission/queue_spec.lua
-- Tests queueEvent, CheckrideMissionPopEvent, sendEvent, sendEnrichmentEvent.

local loader = require("helpers.mission_loader")

describe("CheckrideMission event queue", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    describe("queueEvent / CheckrideMissionPopEvent", function()
        it("pop on an empty queue returns empty string", function()
            assert.are.equal("", CheckrideMissionPopEvent())
        end)

        it("queues and pops a single item", function()
            CheckrideMission.queueEvent('{"type":"test"}')
            assert.are.equal('{"type":"test"}', CheckrideMissionPopEvent())
        end)

        it("delivers items in FIFO order", function()
            CheckrideMission.queueEvent("A")
            CheckrideMission.queueEvent("B")
            CheckrideMission.queueEvent("C")
            assert.are.equal("A", CheckrideMissionPopEvent())
            assert.are.equal("B", CheckrideMissionPopEvent())
            assert.are.equal("C", CheckrideMissionPopEvent())
            assert.are.equal("", CheckrideMissionPopEvent())
        end)

        it("ignores nil payloads", function()
            CheckrideMission.queueEvent(nil)
            assert.are.equal("", CheckrideMissionPopEvent())
        end)

        it("ignores empty-string payloads", function()
            CheckrideMission.queueEvent("")
            assert.are.equal("", CheckrideMissionPopEvent())
        end)
    end)

    describe("sendEvent", function()
        it("encodes the message and places it in the queue", function()
            CheckrideMission.sendEvent({ type = "grading", lsoGrade = "OK" })
            local popped = CheckrideMissionPopEvent()
            assert.is_truthy(popped)
            assert.is_truthy(popped:find('"type":"grading"'))
            assert.is_truthy(popped:find('"lsoGrade":"OK"'))
        end)

        it("sendEvent encodes nil as 'null' and queues it", function()
            CheckrideMission.sendEvent(nil)
            -- encodeMessage(nil) returns "null" (valid JSON null scalar).
            local popped = CheckrideMissionPopEvent()
            assert.are.equal("null", popped)
        end)
    end)

    describe("sendEnrichmentEvent", function()
        it("stamps persist = false before queuing", function()
            local captured = loader.capture_events()
            CheckrideMission.sendEnrichmentEvent({ type = "flight_sample_enrichment" })
            assert.are.equal(1, #captured)
            assert.are.equal(false, captured[1].persist)
        end)

        it("places an encoded event in the queue", function()
            CheckrideMission.sendEnrichmentEvent({ type = "flight_sample_enrichment" })
            local popped = CheckrideMissionPopEvent()
            assert.is_truthy(popped:find('"type":"flight_sample_enrichment"'))
        end)

        it("sets persist = false even if it was true", function()
            local captured = loader.capture_events()
            CheckrideMission.sendEnrichmentEvent({ type = "x", persist = true })
            assert.are.equal(false, captured[1].persist)
        end)
    end)
end)
