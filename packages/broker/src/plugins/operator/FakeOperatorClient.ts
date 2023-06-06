import { StreamID } from '@streamr/protocol'
import EventEmitter3 from 'eventemitter3'
import { OperatorClient } from '@streamr/operator-client'

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
    getStakedStreams(): Promise<{ streamIds: string[], blockNumber: number }> {
        return Promise.resolve({
            streamIds: [...this.initialState],
            blockNumber: this.initialBlockNumber
        })
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
