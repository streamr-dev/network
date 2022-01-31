import { Logger } from 'streamr-network'

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
 *      1. Full state updates that define the set at a given time step.
 *      2. Patch updates that add or remove a subset at a given time step.
 */
export class SetMembershipSynchronizer<E extends string> {
    private lastSequenceNo = 0
    private computedState = new Set<E>() // lastState + patches
    private lastSequenceNoByElement = new Map<E, number>()

    /**
     * Get up-to-date view of state
     */
    getState(): ReadonlySet<E> {
        return this.computedState
    }

    /**
     * Ingest a full state update at a given sequence number
     * @param elements the set of _all_ elements at this sequence number
     * @param sequenceNo the sequence number for this state
     */
    ingestState(elements: Set<E>, sequenceNo: number): Diff<E> {
        if (sequenceNo <= this.lastSequenceNo) {
            logger.warn('ignoring state due to stale sequenceNo: %d > %d', sequenceNo, this.lastSequenceNo)
            return EMPTY_DIFF
        }

        this.lastSequenceNo = sequenceNo

        // delete stale entries
        this.lastSequenceNoByElement.forEach((patchSequenceNo, element) => {
            if (patchSequenceNo <= sequenceNo) {
                this.lastSequenceNoByElement.delete(element)
            }
        })

        const previousComputedState = this.computedState
        this.computedState = new Set<E>(elements)

        // apply entries
        this.lastSequenceNoByElement.forEach((_, element) => {
            if (previousComputedState.has(element)) {
                this.computedState.add(element)
            } else {
                this.computedState.delete(element)
            }
        })

        return {
            added: setDifference(this.computedState, previousComputedState),
            removed: setDifference(previousComputedState, this.computedState)
        }
    }

    /**
     * Ingest a patch update
     * @param elements the set of elements relevant to this patch
     * @param operation indicates whether this is an addition or a removal
     * @param sequenceNo the sequence number for this patch
     */
    ingestPatch(elements: Set<E>, operation: 'added' | 'removed', sequenceNo: number): Diff<E> {
        if (sequenceNo <= this.lastSequenceNo) {
            return EMPTY_DIFF
        }

        const nonStaleElements = [...elements].filter((element) => (
            sequenceNo > (this.lastSequenceNoByElement.get(element) || 0)
        ))

        nonStaleElements.forEach((element) => {
            this.lastSequenceNoByElement.set(element, sequenceNo)
        })

        if (operation === 'added') {
            return {
                removed: [],
                added: nonStaleElements.filter((element) => {
                    const didStateChange = !this.computedState.has(element)
                    this.computedState.add(element)
                    return didStateChange
                }),
            }
        } else {
            return {
                added: [],
                removed: nonStaleElements.filter((element) => {
                    const didStateChange = this.computedState.has(element)
                    this.computedState.delete(element)
                    return didStateChange
                })
            }
        }
    }
}
