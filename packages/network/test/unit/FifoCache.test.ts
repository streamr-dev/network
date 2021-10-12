import { FifoCache } from "../../src/logic/node/propagation/FifoCache"

describe(FifoCache, () => {
    describe('invalid constructor arguments', () => {
        it('cannot instantiate cache with negative ttl', () => {
            expect(() => new FifoCache({ ttlInMs: -5, maxSize: 10 }))
                .toThrow('ttlInMs (-5) cannot be < 0')
        })

        it('cannot instantiate cache with negative maxSize', () => {
            expect(() => new FifoCache({ ttlInMs: 100, maxSize: -6 }))
                .toThrow('maxSize (-6) cannot be < 0')
        })
    })

    it('cache of maxSize=0 always remains empty', () => {
        const cache = new FifoCache<string, string>({
            ttlInMs: 100,
            maxSize: 0,
            debugMode: true
        })
        cache.set('hello', 'world')
        cache.set('are', 'you empty?')
        expect(cache.get('hello')).toBeUndefined()
        expect(cache.get('are')).toBeUndefined()
    })

    describe('cache of maxSize=5', () => {
        let cache: FifoCache<string, string>

        beforeEach(() => {
            cache = new FifoCache<string, string>({
                ttlInMs: 100,
                maxSize: 5,
                debugMode: true
            })
        })

        function setFirstFiveMessages() {
            cache.set('1st', 'foo')
            cache.set('2nd', 'bar')
            cache.set('3rd', 'hello')
            cache.set('4th', 'world')
            cache.set('5th', '!')
        }

        function set6thAnd7thMessages() {
            cache.set('6th', 'new')
            cache.set('7th', 'messages')
        }

        it('can insert 5 items and retrieve all of them', () => {
            setFirstFiveMessages()

            expect(cache.get('1st')).toEqual('foo')
            expect(cache.get('2nd')).toEqual('bar')
            expect(cache.get('3rd')).toEqual('hello')
            expect(cache.get('4th')).toEqual('world')
            expect(cache.get('5th')).toEqual('!')
        })

        it('inserting items to a full cache causes oldest items to get dropped', () => {
            setFirstFiveMessages()
            set6thAnd7thMessages()

            expect(cache.get('1st')).toBeUndefined()
            expect(cache.get('2nd')).toBeUndefined()
            expect(cache.get('3rd')).toEqual('hello')
            expect(cache.get('4th')).toEqual('world')
            expect(cache.get('5th')).toEqual('!')
            expect(cache.get('6th')).toEqual('new')
            expect(cache.get('7th')).toEqual('messages')
        })

        describe('(re-)setting an item', () => {
            beforeEach(() => {
                setFirstFiveMessages()
                cache.set('4th', 'morld')
                cache.set('4th', 'vorld')
            })

            it('does not cause oldest items to drop', () => {
                expect(cache.get('1st')).toEqual('foo')
                expect(cache.get('2nd')).toEqual('bar')
                expect(cache.get('3rd')).toEqual('hello')
                expect(cache.get('5th')).toEqual('!')
            })

            it('newest value stays in place', () => {
                expect(cache.get('4th')).toEqual('vorld')
            })
        })

        describe('#delete', () => {
            it('can delete an item', () => {
                setFirstFiveMessages()
                cache.delete('4th')

                expect(cache.get('1st')).toEqual('foo')
                expect(cache.get('2nd')).toEqual('bar')
                expect(cache.get('3rd')).toEqual('hello')
                expect(cache.get('4th')).toBeUndefined()
                expect(cache.get('5th')).toEqual('!')
            })

            it('deleting items makes room for new ones', () => {
                setFirstFiveMessages()
                cache.delete('2nd')
                cache.delete('4th')
                set6thAnd7thMessages()

                expect(cache.get('1st')).toEqual('foo')
                expect(cache.get('2nd')).toBeUndefined()
                expect(cache.get('3rd')).toEqual('hello')
                expect(cache.get('4th')).toBeUndefined()
                expect(cache.get('5th')).toEqual('!')
                expect(cache.get('6th')).toEqual('new')
                expect(cache.get('7th')).toEqual('messages')
            })

            it('deleting a non-existing item does not throw', () => {
                setFirstFiveMessages()
                expect(() =>cache.delete('non-existing-key')).not.toThrow()
            })

            it('deleting a non-existing item keeps cache intact', () => {
                setFirstFiveMessages()
                cache.delete('non-existing-key')

                expect(cache.get('1st')).toEqual('foo')
                expect(cache.get('2nd')).toEqual('bar')
                expect(cache.get('3rd')).toEqual('hello')
                expect(cache.get('4th')).toEqual('world')
                expect(cache.get('5th')).toEqual('!')
            })
        })

        describe('TTL', () => {
            let time: number

            beforeEach(() => {
                time = 0
                cache = new FifoCache<string, string>({
                    ttlInMs: 100,
                    maxSize: 5,
                    timeProvider: () => time,
                    debugMode: true
                })
            })
            it('#get returns undefined after TTL', () => {
                time = 0
                cache.set('hello', 'world')
                time = 50
                cache.set('foo', 'bar')

                time = 100
                expect(cache.get('hello')).toBeUndefined()
                expect(cache.get('foo')).toEqual('bar')

                time = 151
                expect(cache.get('hello')).toBeUndefined()
                expect(cache.get('foo')).toBeUndefined()
            })

            it('re-setting resets TTL', () => {
                time = 0
                cache.set('hello', 'world')

                time = 90
                cache.set('hello', 'world')

                time = 100
                expect(cache.get('hello')).toEqual('world')
            })

            it('re-setting expired resets TTL', () => {
                time = 0
                cache.set('hello', 'world')

                time = 110
                expect(cache.get('hello')).toBeUndefined()
                cache.set('hello', 'world')

                time = 150
                expect(cache.get('hello')).toEqual('world')
            })
        })

        describe('onKeyDropped callback', () => {
            let time: number
            let onKeyDropped: jest.Mock<void, [string]>

            beforeEach(() => {
                time = 0
                onKeyDropped = jest.fn<void, [string]>()
                cache = new FifoCache<string, string>({
                    ttlInMs: 100,
                    maxSize: 5,
                    onKeyDropped,
                    timeProvider: () => time,
                    debugMode: true
                })
            })

            it('invoked when deleting an item', () => {
                setFirstFiveMessages()
                cache.delete('3rd')
                expect(onKeyDropped).toHaveBeenCalledTimes(1)
                expect(onKeyDropped).toHaveBeenCalledWith('3rd')
            })

            it('invoked when items are dropped due to cache being full', () => {
                setFirstFiveMessages()
                set6thAnd7thMessages()
                expect(onKeyDropped).toHaveBeenCalledTimes(2)
                expect(onKeyDropped).toHaveBeenNthCalledWith(1, '1st')
                expect(onKeyDropped).toHaveBeenNthCalledWith(2, '2nd')
            })

            it('invoked when re-setting an item', () => {
                setFirstFiveMessages()
                cache.set('4th', '!!!')
                expect(onKeyDropped).toHaveBeenCalledTimes(1)
                expect(onKeyDropped).toHaveBeenNthCalledWith(1, '4th')
            })

            it('not invoked when cache TTL expires', () => {
                time = 0
                setFirstFiveMessages()
                time = 500
                expect(cache.get('1st')).toBeUndefined()
                expect(onKeyDropped).toHaveBeenCalledTimes(0)
            })
        })
    })
})