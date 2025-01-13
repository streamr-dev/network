import { collect } from '../src/collect'

async function* createIterable(arr: number[]): AsyncIterable<number> {
    for (const item of arr) {
        yield item
    }
}

describe('collect', () => {
    it('collects all items from source', async () => {
        const source = createIterable([1, 2, 3, 4, 5])
        const result = await collect(source)
        expect(result).toEqual([1, 2, 3, 4, 5])
    })

    it('collects items up to the specified maxCount', async () => {
        const source = createIterable([1, 2, 3, 4, 5])
        const result = await collect(source, 3)
        expect(result).toEqual([1, 2, 3])
    })

    it('collects all items if maxCount is greater than the number of items', async () => {
        const source = createIterable([1, 2, 3, 4, 5])
        const result = await collect(source, 10)
        expect(result).toEqual([1, 2, 3, 4, 5])
    })

    it('collects an empty array from empty source', async () => {
        const source = createIterable([])
        const result = await collect(source)
        expect(result).toEqual([])
    })

    it('collects an empty array if maxCount is 0', async () => {
        const source = createIterable([1, 2, 3, 4, 5])
        const result = await collect(source, 0)
        expect(result).toEqual([])
    })

    it('rejects if source throws', async () => {
        const source = (async function* () {
            yield 1
            throw new Error('mock-error')
        })()
        await expect(() => collect(source)).rejects.toThrow('mock-error')
    })
})
