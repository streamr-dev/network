import { allOrCleanup } from '../src/allOrCleanup'

function promisify(...sequence: Array<string | Error>): Array<Promise<string>> {
    return sequence.map((v) => {
        if (typeof v === 'string') {
            return Promise.resolve(v)
        } else {
            return Promise.reject(v)
        }
    })
}

describe('allOrCleanup', () => {
    it('resolves with empty array given empty array', async () => {
        const result = await allOrCleanup([], () => {})
        expect(result).toEqual([])
    })

    it('does not invoke cleanup callback given empty array', async () => {
        const cleanup = jest.fn()
        await allOrCleanup([], cleanup)
        expect(cleanup).not.toHaveBeenCalled()
    })

    it('resolves with values given array of resolving promises', async () => {
        const promises = promisify('a', 'b', 'c')
        const result = await allOrCleanup(promises, () => {})
        expect(result).toEqual(['a', 'b', 'c'])
    })

    it('does not invoke cleanup callback given array of resolving promises', async () => {
        const promises = promisify('a', 'b', 'c')
        const cleanup = jest.fn()
        await allOrCleanup(promises, cleanup)
        expect(cleanup).not.toHaveBeenCalled()
    })

    it('rejects given an array containing a rejection', async () => {
        const promises = promisify('a', 'b', new Error('something bad'), 'c')
        await expect(allOrCleanup(promises, () => {})).rejects.toThrowError('something bad')
    })

    it('invokes cleanup given an array containing a rejection', async () => {
        const promises = promisify('a', 'b', new Error('something bad'), 'c')
        const cleanup = jest.fn()
        await expect(allOrCleanup(promises, cleanup)).toReject()
        expect(cleanup).toHaveBeenCalledTimes(2)
        expect(cleanup).toHaveBeenCalledWith('a')
        expect(cleanup).toHaveBeenCalledWith('b')
    })

    it('does not invoke cleanup if first element in given array rejects', async () => {
        const promises = promisify(new Error('something bad'), 'a', 'b', 'c')
        const cleanup = jest.fn()
        await expect(allOrCleanup(promises, cleanup)).toReject()
        expect(cleanup).not.toHaveBeenCalled()
    })
})
