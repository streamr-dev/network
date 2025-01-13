import { Multimap } from '../src/Multimap'

describe('Multimap', () => {
    it('happy path', () => {
        const map: Multimap<string, number> = new Multimap()
        map.add('foo', 5)
        map.add('bar', 5)
        map.add('bar', 8)
        map.add('temp', 5)
        map.addAll('foo', [4, 6, 7, 8, 9])
        map.remove('foo', 8)
        map.removeAll('foo', [6, 9])
        map.remove('foo', 123)
        map.remove('temp', 5)
        expect(map.has('foo', 5)).toBe(true)
        expect(map.has('bar', 8)).toBe(true)
        expect(map.has('bar', 5)).toBe(true)
        expect(map.has('foo', 9)).toBe(false)
        expect(map.has('foo', 456)).toBe(false)
        expect([...map.keys()]).toIncludeSameMembers(['foo', 'bar'])
        expect([...map.values()]).toIncludeSameMembers([5, 4, 7, 5, 8])
    })
})
