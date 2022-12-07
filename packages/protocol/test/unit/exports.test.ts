import * as Protocol from '../../src/exports'
import * as ControlLayer from "../../src/protocol/control_layer/exports"
import * as MessageLayer from "../../src/protocol/message_layer/exports"
import * as TrackerLayer from "../../src/protocol/tracker_layer/exports"
import * as Errors from "../../src/errors/exports"
import * as Utils from "../../src/utils/exports"

describe('exports.ts', () => {
    it('exports all members of containers at top level also ensuring there are no duplicate names', () => {
        const containers = [ControlLayer, MessageLayer, TrackerLayer, Errors, Utils]
        const numKeys = containers.map((value) => Object.keys(value).length).reduce((a, b) => a + b)
        expect.assertions(numKeys)
        containers.forEach((container) => {
            Object.entries(container).forEach(([containerKey, containerValue]) => {
                // @ts-expect-error figure out proper typing here
                expect(Protocol[containerKey]).toBe(containerValue)
            })
        })
    })
})
