import { setAbortableTimeout } from '@streamr/utils'
import { NodeList } from '../NodeList'
import { DhtAddress } from '@streamr/dht'

interface FindNeighborsSessionConfig {
    neighbors: NodeList
    nearbyNodeView: NodeList
    leftNodeView: NodeList
    rightNodeView: NodeList
    randomNodeView: NodeList
    doFindNeighbors: (excludedNodes: DhtAddress[]) => Promise<DhtAddress[]>
    minCount: number
}

const INITIAL_WAIT = 100
const INTERVAL = 250

export class NeighborFinder {
    private readonly abortController: AbortController
    private readonly config: FindNeighborsSessionConfig
    private running = false

    constructor(config: FindNeighborsSessionConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    private async findNeighbors(excluded: DhtAddress[]): Promise<void> {
        if (!this.running) {
            return
        }
        const newExcludes = await this.config.doFindNeighbors(excluded)
        const uniqueContactCount = new Set([
            ...this.config.nearbyNodeView.getIds(),
            ...this.config.leftNodeView.getIds(),
            ...this.config.rightNodeView.getIds(),
            ...this.config.randomNodeView.getIds()
        ]).size
        if (this.config.neighbors.size() < this.config.minCount && newExcludes.length < uniqueContactCount) {
            // TODO should we catch possible promise rejection?
            setAbortableTimeout(() => this.findNeighbors(newExcludes), INTERVAL, this.abortController.signal)
        } else {
            this.running = false
        }
    }

    isRunning(): boolean {
        return this.running
    }

    start(excluded: DhtAddress[] = []): void {
        if (this.running) {
            return
        }
        this.running = true
        // TODO should we catch possible promise rejection?
        setAbortableTimeout(() => this.findNeighbors(excluded), INITIAL_WAIT, this.abortController.signal)
    }

    stop(): void {
        if (!this.running) {
            return
        }
        this.running = false
        this.abortController.abort()
    }
}
