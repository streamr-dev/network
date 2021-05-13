import * as Protocol from '../../src'

// in enum the first key is a number, that number maps to a string,
// and that string maps to the first key (e.g. '123' => 'Foobar' => '123')
const isProbablyEnum = (obj: any) => {
    const key = Object.keys(obj)[0]
    if (Number.isNaN(parseInt(key))) {
        return false
    }
    const value = obj[key]
    if (typeof value !== 'string') {
        return false
    }
    return obj[value] == key
}

describe('re-exports', () => {
    it('re-exports everything', () => {
        // ensure all sub-modules are exported at top level
        // and there aren't any duplicates
        const protocolEntries = Object.values(Protocol)
        const containers = protocolEntries.filter((value) => (typeof value !== 'function') && !isProbablyEnum(value))
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
