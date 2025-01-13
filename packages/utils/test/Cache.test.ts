import { Cache } from '../src/Cache'
import { wait } from '../src/wait'

const MAX_AGE = 100
const JITTER_FACTOR = 10

describe('Cache', () => {
    it('happy path', async () => {
        let plainValue = 'foo'
        const valueFactory = jest.fn().mockImplementation(async () => plainValue)
        const cache = new Cache(valueFactory, MAX_AGE)
        expect(await cache.get()).toEqual('foo')
        expect(valueFactory).toHaveBeenCalledTimes(1)
        plainValue = 'bar'
        // should not change yet
        expect(await cache.get()).toEqual('foo')
        expect(valueFactory).toHaveBeenCalledTimes(1)
        // changes after max age elapsed
        await wait(MAX_AGE + JITTER_FACTOR)
        expect(await cache.get()).toEqual('bar')
        expect(valueFactory).toHaveBeenCalledTimes(2)
    })
})
