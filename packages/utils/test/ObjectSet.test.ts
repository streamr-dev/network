import { ObjectSet } from '../src/ObjectSet'

describe('ObjectSet', () => {
    let objectSet: ObjectSet<number>

    beforeEach(() => {
        objectSet = new ObjectSet<number>((num) => num.toString())
    })

    it('adds an object to the set', () => {
        objectSet.add(1)
        expect(objectSet.has(1)).toBe(true)
    })

    it('does not add duplicate objects to the set', () => {
        objectSet.add(1)
        objectSet.add(1)
        expect(objectSet.has(1)).toBe(true)
    })

    it('checks if an object is in the set', () => {
        objectSet.add(1)
        expect(objectSet.has(1)).toBe(true)
        expect(objectSet.has(2)).toBe(false)
    })

    it('gets an object from the set', () => {
        objectSet.add(1)
        expect(objectSet.get(1)).toBe(1)
    })

    it('returns undefined when getting an object not in the set', () => {
        expect(objectSet.get(1)).toBeUndefined()
    })

    it('deletes an object from the set', () => {
        objectSet.add(1)
        objectSet.delete(1)
        expect(objectSet.has(1)).toBe(false)
    })

    it('clears the set', () => {
        objectSet.add(1)
        objectSet.add(2)
        objectSet.clear()
        expect(objectSet.has(1)).toBe(false)
        expect(objectSet.has(2)).toBe(false)
    })
})
