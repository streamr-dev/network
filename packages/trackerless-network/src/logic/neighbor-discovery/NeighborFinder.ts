import { setAbortableTimeout } from '@streamr/utils'
import { NodeList } from '../NodeList'
import { NodeID } from '../../identifiers'

interface FindNeighborsSessionConfig {
    targetNeighbors: NodeList
    nearbyContactPool: NodeList
    doFindNeighbors: (excludedNodes: NodeID[]) => Promise<NodeID[]>
    N: number
}

const INITIAL_TIMEOUT = 100
const INTERVAL_TIMEOUT = 250

export interface INeighborFinder {
    start(excluded?: NodeID[]): void
    stop(): void
    isRunning(): boolean
}

export class NeighborFinder implements INeighborFinder {
    private readonly abortController: AbortController
    private readonly config: FindNeighborsSessionConfig
    private running = false

    constructor(config: FindNeighborsSessionConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    private async findNeighbors(excluded: NodeID[]): Promise<void> {
        if (!this.running) {
            return
        }
        const newExcludes = await this.config.doFindNeighbors(excluded)
        if (this.config.targetNeighbors.size() < this.config.N && newExcludes.length < this.config.nearbyContactPool.size()) {
            setAbortableTimeout(() => this.findNeighbors(newExcludes), INTERVAL_TIMEOUT, this.abortController.signal)
        } else {
            this.running = false
        }
    }

    isRunning(): boolean {
        return this.running
    }

    start(excluded: NodeID[] = []): void {
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
