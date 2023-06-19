import { StreamID } from '@streamr/protocol'
import EventEmitter3 from 'eventemitter3'
import { MaintainTopologyHelperEvents } from './MaintainTopologyHelper'

export class FakeOperatorClient extends EventEmitter3<MaintainTopologyHelperEvents> {
    private readonly initialState: Set<StreamID>
    private readonly initialBlockNumber: number

    constructor(initialState: StreamID[], initialBlockNumber: number) {
        super()
        this.initialState = new Set(initialState)
        this.initialBlockNumber = initialBlockNumber
    }
    async start(): Promise<void> {
        this.emit('addStakedStream', Array.from(this.initialState))
    }

    async stop(): Promise<void> {
        this.removeAllListeners('addStakedStream')
        this.removeAllListeners('removeStakedStream')
    }

    // Used to fake smart contract events
    addStreamToState(streamId: StreamID): void {
        this.emit('addStakedStream', [streamId])
    }

    // Used to fake smart contract events
    removeStreamFromState(streamId: StreamID): void {
        this.emit('removeStakedStream', streamId)
    }

}
