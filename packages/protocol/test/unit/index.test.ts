import * as Protocol from '../../src'

describe('re-exports', () => {
    it('re-exports everything', () => {
        // ensure all sub-modules are exported at top level
        // and there aren't any duplicates
        const protocolEntries = Object.values(Protocol)
        const containers = protocolEntries.filter((value) => typeof value !== 'function')
        const numKeys = containers.map((value) => Object.keys(value).length).reduce((a, b) => a + b)
        expect.assertions(numKeys)
        containers.forEach((container) => {
            Object.entries(container).forEach(([containerKey, containerValue]) => {
                // @ts-expect-error
                expect(Protocol[containerKey]).toBe(containerValue)
            })
        })
    })
})
