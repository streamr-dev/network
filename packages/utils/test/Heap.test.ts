import { Heap } from '../src/Heap'

interface Item {
    value: number
}

const createItem = (value: number) => {
    return { value }
}

describe('Heap', () => {
    let heap: Heap<Item>

    beforeEach(() => {
        heap = new Heap<Item>((item1, item2) => item1.value - item2.value)
    })

    const getValues = () => heap.values().map((item) => item.value)

    it('happy path', () => {
        heap.push(createItem(5))
        expect(heap.contains(createItem(4))).toBeFalse()
        expect(heap.contains(createItem(5))).toBeTrue()
        expect(heap.contains(createItem(6))).toBeFalse()
        heap.push(createItem(2))
        heap.push(createItem(9))
        heap.push(createItem(4))
        heap.push(createItem(6))
        heap.push(createItem(4))
        heap.push(createItem(7))
        expect(getValues()).toEqual([2, 4, 4, 5, 6, 7, 9])
        expect(heap.contains(createItem(4))).toBeTrue()
        expect(heap.contains(createItem(5))).toBeTrue()
        expect(heap.contains(createItem(3))).toBeFalse()
        expect(heap.peek()).toEqual(createItem(2))
        expect(heap.pop()).toEqual(createItem(2))
        expect(getValues()).toEqual([4, 4, 5, 6, 7, 9])
        expect(heap.pop()).toEqual(createItem(4))
        expect(getValues()).toEqual([4, 5, 6, 7, 9])
    })

    it('empty', () => {
        expect(heap.contains(createItem(5))).toBeFalse()
        expect(heap.peek()).toBeUndefined()
        expect(heap.pop()).toBeUndefined()
        expect(getValues()).toEqual([])
    })

    it('boundaries', () => {
        heap.push(createItem(1))
        heap.push(createItem(1))
        expect(heap.contains(createItem(1))).toBeTrue()
        heap.push(createItem(2))
        expect(heap.contains(createItem(2))).toBeTrue()
        heap.push(createItem(3))
        heap.push(createItem(3))
        expect(heap.contains(createItem(3))).toBeTrue()
        expect(getValues()).toEqual([1, 1, 2, 3, 3])
    })
})
