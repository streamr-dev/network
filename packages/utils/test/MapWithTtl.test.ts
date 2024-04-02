import { MapWithTtl } from '../src/MapWithTtl'

describe('MapWithTtl', () => {
    let map: MapWithTtl<string, number>

    beforeEach(() => {
        jest.useFakeTimers()
        map = new MapWithTtl(() => 1000)
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('sets and gets a value', () => {
        map.set('key', 123)
        expect(map.get('key')).toBe(123)
    })

    it('sets a value and clears it after ttl', () => {
        map.set('key', 123)
        jest.advanceTimersByTime(1001)
        expect(map.get('key')).toBeUndefined()
    })

    it('replaces a value before ttl', () => {
        map.set('key', 123)
        jest.advanceTimersByTime(500)
        map.set('key', 456)
        jest.advanceTimersByTime(501)
        expect(map.get('key')).toBe(456)
    })

    it('deletes a value', () => {
        map.set('key', 123)
        map.delete('key')
        expect(map.get('key')).toBeUndefined()
    })

    it('clears all values', () => {
        map.set('key1', 123)
        map.set('key2', 456)
        map.clear()
        expect(map.get('key1')).toBeUndefined()
        expect(map.get('key2')).toBeUndefined()
    })

    it('returns size', () => {
        map.set('key1', 123)
        map.set('key2', 456)
        expect(map.size()).toBe(2)
    })

    it('iterates over values', () => {
        map.set('key1', 123)
        map.set('key2', 456)
        const values = Array.from(map.values())
        expect(values).toEqual([123, 456])
    })

    it('executes callback for each entry', () => {
        map.set('key1', 123)
        map.set('key2', 456)
        const callback = jest.fn()
        map.forEach(callback)
        expect(callback).toHaveBeenCalledTimes(2)
        expect(callback).toHaveBeenNthCalledWith(1, 123, 'key1')
        expect(callback).toHaveBeenNthCalledWith(2, 456, 'key2')
    })
})
