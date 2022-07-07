import { Gate } from './../utils/Gate';
import { waitForCondition } from 'streamr-test-utils'
import { StreamMessage } from 'streamr-client-protocol'
import { PushBuffer } from './../utils/PushBuffer'
import { Signal } from './../utils/Signal'

type ProcessMessageFn<T> = (streamMessage: StreamMessage<T>) => Promise<StreamMessage<T>>

type OnError<T> = Signal<[Error, StreamMessage<T>?, number?]>

class MsgChainProcessor<T> {

    busy: Gate = new Gate()
    inputBuffer: StreamMessage<T>[] = []
    outputBuffer: PushBuffer<StreamMessage<T>>
    processMessageFn: ProcessMessageFn<T>
    onError: OnError<T>

    constructor(outputBuffer: PushBuffer<StreamMessage<T>>, processMessageFn: ProcessMessageFn<T>, onError: OnError<T>) {
        this.outputBuffer = outputBuffer
        this.processMessageFn = processMessageFn
        this.onError = onError
    }

    async addMessage(message: StreamMessage<T>): Promise<void> {
        this.inputBuffer.push(message)
        if (this.busy.isOpen()) {
            this.busy.close()
            while (this.inputBuffer.length > 0) {
                const nextMessage = this.inputBuffer.shift()!
                try {
                    const processedMessage = await this.processMessageFn(nextMessage)
                    this.outputBuffer.push(processedMessage)
                } catch (e: any) {
                    this.onError.trigger(e)
                }
            }
            this.busy.open()
        }
    }
}

export class MsgChainUtil<T> implements AsyncIterable<StreamMessage<T>> {

    outputBuffer: PushBuffer<StreamMessage<T>> = new PushBuffer()
    processors: Map<string,MsgChainProcessor<T>> = new Map()
    processMessageFn: ProcessMessageFn<T>
    onError: OnError<T>

    constructor(processMessageFn: ProcessMessageFn<T>, onError: OnError<T>) {
        this.processMessageFn = processMessageFn
        this.onError = onError
    }

    addMessage(message: StreamMessage<T>): void {
        const id = `${message.getPublisherId()}-${message.getMsgChainId()}`
        let processor = this.processors.get(id)
        if (processor === undefined) {
            processor = new MsgChainProcessor(this.outputBuffer, this.processMessageFn, this.onError)
            this.processors.set(id, processor)
        }
        processor.addMessage(message) // add a task, but don't wait for it to complete
    }

    async flush(): Promise<void> {
        await Promise.all(Array.from(this.processors.values()).map((p) => p.busy.check()))
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage<T>> {
        return this.outputBuffer
    }
}
