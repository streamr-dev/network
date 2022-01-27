import {
    Diff,
    EMPTY_DIFF,
    StorageAssignmentSynchronizer
} from '../../../../src/plugins/storage/StorageAssignmentSynchronizer'
import { StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
const { parse } = StreamPartIDUtils

const SP1 = parse('s1#0')
const SP2 = parse('s2#0')
const SP3 = parse('s3#0')
const SP4 = parse('s4#0')
const SP5 = parse('s5#0')
const SP6 = parse('s6#0')
const SP7 = parse('s7#0')
const SP8 = parse('s8#0')
const SP9 = parse('s9#0')

function toSet(...args: StreamPartID[]): Set<StreamPartID> {
    return new Set<StreamPartID>([...args])
}

describe(StorageAssignmentSynchronizer, () => {
    let synchronizer: StorageAssignmentSynchronizer

    beforeEach(() => {
        synchronizer = new StorageAssignmentSynchronizer()
    })

    describe('initial empty state', () => {
        it('has expected state', () => {
            expect(synchronizer.getState()).toEqual(toSet())
        })

        it('ingesting a full state results in its streamParts being added', () => {
            const diff = synchronizer.ingestFullState(toSet(SP1, SP2, SP3), 10)
            expect(diff).toEqual({
                added: [SP1, SP2, SP3],
                removed: []
            })
        })

        it('ingesting "added" event results in its streamParts being added', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP1, SP5), 'added', 15)
            expect(diff).toEqual({
                added: [SP1, SP5],
                removed: []
            })
        })

        it('ingesting "removed" event results in empty diff', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP1, SP5), 'removed', 15)
            expect(diff).toEqual(EMPTY_DIFF)
        })
    })

    describe('full state ingested', () => {
        beforeEach(() => {
            synchronizer.ingestFullState(toSet(SP1, SP2, SP3), 10)
        })

        it('has expected state', () => {
            expect(synchronizer.getState()).toEqual(toSet(SP1, SP2, SP3))
        })

        it('ingesting a full state results in its streamParts becoming the new state', () => {
            const diff = synchronizer.ingestFullState(toSet(SP1, SP3, SP4, SP5), 15)
            expect(diff).toEqual({
                added: [SP4, SP5],
                removed: [SP2]
            })
        })

        it('ingesting a stale full state results in empty diff', () => {
            const diff = synchronizer.ingestFullState(toSet(SP1, SP3, SP4, SP5), 5)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "added" event results in its streamParts being added', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP2, SP4, SP5), 'added', 15)
            expect(diff).toEqual({
                added: [SP4, SP5],
                removed: []
            })
        })

        it('ingesting "added" event for only existing streamParts results in empty diff', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP1, SP3), 'added', 15)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting stale "added" event results in empty diff', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP2, SP4, SP5), 'added', 9)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "removed" event results in relevant streamPart being removed', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP2, SP4, SP5), 'removed', 11)
            expect(diff).toEqual({
                added: [],
                removed: [SP2]
            })
        })

        it('ingesting "removed" event for only non-relevant streamParts results in empty diff', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP5, SP6, SP7), 'removed', 11)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting stale "removed" event results in empty diff', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP1, SP3, SP5), 'removed', 5)
            expect(diff).toEqual(EMPTY_DIFF)
        })
    })

    describe('a few partial states ingested', () => {
        beforeEach(() => {
            synchronizer.ingestPartialState(toSet(SP1, SP4), 'added', 5)    // SP1,SP4      @ 5
            synchronizer.ingestPartialState(toSet(SP2), 'added', 13)        // SP2          @ 13
            synchronizer.ingestPartialState(toSet(SP3, SP5), 'removed', 10) // -SP3,-SP5    @ 10
        })

        it('ingesting a full state results in its streamParts being combined with non-stale partial updates', () => {
            const diff = synchronizer.ingestFullState(new Set<StreamPartID>([SP3, SP4, SP6]), 6)
            expect(diff).toEqual({
                added: [SP6],
                removed: [SP1]
            })
        })

        it('ingesting a full state superseding all partial updates results in it becoming the new state', () => {
            const diff = synchronizer.ingestFullState(toSet(SP3, SP4, SP8), 15)
            expect(synchronizer.getState()).toEqual(toSet(SP3, SP4, SP8))
            expect(diff).toEqual({
                added: [SP3, SP8],
                removed: [SP1, SP2]
            })
        })

        it('ingesting a stale full state results in empty diff', () => {
            const diff = synchronizer.ingestFullState(toSet(SP1, SP2, SP5), 3)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "add" event superseding a "remove" partial update results in streamPart being added', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP3), 'added', 11)
            expect(diff).toEqual({
                added: [SP3],
                removed: []
            })
        })

        it('ingesting "add" event preceding a "remove" partial update results in empty diff', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP3), 'added', 9)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "removed" event superseding "added" event results in its streamParts being removed', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP1, SP4), 'removed', 6)
            expect(diff).toEqual({
                added: [],
                removed: [SP1, SP4]
            })
        })

        it('ingesting "removed" event preceding "added" event results in empty diff', () => {
            const diff = synchronizer.ingestPartialState(toSet(SP1, SP2), 'removed', 4)
            expect(diff).toEqual(EMPTY_DIFF)
        })
    })

    it('a longer, more involved scenario', () => {
        function replay(diffs: Diff[]): Set<StreamPartID> {
            const state = new Set<StreamPartID>()
            diffs.forEach(({ added, removed }) => {
                added.forEach((sp) => state.add(sp))
                removed.forEach((sp) => state.delete(sp))
            })
            return state
        }

        const diffHistory = [
            synchronizer.ingestFullState(toSet(SP1, SP2, SP3), 3),
            synchronizer.ingestPartialState(toSet(SP1, SP5), 'added', 12),
            synchronizer.ingestPartialState(toSet(SP8), 'added', 10),
            synchronizer.ingestPartialState(toSet(SP9), 'added', 18),
            synchronizer.ingestPartialState(toSet(SP3, SP5), 'removed', 13),
            synchronizer.ingestPartialState(toSet(SP1), 'removed', 9),
            synchronizer.ingestPartialState(toSet(SP9), 'removed', 10),
            synchronizer.ingestPartialState(toSet(SP5), 'added', 10),
            synchronizer.ingestFullState(toSet(SP1, SP3, SP8, SP9), 10),
        ]

        expect(diffHistory).toEqual([
            { added: [SP1, SP2, SP3], removed: [] },
            { added: [SP5], removed: [] },
            { added: [SP8], removed: [] },
            { added: [SP9], removed: [] },
            { added: [], removed: [SP3, SP5] },
            { added: [], removed: [] },
            { added: [], removed: [] },
            { added: [], removed: [] },
            { added: [], removed: [SP2] },
        ])
        expect(synchronizer.getState()).toEqual(toSet(SP1, SP8, SP9))
        expect(synchronizer.getState()).toEqual(replay(diffHistory))

        // next round
        const diffHistory2 = [
            synchronizer.ingestPartialState(toSet(SP4, SP8), 'added', 4),
            synchronizer.ingestPartialState(toSet(SP4, SP5, SP6), 'added', 14),
            synchronizer.ingestPartialState(toSet(SP5, SP7, SP8), 'removed', 17),
            synchronizer.ingestPartialState(toSet(SP1, SP4, SP7), 'added', 13),
            synchronizer.ingestPartialState(toSet(SP2), 'added', 18),
            synchronizer.ingestPartialState(toSet(SP3), 'removed', 20),
            synchronizer.ingestFullState(toSet(SP1, SP3, SP5, SP6, SP9), 17), // tuleeko sp5 voimaan?
        ]

        expect(diffHistory2).toEqual([
            { added: [], removed: [] },
            { added: [SP4, SP5, SP6], removed: [] },
            { added: [], removed: [SP5, SP8] },
            { added: [], removed: [] },
            { added: [SP2], removed: [] },
            { added: [], removed: [] },
            { added: [SP5], removed: [SP4] },
        ])
        expect(synchronizer.getState()).toEqual(toSet(SP1, SP2, SP5, SP6, SP9))
        expect(synchronizer.getState()).toEqual(replay([...diffHistory, ...diffHistory2]))
    })
})
