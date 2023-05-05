import { StreamID } from '@streamr/protocol'
import EventEmitter3 from 'eventemitter3'

interface OperatorClientEvents {
    addStakedStream: (streamId: string, blockNumber: number) => void
    removeStakedStream: (streamId: string, blockNumber: number) => void
}

export abstract class OperatorClient extends EventEmitter3<OperatorClientEvents> {
    abstract getStakedStreams(): Promise<{ streamIds: Set<string>, blockNumber: number }>

    close(): void {
        this.removeAllListeners('addStakedStream')
        this.removeAllListeners('removeStakedStream')
    }
}

export class FakeOperatorClient extends OperatorClient {
    private readonly initialState: Set<StreamID>
    private readonly initialBlockNumber: number

    constructor(initialState: StreamID[], initialBlockNumber: number) {
        super()
        this.initialState = new Set(initialState)
        this.initialBlockNumber = initialBlockNumber
    }
    getStakedStreams(): Promise<{ streamIds: Set<StreamID>, blockNumber: number }> {
        return Promise.resolve({
            streamIds: new Set(this.initialState),
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

}
