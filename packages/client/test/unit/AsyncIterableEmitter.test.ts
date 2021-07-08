import { wait } from 'streamr-test-utils'
import AsyncIterableEmitter, { asyncIterableWithEvents, flowOnMessageListener } from '../../src/utils/AsyncIterableEmitter'

async function* generate(max: number) {
    let count = 0
    while (count < max) {
        yield count
        count += 1
    }
}

type MsgType = {
    value: number
}

const MAX_MESSAGES = 5

describe('AsyncIterableEmitter', () => {
    it('emits message events then end', async () => {
        const generated: MsgType[] = []
        class MsgEmitter extends AsyncIterableEmitter<MsgType> {
            [Symbol.asyncIterator]() { // eslint-disable-line class-methods-use-this
                return asyncIterableWithEvents((async function* G() {
                    for await (const value of generate(MAX_MESSAGES)) {
                        const item = { value }
                        generated.push(item)
                        yield item
                    }
                }()), this)
            }
        }
        const msgEmitter = new MsgEmitter()
        const receivedEvents: MsgType[] = []
        const receivedYields: MsgType[] = []
        msgEmitter.on('message', (msg) => {
            receivedEvents.push(msg)
        })
        const onEnd = jest.fn()
        const onError = jest.fn()
        msgEmitter.on('end', onEnd)
        msgEmitter.on('error', onError)
        for await (const msg of msgEmitter) {
            receivedYields.push(msg)
        }

        expect(generated).toHaveLength(5)
        expect(receivedEvents).toEqual(generated)
        expect(receivedYields).toEqual(generated)
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(msgEmitter.listenerCount('message')).toBe(0)
        expect(msgEmitter.listenerCount('error')).toBe(0)
        expect(msgEmitter.listenerCount('end')).toBe(0)
    })

    it('emits message events then error then end', async () => {
        const generated: MsgType[] = []
        const err = new Error('expected')
        const THROW_AFTER = 3
        class MsgEmitter extends AsyncIterableEmitter<MsgType> {
            [Symbol.asyncIterator]() { // eslint-disable-line class-methods-use-this
                return asyncIterableWithEvents((async function* G() {
                    for await (const value of generate(MAX_MESSAGES)) {
                        if (generated.length === THROW_AFTER) {
                            throw err
                        }
                        const item = { value }
                        generated.push(item)
                        yield item
                    }
                }()), this)
            }
        }

        const msgEmitter = new MsgEmitter()
        const receivedEvents: MsgType[] = []
        const receivedYields: MsgType[] = []
        msgEmitter.on('message', (msg) => {
            receivedEvents.push(msg)
        })
        const onEnd = jest.fn()
        const onError = jest.fn((error: Error) => {
            throw error // rethrow to throw iterator
        })
        msgEmitter.on('end', onEnd)
        msgEmitter.on('error', onError)

        expect(msgEmitter.listenerCount('message')).toBe(1)
        expect(msgEmitter.listenerCount('error')).toBe(1)
        expect(msgEmitter.listenerCount('end')).toBe(1)
        await expect(async () => {
            for await (const msg of msgEmitter) {
                receivedYields.push(msg)
            }
        }).rejects.toThrow(err)

        expect(generated).toHaveLength(THROW_AFTER)
        expect(receivedEvents).toEqual(generated)
        expect(receivedYields).toEqual(generated)
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(err)
        expect(msgEmitter.listenerCount('message')).toBe(0)
        expect(msgEmitter.listenerCount('error')).toBe(0)
        expect(msgEmitter.listenerCount('end')).toBe(0)
    })

    it('auto-start flow and can stop flow', async () => {
        const generated: MsgType[] = []
        const STOP_AFTER = 3
        class MsgEmitter extends AsyncIterableEmitter<MsgType> {
            iterator
            constructor() {
                super()
                this.iterator = this.iterate()
                flowOnMessageListener(this.iterator, this)
            }

            iterate() {
                return asyncIterableWithEvents((async function* G() {
                    for await (const value of generate(MAX_MESSAGES)) {
                        const item = { value }
                        generated.push(item)
                        yield item
                    }
                }()), this)
            }

            [Symbol.asyncIterator]() { // eslint-disable-line class-methods-use-this
                return this.iterator
            }
        }
        const msgEmitter = new MsgEmitter()
        const receivedEvents: MsgType[] = []
        const onEnd = jest.fn()
        const onError = jest.fn()
        msgEmitter.on('end', onEnd)
        msgEmitter.on('error', onError)
        msgEmitter.on('message', (msg) => {
            receivedEvents.push(msg)
            if (receivedEvents.length === STOP_AFTER) {
                msgEmitter.iterator.return(undefined)
            }
        })
        await wait(1)
        expect(generated).toHaveLength(STOP_AFTER)
        expect(receivedEvents).toEqual(generated)
        expect(onEnd).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledTimes(0)
        expect(msgEmitter.listenerCount('message')).toBe(0)
        expect(msgEmitter.listenerCount('error')).toBe(0)
        expect(msgEmitter.listenerCount('end')).toBe(0)
    })
})
