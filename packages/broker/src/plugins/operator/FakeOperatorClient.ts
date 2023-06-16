import { StreamID } from '@streamr/protocol'
import EventEmitter3 from 'eventemitter3'

interface OperatorClientEvents {
    addStakedStream: (streamId: string, blockNumber: number) => void
    removeStakedStream: (streamId: string, blockNumber: number) => void
}

export class FakeOperatorClient extends EventEmitter3<OperatorClientEvents> {
    private readonly initialState: Set<StreamID>
    private readonly initialBlockNumber: number

    constructor(initialState: StreamID[], initialBlockNumber: number) {
        super()
        this.initialState = new Set(initialState)
        this.initialBlockNumber = initialBlockNumber
    }

    // eslint-disable-next-line class-methods-use-this
    start(): Promise<void> {
        return Promise.resolve()
    }

    getStakedStreams(): Promise<string[]> {
        return Promise.resolve([...this.initialState])
    }

    // Used to fake smart contract events
    addStreamToState(streamId: StreamID, blockNumber: number): void {
        this.emit('addStakedStream', streamId, blockNumber)
    }

    // Used to fake smart contract events
    removeStreamFromState(streamId: StreamID, blockNumber: number): void {
        this.emit('removeStakedStream', streamId, blockNumber)
    }

    close(): void {
        this.removeAllListeners('addStakedStream')
        this.removeAllListeners('removeStakedStream')
    }

}
