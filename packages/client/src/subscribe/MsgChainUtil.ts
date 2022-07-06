import { PushBuffer } from './../utils/PushBuffer';
import { StreamMessage } from 'streamr-client-protocol';

type ProcessMessageFn<T> = (streamMessage: StreamMessage<T>) => Promise<StreamMessage<T>>

class MsgChainProcessor<T> {

    busy = false
    inputBuffer: StreamMessage<T>[] = []
    outputBuffer: PushBuffer<StreamMessage<T>>
    processMessageFn: ProcessMessageFn<T>

    constructor(outputBuffer: PushBuffer<StreamMessage<T>>, processMessageFn: ProcessMessageFn<T>) {
        this.outputBuffer = outputBuffer
        this.processMessageFn = processMessageFn
    }

    async addMessage(message: StreamMessage<T>) {
        this.inputBuffer.push(message)
        if (!this.busy) {
            this.busy = true
            while (this.inputBuffer.length > 0) {
                const nextMessage = this.inputBuffer.shift()!
                try {
                    const processedMessage = await this.processMessageFn(nextMessage)
                    this.outputBuffer.push(processedMessage)
                } catch (e) {
                    // TODO
                    console.log(e)
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

    constructor(processMessageFn: ProcessMessageFn<T>) {
        this.processMessageFn = processMessageFn
    }

    addMessage(message: StreamMessage<T>): void {
        const id = `${message.getPublisherId()}-${message.getMsgChainId()}`
        let processor = this.processors.get(id)
        if (processor === undefined) {
            processor = new MsgChainProcessor(this.outputBuffer, this.processMessageFn)
            this.processors.set(id, processor)
        }
        processor.addMessage(message)
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage<T>> {
        return this.outputBuffer
    }
}
