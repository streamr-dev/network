import * as Protocol from '../../src/exports'
import * as Utils from '../../src/utils/exports'

describe('exports.ts', () => {
    it('exports all members of containers at top level also ensuring there are no duplicate names', () => {
        const containers = [Utils]
        const numKeys = containers.map((value) => Object.keys(value).length).reduce((a, b) => a + b)
        expect.assertions(numKeys)
        containers.forEach((container) => {
            Object.entries(container).forEach(([containerKey, containerValue]) => {
                // @ts-expect-error figure out proper typing here
                // eslint-disable-next-line import/namespace
                expect(Protocol[containerKey]).toBe(containerValue)
            })
        })
    })
})
