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
    private readonly state = new Set<StreamID>()

    constructor(initialState: StreamID[]) {
        super()
        this.state = new Set(initialState)
    }
    getStakedStreams(): Promise<{ streamIds: Set<StreamID>, blockNumber: number }> {
        return Promise.resolve({
            streamIds: new Set(this.state),
            blockNumber: -1 // TODO
        })
    }

    // Used to fake smart contract events
    addStreamToState(streamId: StreamID): void {
        this.state.add(streamId)
        this.emit('addStakedStream', streamId, -1)
    }

    // Used to fake smart contract events
    removeStreamFromState(streamId: StreamID): void {
        this.state.delete(streamId)
        this.emit('removeStakedStream', streamId, -1)
    }

}
