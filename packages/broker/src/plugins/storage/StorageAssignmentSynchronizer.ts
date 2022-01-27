import { StreamPartID } from 'streamr-client-protocol'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

export interface Diff {
    added: StreamPartID[]
    removed: StreamPartID[]
}

export const EMPTY_DIFF: Diff = Object.freeze({
    added: [],
    removed: []
})

function setDifference<T>(setA: Set<T>, setB: Set<T>): T[] {
    return [...setA].filter((el) => !setB.has(el))
}

/**
 * Ingests both full state and partial state storage node assignment updates
 * based on which an up-to-date and synchronized outcome state is maintained.
 * Synchronization relies on block numbers of updates.
 */
export class StorageAssignmentSynchronizer {
    private lastFullState: ReadonlySet<StreamPartID> = new Set<StreamPartID>()
    private lastFullStateBlock = 0
    private computedState = new Set<StreamPartID>() // lastFullState + partial state updates applied
    private lastBlocks = new Map<StreamPartID, number>()

    /**
     * Get up-to-date view of state
     */
    getState(): ReadonlySet<StreamPartID> {
        return this.computedState
    }

    /**
     * Ingest a full state update
     * @param fullState the set of _all_ assigned stream parts at the given block
     * @param newBlock the block number of the update
     */
    ingestFullState(fullState: Set<StreamPartID>, newBlock: number): Diff {
        if (newBlock <= this.lastFullStateBlock) {
            logger.warn('ignoring full state update due to stale block: %d > %d', newBlock, this.lastFullStateBlock)
            return EMPTY_DIFF
        }

        this.lastFullState = new Set<StreamPartID>(fullState)
        this.lastFullStateBlock = newBlock

        // delete stale entries
        this.lastBlocks.forEach((block, streamPart) => {
            if (block <= newBlock) {
                this.lastBlocks.delete(streamPart)
            }
        })

        const previousComputedState = this.computedState
        this.computedState = new Set<StreamPartID>(this.lastFullState)

        // apply entries
        this.lastBlocks.forEach((_, streamPart) => {
            if (previousComputedState.has(streamPart)) {
                this.computedState.add(streamPart)
            } else {
                this.computedState.delete(streamPart)
            }
        })

        return {
            added: setDifference(this.computedState, previousComputedState),
            removed: setDifference(previousComputedState, this.computedState)
        }
    }

    /**
     * Ingest a partial state update
     * @param streamParts the stream parts for which this is an update for
     * @param operation indicates whether this is an assignment or a removal
     * @param block the block number of this update
     */
    ingestPartialState(streamParts: Set<StreamPartID>, operation: 'added' | 'removed', block: number): Diff {
        if (block <= this.lastFullStateBlock) {
            return EMPTY_DIFF
        }

        const nonStaleStreamParts = [...streamParts].filter((sp) => (
            block > (this.lastBlocks.get(sp) || 0)
        ))

        nonStaleStreamParts.forEach((sp) => {
            this.lastBlocks.set(sp, block)
        })

        if (operation === 'added') {
            return {
                removed: [],
                added: nonStaleStreamParts.filter((sp) => {
                    const didStateChange = !this.computedState.has(sp)
                    this.computedState.add(sp)
                    return didStateChange
                }),
            }
        } else {
            return {
                added: [],
                removed: nonStaleStreamParts.filter((sp) => {
                    const didStateChange = this.computedState.has(sp)
                    this.computedState.delete(sp)
                    return didStateChange
                })
            }
        }
    }
}
