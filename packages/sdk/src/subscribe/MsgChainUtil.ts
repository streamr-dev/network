import { Gate } from '@streamr/utils'
import { StreamMessage } from '../protocol/StreamMessage'
import { PushBuffer } from './../utils/PushBuffer'
import { Signal } from './../utils/Signal'

type ProcessMessageFn = (streamMessage: StreamMessage) => Promise<StreamMessage>

type OnError = Signal<[Error, StreamMessage?]> // TODO could remove the StreamMessage parameter or use it?

class MsgChainProcessor {
    readonly busy: Gate = new Gate(true)
    private readonly inputBuffer: StreamMessage[] = []
    private readonly outputBuffer: PushBuffer<StreamMessage>
    private readonly processMessageFn: ProcessMessageFn
    private readonly onError: OnError

    constructor(outputBuffer: PushBuffer<StreamMessage>, processMessageFn: ProcessMessageFn, onError: OnError) {
        this.outputBuffer = outputBuffer
        this.processMessageFn = processMessageFn
        this.onError = onError
    }

    async addMessage(message: StreamMessage): Promise<void> {
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

export class MsgChainUtil implements AsyncIterable<StreamMessage> {
    private readonly outputBuffer: PushBuffer<StreamMessage> = new PushBuffer()
    private readonly processors: Map<string, MsgChainProcessor> = new Map()
    private readonly processMessageFn: ProcessMessageFn
    private readonly onError: OnError

    constructor(processMessageFn: ProcessMessageFn, onError: OnError) {
        this.processMessageFn = processMessageFn
        this.onError = onError
    }

    addMessage(message: StreamMessage): void {
        const id = `${message.getPublisherId()}-${message.getMsgChainId()}`
        let processor = this.processors.get(id)
        if (processor === undefined) {
            processor = new MsgChainProcessor(this.outputBuffer, this.processMessageFn, this.onError)
            this.processors.set(id, processor)
        }
        processor.addMessage(message) // add a task, but don't wait for it to complete
    }

    async flush(): Promise<void> {
        await Promise.all(Array.from(this.processors.values()).map((p) => p.busy.waitUntilOpen()))
    }

    stop(err?: Error): void {
        this.outputBuffer.endWrite(err)
    }

    [Symbol.asyncIterator](): AsyncIterator<StreamMessage> {
        return this.outputBuffer
    }
}
