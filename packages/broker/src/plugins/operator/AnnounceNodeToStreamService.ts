import { EthereumAddress, setAbortableInterval } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'
import { announceNodeToStream } from './announceNodeToStream'

export const DEFAULT_INTERVAL_IN_MS = 1000 * 10

export class AnnounceNodeToStreamService {
    private readonly abortController = new AbortController()
    private readonly streamrClient: StreamrClient
    private readonly operatorContractAddress: EthereumAddress
    private readonly intervalInMs: number

    constructor(
        streamrClient: StreamrClient,
        operatorContractAddress: EthereumAddress,
        intervalInMs = DEFAULT_INTERVAL_IN_MS
    ) {
        this.streamrClient = streamrClient
        this.operatorContractAddress = operatorContractAddress
        this.intervalInMs = intervalInMs
    }

    async start(): Promise<void> {
        setAbortableInterval(() => {
            (async () => {
                await announceNodeToStream(this.operatorContractAddress, this.streamrClient)
            })()
        }, this.intervalInMs, this.abortController.signal)
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
