import { StreamMessage } from 'streamr-client-protocol'
import { ErrorSignal } from '../utils/Signal'
import Gate from '../utils/Gate'
import { PushBuffer } from '../utils/PushBuffer'

type ProcessMessageFn<T> = (streamMessage: StreamMessage<T>) => Promise<StreamMessage<T>>

type OnError = ErrorSignal<[Error]>

class MsgChainProcessor<T> {

    busy: Gate = new Gate()
    private inputBuffer: StreamMessage<T>[] = []
    private outputBuffer: PushBuffer<StreamMessage<T>>
    private processMessageFn: ProcessMessageFn<T>
    private onError: OnError

    constructor(outputBuffer: PushBuffer<StreamMessage<T>>, processMessageFn: ProcessMessageFn<T>, onError: OnError) {
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

    private outputBuffer: PushBuffer<StreamMessage<T>> = new PushBuffer()
    private processors: Map<string,MsgChainProcessor<T>> = new Map()
    private processMessageFn: ProcessMessageFn<T>
    private onError: OnError

    constructor(processMessageFn: ProcessMessageFn<T>, onError: OnError) {
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

    stop(): void {
        this.outputBuffer.endWrite()
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage<T>> {
        return this.outputBuffer
    }
}
