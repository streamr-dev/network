import * as Protocol from '../../src'
import * as ControlLayer from "../../src/protocol/control_layer/index"
import * as MessageLayer from "../../src/protocol/message_layer/index"
import * as TrackerLayer from "../../src/protocol/tracker_layer/index"
import * as Errors from "../../src/errors/index"
import * as Utils from "../../src/utils/index"

describe('index.ts', () => {
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
