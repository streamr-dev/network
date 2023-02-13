import { setAbortableTimeout } from '@streamr/utils'
import { PeerList } from './PeerList'
import { Handshaker } from './Handshaker'

interface FindNeighborsSessionConfig {
    targetNeighbors: PeerList
    nearbyContactPool: PeerList
    handshaker: Handshaker
    N: number
}

const INITIAL_TIMEOUT = 100
const INTERVAL_TIMEOUT = 250

export class NeighborFinder {
    private readonly abortController: AbortController
    private readonly config: FindNeighborsSessionConfig
    private running = false

    constructor(config: FindNeighborsSessionConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    private async findNeighbors(excluded: string[]): Promise<void> {
        if (!this.running) {
            return
        }
        const newExcludes = await this.config.handshaker.attemptHandshakesOnContacts(excluded)
        if (this.config.targetNeighbors!.size() < this.config.N && newExcludes.length < this.config.nearbyContactPool!.size()) {
            setAbortableTimeout(() => this.findNeighbors(newExcludes), INTERVAL_TIMEOUT, this.abortController.signal)
        } else {
            this.running = false
        }
    }

    start(excluded: string[] = []): void {
        if (this.running) {
            return
        }
        this.running = true
        setAbortableTimeout(() => this.findNeighbors(excluded), INITIAL_TIMEOUT, this.abortController.signal)
    }

    stop(): void {
        if (!this.running) {
            return
        }
        this.running = false
        this.abortController.abort()
    }
}
