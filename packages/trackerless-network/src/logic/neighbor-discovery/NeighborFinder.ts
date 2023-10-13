import { setAbortableTimeout } from '@streamr/utils'
import { NodeList } from '../NodeList'
import { NodeID } from '../../identifiers'

interface FindNeighborsSessionConfig {
    targetNeighbors: NodeList
    nearbyNodeView: NodeList
    doFindNeighbors: (excludedNodes: NodeID[]) => Promise<NodeID[]>
    minCount: number
}

const INITIAL_WAIT = 100
const INTERVAL = 250

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
        if (this.config.targetNeighbors.size() < this.config.minCount && newExcludes.length < this.config.nearbyNodeView.size()) {
            setAbortableTimeout(() => this.findNeighbors(newExcludes), INTERVAL, this.abortController.signal)
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
