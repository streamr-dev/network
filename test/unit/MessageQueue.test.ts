import { MessageQueue, QueueItem } from "../../src/connection/MessageQueue"
import { wait } from "streamr-test-utils"

describe(MessageQueue, () => {
    let messageQueue: MessageQueue<string>

    beforeEach(() => {
        messageQueue = new MessageQueue<string>(10)
    })

    it('starts out empty', () => {
        expect(messageQueue.size()).toEqual(0)
        expect(messageQueue.empty()).toEqual(true)
    })

    it('not empty after adding elements', () => {
        messageQueue.add('hello')
        messageQueue.add('world')

        expect(messageQueue.size()).toEqual(2)
        expect(messageQueue.empty()).toEqual(false)
    })

    it('peek does not drop message', () => {
        messageQueue.add('hello')
        messageQueue.add('world')

        expect(messageQueue.peek().getMessage()).toEqual('hello')
        expect(messageQueue.peek().getMessage()).toEqual('hello')
        expect(messageQueue.size()).toEqual(2)
    })

    it('preserves FIFO insertion order (add & pop)', () => {
        messageQueue.add("hello")
        messageQueue.add("world")
        messageQueue.add("!")
        messageQueue.add("lorem")
        messageQueue.add("ipsum")
        expect(messageQueue.pop().getMessage()).toEqual('hello')
        expect(messageQueue.pop().getMessage()).toEqual('world')
        expect(messageQueue.pop().getMessage()).toEqual('!')
        expect(messageQueue.pop().getMessage()).toEqual('lorem')
        expect(messageQueue.pop().getMessage()).toEqual('ipsum')
    })

    it('drops message in FIFO order when adding to full queue', async () => {
        const recordedErrors: object[] = []
        for (let i=1; i <= 10; ++i) {
            messageQueue.add(`message ${i}`).catch((err: Error) => {
                recordedErrors.push({
                    i,
                    err
                })
            })
        }
        messageQueue.add('message 11')
        messageQueue.add('message 12')
        await wait(0) // yield execution to error handlers

        expect(messageQueue.size()).toEqual(10)
        expect(messageQueue.peek().getMessage()).toEqual('message 3')
        expect(recordedErrors).toEqual([
            {
                i: 1,
                err: new Error("Message queue full, dropping message.")
            },
            {
                i: 2,
                err: new Error("Message queue full, dropping message.")
            }
        ])
    })
})
