import { FifoCache } from "../../src/logic/node/propagation/FifoCache"

describe(FifoCache, () => {
    it('cannot instantiate cache with negative ttl', () => {
        expect(() => new FifoCache(-5, 10)).toThrow('ttlInMs (-5) cannot be < 0')
    })

    it('cannot instantiate cache with negative maxSize', () => {
        expect(() => new FifoCache(100, -6)).toThrow('maxSize (-6) cannot be < 0')
    })

    it('cache of maxSize=0 is always empty', () => {
        const cache = new FifoCache<string, string>(100, 0, Date.now, true)
        cache.set('hello', 'world')
        expect(cache.get('hello')).toBeUndefined()
    })

    describe('cache of size 5', () => {
        let cache: FifoCache<string, string>

        beforeEach(() => {
            cache = new FifoCache<string, string>(100, 5, Date.now, true)
        })

        function setFirstFiveMessages() {
            cache.set('1st', 'foo')
            cache.set('2nd', 'bar')
            cache.set('3rd', 'hello')
            cache.set('4th', 'world')
            cache.set('5th', '!')
        }

        it('can insert and retrieve those 5 items', () => {
            setFirstFiveMessages()
            expect(cache.get('1st')).toEqual('foo')
            expect(cache.get('2nd')).toEqual('bar')
            expect(cache.get('3rd')).toEqual('hello')
            expect(cache.get('4th')).toEqual('world')
            expect(cache.get('5th')).toEqual('!')
        })

        it('inserting messages afterwards drops first messages', () => {
            setFirstFiveMessages()
            cache.set('6th', 'new')
            cache.set('7th', 'messages')
        })
    })
})