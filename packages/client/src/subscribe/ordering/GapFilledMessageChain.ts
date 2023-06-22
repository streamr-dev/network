import { StreamMessage, StreamPartID } from '@streamr/protocol'
import { EthereumAddress, Logger, wait } from '@streamr/utils'
import sample from 'lodash/sample'
import { Gap, OrderedMessageChain } from './OrderedMessageChain'

const logger = new Logger(module)

interface GapFilledMessageChainOptions {
    streamPartId: StreamPartID
    resend: (gap: Gap, storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) => AsyncGenerator<StreamMessage>
    getStorageNodeAddresses: () => Promise<EthereumAddress[]>
    initialWaitTime: number
    retryWaitTime: number
    maxRequestsPerGap: number
}

const runAbortableTask = async (
    run: () => Promise<void>
): Promise<void> => {
    try {
        await run()
    } catch (e) {
        if (e.code !== 'AbortError') {
            throw e
        }
    }
}

export class GapFilledMessageChain extends OrderedMessageChain {

    private currentTask: { gap: Gap, abortController: AbortController } | undefined = undefined
    private readonly resend: (gap: Gap, storageNodeAddress: EthereumAddress, abortSignal: AbortSignal) => AsyncGenerator<StreamMessage>
    private readonly getStorageNodeAddresses: () => Promise<EthereumAddress[]>
    private readonly initialWaitTime: number
    private readonly retryWaitTime: number
    private readonly maxRequestsPerGap: number

    constructor(opts: GapFilledMessageChainOptions) {
        super(opts.streamPartId)
        this.resend = opts.resend
        this.getStorageNodeAddresses = opts.getStorageNodeAddresses
        this.initialWaitTime = opts.initialWaitTime
        this.retryWaitTime = opts.retryWaitTime
        this.maxRequestsPerGap = opts.maxRequestsPerGap
        this.on('gapFound', (gap: Gap) => this.onGapFound(gap))
        this.on('gapResolved', () => this.onGapResolved())
    }

    private async onGapFound(gap: Gap) {
        const abortController = new AbortController()
        this.currentTask = {
            gap,
            abortController
        }
        try {
            await runAbortableTask(async () => {
                await wait(this.initialWaitTime, abortController.signal)
                if (this.maxRequestsPerGap > 0) {
                    await this.fetchFromStorageNode(gap, abortController.signal)
                }
                /*
                 * The "fetchFromStorageNode" typically provides all the missing messages and the chain emits the
                 * "gapResolved" event. In that case "chain.once('gapResolved')" callback aborts this task 
                 * before we reach this line. Alternatively the callback may have been called by the chain because
                 * it received the missing messages from another source (i.e. the real-time pipeline). But if
                 * this task has not been aborted by either of these reasons, we resolve the gap manually as we
                 * don't try to fill it anymore.
                 */
                this.resolveMessages(gap.to.getMessageRef())
            })
        } catch (err: any) {
            this.onError(err, gap)
        }
    }

    private onGapResolved() {
        if (this.currentTask !== undefined) {
            this.currentTask.abortController.abort()
            this.currentTask = undefined
        }
    }

    private async fetchFromStorageNode(gap: Gap, abortSignal: AbortSignal) {
        const addresses = await this.getStorageNodeAddresses()
        if (addresses.length > 0) {
            for (let i = 0; i < this.maxRequestsPerGap; i++) {
                try {
                    await runAbortableTask(async () => {
                        const msgs = this.resend(gap, sample(addresses)!, abortSignal)
                        for await (const msg of msgs) {
                            this.addMessage(msg)
                        }
                    })
                } catch (err) {
                    this.onError(err, gap)
                }
                if (i !== this.maxRequestsPerGap - 1) {
                    await wait(this.retryWaitTime, abortSignal)
                }
            }
        }
    }

    override destroy(): void {
        super.destroy()
        if (this.currentTask !== undefined) {
            this.currentTask.abortController.abort()
        }
    }

    private onError(error: any, gap: Gap): void {
        logger.debug('Unable to fill gap', {
            error: {
                message: error?.message,
                code: error?.code,
            },
            streamPartId: this.streamPartId,
            from: gap.from.getMessageRef(),
            to: gap.to.getMessageRef()
        })
    }
}
