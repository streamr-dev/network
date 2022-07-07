import { StreamMessage } from 'streamr-client-protocol'
import { PushBuffer } from './../utils/PushBuffer'
import { Signal } from './../utils/Signal'

type ProcessMessageFn<T> = (streamMessage: StreamMessage<T>) => Promise<StreamMessage<T>>

class MsgChainProcessor<T> {

    busy = false
    inputBuffer: StreamMessage<T>[] = []
    outputBuffer: PushBuffer<StreamMessage<T>>
    processMessageFn: ProcessMessageFn<T>
    onError: Signal<any>

    constructor(outputBuffer: PushBuffer<StreamMessage<T>>, processMessageFn: ProcessMessageFn<T>, onError: Signal<any>) {
        this.outputBuffer = outputBuffer
        this.processMessageFn = processMessageFn
        this.onError = onError
    }

    async addMessage(message: StreamMessage<T>): Promise<void> {
        this.inputBuffer.push(message)
        if (!this.busy) {
            this.busy = true
            while (this.inputBuffer.length > 0) {
                const nextMessage = this.inputBuffer.shift()!
                try {
                    const processedMessage = await this.processMessageFn(nextMessage)
                    this.outputBuffer.push(processedMessage)
                } catch (e) {
                    this.onError.trigger(e)
                }
            }
            this.busy = false
        }
    }
}

export class MsgChainUtil<T> implements AsyncIterable<StreamMessage<T>> {

    outputBuffer: PushBuffer<StreamMessage<T>> = new PushBuffer()
    processors: Map<string,MsgChainProcessor<T>> = new Map()
    processMessageFn: ProcessMessageFn<T>
    onError: Signal<any> // TODO better type for Signal

    constructor(processMessageFn: ProcessMessageFn<T>, onError: Signal<any>) {
        this.processMessageFn = processMessageFn
        this.onError = onError
    }

    addMessage(message: StreamMessage<T>): Promise<void> {
        const id = `${message.getPublisherId()}-${message.getMsgChainId()}`
        let processor = this.processors.get(id)
        if (processor === undefined) {
            processor = new MsgChainProcessor(this.outputBuffer, this.processMessageFn, this.onError)
            this.processors.set(id, processor)
        }
        return processor.addMessage(message)
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage<T>> {
        return this.outputBuffer
    }
}
