import { FifoMapWithTTL } from '../../src/logic/propagation/FifoMapWithTTL'

describe('FifoMapWithTtl', () => {
    describe('invalid constructor arguments', () => {
        it('cannot instantiate with negative ttl', () => {
            expect(() => new FifoMapWithTTL({ ttlInMs: -5, maxSize: 10 })).toThrow('ttlInMs (-5) cannot be < 0')
        })

        it('cannot instantiate with negative maxSize', () => {
            expect(() => new FifoMapWithTTL({ ttlInMs: 100, maxSize: -6 })).toThrow('maxSize (-6) cannot be < 0')
        })
    })

    it('of maxSize=0 always remains empty', () => {
        const fifoMap = new FifoMapWithTTL<string, string>({
            ttlInMs: 100,
            maxSize: 0
        })
        fifoMap.set('hello', 'world')
        fifoMap.set('are', 'you empty?')
        expect(fifoMap.get('hello')).toBeUndefined()
        expect(fifoMap.get('are')).toBeUndefined()
    })

    describe('of maxSize=5', () => {
        let fifoMap: FifoMapWithTTL<string, string>

        beforeEach(() => {
            fifoMap = new FifoMapWithTTL<string, string>({
                ttlInMs: 100,
                maxSize: 5
            })
        })

        function setFirstFiveMessages() {
            fifoMap.set('1st', 'foo')
            fifoMap.set('2nd', 'bar')
            fifoMap.set('3rd', 'hello')
            fifoMap.set('4th', 'world')
            fifoMap.set('5th', '!')
        }

        function set6thAnd7thMessages() {
            fifoMap.set('6th', 'new')
            fifoMap.set('7th', 'messages')
        }

        it('can insert 5 items and retrieve all of them', () => {
            setFirstFiveMessages()
            expect(fifoMap.get('1st')).toEqual('foo')
            expect(fifoMap.get('2nd')).toEqual('bar')
            expect(fifoMap.get('3rd')).toEqual('hello')
            expect(fifoMap.get('4th')).toEqual('world')
            expect(fifoMap.get('5th')).toEqual('!')
        })

        it('inserting items when full causes oldest items to get dropped', () => {
            setFirstFiveMessages()
            set6thAnd7thMessages()
            expect(fifoMap.get('1st')).toBeUndefined()
            expect(fifoMap.get('2nd')).toBeUndefined()
            expect(fifoMap.get('3rd')).toEqual('hello')
            expect(fifoMap.get('4th')).toEqual('world')
            expect(fifoMap.get('5th')).toEqual('!')
            expect(fifoMap.get('6th')).toEqual('new')
            expect(fifoMap.get('7th')).toEqual('messages')
        })

        describe('(re-)setting an item', () => {
            beforeEach(() => {
                setFirstFiveMessages()
                fifoMap.set('4th', 'modified-once')
                fifoMap.set('4th', 'modified-twice')
            })

            it('does not cause oldest items to drop', () => {
                expect(fifoMap.get('1st')).toEqual('foo')
                expect(fifoMap.get('2nd')).toEqual('bar')
                expect(fifoMap.get('3rd')).toEqual('hello')
                expect(fifoMap.get('5th')).toEqual('!')
            })

            it('newest value stays in place', () => {
                expect(fifoMap.get('4th')).toEqual('modified-twice')
            })
        })

        describe('#delete', () => {
            it('can delete an item', () => {
                setFirstFiveMessages()
                fifoMap.delete('4th')
                expect(fifoMap.get('1st')).toEqual('foo')
                expect(fifoMap.get('2nd')).toEqual('bar')
                expect(fifoMap.get('3rd')).toEqual('hello')
                expect(fifoMap.get('4th')).toBeUndefined()
                expect(fifoMap.get('5th')).toEqual('!')
            })

            it('deleting items makes room for new ones', () => {
                setFirstFiveMessages()
                fifoMap.delete('2nd')
                fifoMap.delete('4th')
                set6thAnd7thMessages()
                expect(fifoMap.get('1st')).toEqual('foo')
                expect(fifoMap.get('2nd')).toBeUndefined()
                expect(fifoMap.get('3rd')).toEqual('hello')
                expect(fifoMap.get('4th')).toBeUndefined()
                expect(fifoMap.get('5th')).toEqual('!')
                expect(fifoMap.get('6th')).toEqual('new')
                expect(fifoMap.get('7th')).toEqual('messages')
            })

            it('deleting a non-existing item does not throw', () => {
                setFirstFiveMessages()
                expect(() => fifoMap.delete('non-existing-key')).not.toThrow()
            })

            it('deleting a non-existing item keeps existing items intact', () => {
                setFirstFiveMessages()
                fifoMap.delete('non-existing-key')
                expect(fifoMap.get('1st')).toEqual('foo')
                expect(fifoMap.get('2nd')).toEqual('bar')
                expect(fifoMap.get('3rd')).toEqual('hello')
                expect(fifoMap.get('4th')).toEqual('world')
                expect(fifoMap.get('5th')).toEqual('!')
            })
        })

        describe('TTL', () => {
            let time: number

            beforeEach(() => {
                time = 0
                fifoMap = new FifoMapWithTTL<string, string>({
                    ttlInMs: 100,
                    maxSize: 5,
                    timeProvider: () => time
                })
            })

            it('#get returns undefined after TTL', () => {
                time = 0
                fifoMap.set('hello', 'world')
                time = 50
                fifoMap.set('foo', 'bar')

                time = 100
                expect(fifoMap.get('hello')).toBeUndefined()
                expect(fifoMap.get('foo')).toEqual('bar')

                time = 160
                expect(fifoMap.get('hello')).toBeUndefined()
                expect(fifoMap.get('foo')).toBeUndefined()
            })

            it('re-setting an item resets TTL', () => {
                time = 0
                fifoMap.set('hello', 'world')

                time = 90
                fifoMap.set('hello', 'world')

                time = 100
                expect(fifoMap.get('hello')).toEqual('world')
            })

            it('re-setting expired resets TTL', () => {
                time = 0
                fifoMap.set('hello', 'world')

                time = 110
                expect(fifoMap.get('hello')).toBeUndefined() // sanity check
                fifoMap.set('hello', 'world')

                time = 150
                expect(fifoMap.get('hello')).toEqual('world')
            })

            it('#values returns non-expired items', () => {
                time = 0
                fifoMap.set('hello', 'world')
                time = 50
                fifoMap.set('foo', 'bar')
                time = 100
                fifoMap.set('lorem', 'ipsum')
                time = 120
                fifoMap.set('dolor', 'sit')

                expect(fifoMap.values()).toEqual(['bar', 'ipsum', 'sit'])

                time = 130
                fifoMap.set('amet', 'consectetur')

                expect(fifoMap.values()).toEqual(['bar', 'ipsum', 'sit', 'consectetur'])

                time = 200
                expect(fifoMap.values()).toEqual(['sit', 'consectetur'])

                time = 300
                expect(fifoMap.values()).toEqual([])
            })
        })

        describe('onItemDropped callback', () => {
            let time: number
            let onItemDropped: jest.Mock<undefined, [string]>

            beforeEach(() => {
                time = 0
                onItemDropped = jest.fn<undefined, [string]>()
                fifoMap = new FifoMapWithTTL<string, string>({
                    ttlInMs: 100,
                    maxSize: 5,
                    onItemDropped,
                    timeProvider: () => time
                })
            })

            it('invoked when deleting an item', () => {
                setFirstFiveMessages()
                fifoMap.delete('3rd')
                expect(onItemDropped).toHaveBeenCalledTimes(1)
                expect(onItemDropped).toHaveBeenCalledWith('3rd')
            })

            it('invoked when items are dropped due to being full', () => {
                setFirstFiveMessages()
                set6thAnd7thMessages()
                expect(onItemDropped).toHaveBeenCalledTimes(2)
                expect(onItemDropped).toHaveBeenNthCalledWith(1, '1st')
                expect(onItemDropped).toHaveBeenNthCalledWith(2, '2nd')
            })

            it('invoked when re-setting an item', () => {
                setFirstFiveMessages()
                fifoMap.set('4th', '!!!')
                expect(onItemDropped).toHaveBeenCalledTimes(1)
                expect(onItemDropped).toHaveBeenNthCalledWith(1, '4th')
            })

            it('invoked when getting a stale item', () => {
                time = 0
                setFirstFiveMessages()
                time = 500
                expect(fifoMap.get('1st')).toBeUndefined()
                expect(onItemDropped).toHaveBeenCalledTimes(1)
                expect(onItemDropped).toHaveBeenNthCalledWith(1, '1st')
            })
        })
    })
})
