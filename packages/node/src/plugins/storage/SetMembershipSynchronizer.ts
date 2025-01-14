import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export interface Diff<E extends string> {
    added: E[]
    removed: E[]
}

export const EMPTY_DIFF: Diff<never> = Object.freeze({
    added: [],
    removed: []
})

function setDifference<E>(setA: Set<E>, setB: Set<E>): E[] {
    return [...setA].filter((el) => !setB.has(el))
}

/**
 * Represents a set that evolves over (discrete) time. The set is updated in
 * two distinct ways:
 *      1. Snapshots that define the set at a given time step.
 *      2. Patches that add or remove a subset at a given time step.
 */
export class SetMembershipSynchronizer<E extends string> {
    private lastSnapshotSequenceNo = 0
    private state = new Set<E>() // snapshot + patches
    private lastSequenceNoByElement = new Map<E, number>()

    /**
     * Get up-to-date view of state
     */
    getState(): ReadonlySet<E> {
        return this.state
    }

    /**
     * Ingest a snapshot at a given sequence number
     * @param elements the set of _all_ elements in this snapshot
     * @param sequenceNo the sequence number for this snapshot
     */
    ingestSnapshot(elements: Set<E>, sequenceNo: number): Diff<E> {
        if (sequenceNo <= this.lastSnapshotSequenceNo) {
            logger.warn('Ignore snapshot (stale sequenceNo)', {
                sequenceNo,
                lastSnapshotSequenceNo: this.lastSnapshotSequenceNo
            })
            return EMPTY_DIFF
        }

        this.lastSnapshotSequenceNo = sequenceNo

        // delete stale patches
        this.lastSequenceNoByElement.forEach((patchSequenceNo, element) => {
            if (patchSequenceNo <= sequenceNo) {
                this.lastSequenceNoByElement.delete(element)
            }
        })

        // apply patches
        const previousState = this.state
        this.state = new Set<E>(elements)
        this.lastSequenceNoByElement.forEach((_, element) => {
            if (previousState.has(element)) {
                this.state.add(element)
            } else {
                this.state.delete(element)
            }
        })

        return {
            added: setDifference(this.state, previousState),
            removed: setDifference(previousState, this.state)
        }
    }

    /**
     * Ingest a patch
     * @param elements the set of elements relevant to this patch
     * @param operation indicates whether this is an addition or a removal
     * @param sequenceNo the sequence number for this patch
     */
    ingestPatch(elements: Set<E>, operation: 'added' | 'removed', sequenceNo: number): Diff<E> {
        if (sequenceNo <= this.lastSnapshotSequenceNo) {
            return EMPTY_DIFF
        }

        const nonStaleElements = [...elements].filter(
            (element) => sequenceNo > (this.lastSequenceNoByElement.get(element) ?? 0)
        )

        nonStaleElements.forEach((element) => {
            this.lastSequenceNoByElement.set(element, sequenceNo)
        })

        if (operation === 'added') {
            return {
                removed: [],
                added: nonStaleElements.filter((element) => {
                    const didStateChange = !this.state.has(element)
                    this.state.add(element)
                    return didStateChange
                })
            }
        } else {
            return {
                added: [],
                removed: nonStaleElements.filter((element) => {
                    const didStateChange = this.state.has(element)
                    this.state.delete(element)
                    return didStateChange
                })
            }
        }
    }
}
