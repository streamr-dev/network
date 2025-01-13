import { StreamPartID, StreamPartIDUtils } from '@streamr/utils'
import { Diff, EMPTY_DIFF, SetMembershipSynchronizer } from '../../../../src/plugins/storage/SetMembershipSynchronizer'
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

describe(SetMembershipSynchronizer, () => {
    let synchronizer: SetMembershipSynchronizer<StreamPartID>

    beforeEach(() => {
        synchronizer = new SetMembershipSynchronizer()
    })

    describe('initial empty state', () => {
        it('has expected state', () => {
            expect(synchronizer.getState()).toEqual(toSet())
        })

        it('ingesting a snapshot results in its elements being added', () => {
            const diff = synchronizer.ingestSnapshot(toSet(SP1, SP2, SP3), 10)
            expect(diff).toEqual({
                added: [SP1, SP2, SP3],
                removed: []
            })
        })

        it('ingesting "added" patch results in its elements being added', () => {
            const diff = synchronizer.ingestPatch(toSet(SP1, SP5), 'added', 15)
            expect(diff).toEqual({
                added: [SP1, SP5],
                removed: []
            })
        })

        it('ingesting "removed" patch results in empty diff', () => {
            const diff = synchronizer.ingestPatch(toSet(SP1, SP5), 'removed', 15)
            expect(diff).toEqual(EMPTY_DIFF)
        })
    })

    describe('one snapshot ingested', () => {
        beforeEach(() => {
            synchronizer.ingestSnapshot(toSet(SP1, SP2, SP3), 10)
        })

        it('has expected snapshot', () => {
            expect(synchronizer.getState()).toEqual(toSet(SP1, SP2, SP3))
        })

        it('ingesting a snapshot results in its elements becoming the new state', () => {
            const diff = synchronizer.ingestSnapshot(toSet(SP1, SP3, SP4, SP5), 15)
            expect(diff).toEqual({
                added: [SP4, SP5],
                removed: [SP2]
            })
        })

        it('ingesting a snapshot update results in empty diff', () => {
            const diff = synchronizer.ingestSnapshot(toSet(SP1, SP3, SP4, SP5), 5)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "added" patch results in its elements being added', () => {
            const diff = synchronizer.ingestPatch(toSet(SP2, SP4, SP5), 'added', 15)
            expect(diff).toEqual({
                added: [SP4, SP5],
                removed: []
            })
        })

        it('ingesting "added" patch for only existing elements results in empty diff', () => {
            const diff = synchronizer.ingestPatch(toSet(SP1, SP3), 'added', 15)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting stale "added" patch results in empty diff', () => {
            const diff = synchronizer.ingestPatch(toSet(SP2, SP4, SP5), 'added', 9)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "removed" patch results in relevant elements being removed', () => {
            const diff = synchronizer.ingestPatch(toSet(SP2, SP4, SP5), 'removed', 11)
            expect(diff).toEqual({
                added: [],
                removed: [SP2]
            })
        })

        it('ingesting "removed" patch for only non-relevant elements results in empty diff', () => {
            const diff = synchronizer.ingestPatch(toSet(SP5, SP6, SP7), 'removed', 11)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting stale "removed" patch results in empty diff', () => {
            const diff = synchronizer.ingestPatch(toSet(SP1, SP3, SP5), 'removed', 5)
            expect(diff).toEqual(EMPTY_DIFF)
        })
    })

    describe('a few patches ingested', () => {
        beforeEach(() => {
            synchronizer.ingestPatch(toSet(SP1, SP4), 'added', 5)
            synchronizer.ingestPatch(toSet(SP2), 'added', 13)
            synchronizer.ingestPatch(toSet(SP3, SP5), 'removed', 10)
        })

        it('ingesting a snapshot results in its elements being combined with non-stale patches', () => {
            const diff = synchronizer.ingestSnapshot(new Set<StreamPartID>([SP3, SP4, SP6]), 6)
            expect(diff).toEqual({
                added: [SP6],
                removed: [SP1]
            })
        })

        it('ingesting a snapshot superseding all patches results in it becoming the new state', () => {
            const diff = synchronizer.ingestSnapshot(toSet(SP3, SP4, SP8), 15)
            expect(synchronizer.getState()).toEqual(toSet(SP3, SP4, SP8))
            expect(diff).toEqual({
                added: [SP3, SP8],
                removed: [SP1, SP2]
            })
        })

        it('ingesting a stale snapshot results in empty diff', () => {
            const diff = synchronizer.ingestSnapshot(toSet(SP1, SP2, SP5), 3)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "add" patch superseding a "remove" patch results in elements being added', () => {
            const diff = synchronizer.ingestPatch(toSet(SP3), 'added', 11)
            expect(diff).toEqual({
                added: [SP3],
                removed: []
            })
        })

        it('ingesting "add" patch preceding a "remove" patch results in empty diff', () => {
            const diff = synchronizer.ingestPatch(toSet(SP3), 'added', 9)
            expect(diff).toEqual(EMPTY_DIFF)
        })

        it('ingesting "removed" patch superseding a "added" patch results in elements being removed', () => {
            const diff = synchronizer.ingestPatch(toSet(SP1, SP4), 'removed', 6)
            expect(diff).toEqual({
                added: [],
                removed: [SP1, SP4]
            })
        })

        it('ingesting "removed" patch preceding a "added" patch results in empty diff', () => {
            const diff = synchronizer.ingestPatch(toSet(SP1, SP2), 'removed', 4)
            expect(diff).toEqual(EMPTY_DIFF)
        })
    })

    it('a longer, more involved scenario', () => {
        function replay(diffs: Diff<StreamPartID>[]): Set<StreamPartID> {
            const state = new Set<StreamPartID>()
            diffs.forEach(({ added, removed }) => {
                added.forEach((sp) => state.add(sp))
                removed.forEach((sp) => state.delete(sp))
            })
            return state
        }

        const diffHistory = [
            synchronizer.ingestSnapshot(toSet(SP1, SP2, SP3), 3),
            synchronizer.ingestPatch(toSet(SP1, SP5), 'added', 12),
            synchronizer.ingestPatch(toSet(SP8), 'added', 10),
            synchronizer.ingestPatch(toSet(SP9), 'added', 18),
            synchronizer.ingestPatch(toSet(SP3, SP5), 'removed', 13),
            synchronizer.ingestPatch(toSet(SP1), 'removed', 9),
            synchronizer.ingestPatch(toSet(SP9), 'removed', 10),
            synchronizer.ingestPatch(toSet(SP5), 'added', 10),
            synchronizer.ingestSnapshot(toSet(SP1, SP3, SP8, SP9), 10)
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
            { added: [], removed: [SP2] }
        ])
        expect(synchronizer.getState()).toEqual(toSet(SP1, SP8, SP9))
        expect(synchronizer.getState()).toEqual(replay(diffHistory))

        // next round
        const diffHistory2 = [
            synchronizer.ingestPatch(toSet(SP4, SP8), 'added', 4),
            synchronizer.ingestPatch(toSet(SP4, SP5, SP6), 'added', 14),
            synchronizer.ingestPatch(toSet(SP5, SP7, SP8), 'removed', 17),
            synchronizer.ingestPatch(toSet(SP1, SP4, SP7), 'added', 13),
            synchronizer.ingestPatch(toSet(SP2), 'added', 18),
            synchronizer.ingestPatch(toSet(SP3), 'removed', 20),
            synchronizer.ingestSnapshot(toSet(SP1, SP3, SP5, SP6, SP9), 17)
        ]

        expect(diffHistory2).toEqual([
            { added: [], removed: [] },
            { added: [SP4, SP5, SP6], removed: [] },
            { added: [], removed: [SP5, SP8] },
            { added: [], removed: [] },
            { added: [SP2], removed: [] },
            { added: [], removed: [] },
            { added: [SP5], removed: [SP4] }
        ])
        expect(synchronizer.getState()).toEqual(toSet(SP1, SP2, SP5, SP6, SP9))
        expect(synchronizer.getState()).toEqual(replay([...diffHistory, ...diffHistory2]))
    })
})
