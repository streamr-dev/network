import { pTransaction } from '../src/pTransaction'

function promisify(...sequence: Array<string | Error>): Array<Promise<string>> {
    return sequence.map((v) => {
        if (typeof v === 'string') {
            return Promise.resolve(v)
        } else {
            return Promise.reject(v)
        }
    })
}

describe('pTransaction', () => {
    it('resolves with empty array given empty array', async () => {
        const result = await pTransaction([], () => {})
        expect(result).toEqual([])
    })

    it('does not invoke rollback given empty array', async () => {
        const rollback = jest.fn()
        await pTransaction([], rollback)
        expect(rollback).not.toHaveBeenCalled()
    })

    it('resolves with values given array of resolving promises', async () => {
        const promises = promisify('a', 'b', 'c')
        const result = await pTransaction(promises, () => {})
        expect(result).toEqual(['a', 'b', 'c'])
    })

    it('does not invoke rollback given array of resolving promises', async () => {
        const promises = promisify('a', 'b', 'c')
        const rollback = jest.fn()
        await pTransaction(promises, rollback)
        expect(rollback).not.toHaveBeenCalled()
    })

    it('rejects given an array containing a rejection', async () => {
        const promises = promisify('a', 'b', new Error('something bad'), 'c')
        await expect(pTransaction(promises, () => {})).rejects.toThrowError('something bad')
    })

    it('invokes rollback given an array containing a rejection', async () => {
        const promises = promisify('a', 'b', new Error('something bad'), 'c')
        const rollback = jest.fn()
        await expect(pTransaction(promises, rollback)).toReject()
        expect(rollback).toHaveBeenCalledTimes(2)
        expect(rollback).toHaveBeenCalledWith('a')
        expect(rollback).toHaveBeenCalledWith('b')
    })

    it('does not invoke rollback if first element in given array rejects', async () => {
        const promises = promisify(new Error('something bad'), 'a', 'b', 'c')
        const rollback = jest.fn()
        await expect(pTransaction(promises, rollback)).toReject()
        expect(rollback).not.toHaveBeenCalled()
    })
})
