import { waitForCondition } from 'streamr-test-utils'
import { TrackerLayer } from 'streamr-client-protocol'

import { InstructionThrottler } from '../../src/logic/InstructionThrottler'
import { Logger } from "../../src/helpers/Logger"

describe('InstructionThrottler', () => {
    let handlerCb: any
    let instructionThrottler: InstructionThrottler

    beforeEach(() => {
        handlerCb = jest.fn().mockResolvedValue(true)
        instructionThrottler = new InstructionThrottler(new Logger([]), handlerCb)
    })

    function createInstruction(streamId: string, counter: number) {
        return new TrackerLayer.InstructionMessage({
            requestId: 'requestId',
            streamId,
            streamPartition: 0,
            nodeIds: [],
            counter
        })
    }

    it('all instructions are handled when inserting a burst of them with distinct streams', async () => {
        instructionThrottler.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-2', 2), 'tracker-2')
        instructionThrottler.add(createInstruction('stream-3', 3), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-4', 4), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-5', 5), 'tracker-2')

        await waitForCondition(() => instructionThrottler.isIdle())

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1'],
            [createInstruction('stream-2', 2), 'tracker-2'],
            [createInstruction('stream-3', 3), 'tracker-1'],
            [createInstruction('stream-4', 4), 'tracker-1'],
            [createInstruction('stream-5', 5), 'tracker-2'],
        ])
    })

    it('first and last instructions handled when inserting a burst of them with identical keys (throttle)', async () => {
        instructionThrottler.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-1', 2), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-1', 3), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-1', 4), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-1', 5), 'tracker-1')

        await waitForCondition(() => instructionThrottler.isIdle())

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1'],
            [createInstruction('stream-1', 5), 'tracker-1']
        ])
    })

    it('all instructions are handled when inserting them slowly with identical keys (no throttle)', async () => {
        instructionThrottler.add(createInstruction('stream-1', 1), 'tracker-1')
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 2), 'tracker-1')
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 3), 'tracker-1')
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 4), 'tracker-1')
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 5), 'tracker-1')

        await waitForCondition(() => instructionThrottler.isIdle())

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1'],
            [createInstruction('stream-1', 2), 'tracker-1'],
            [createInstruction('stream-1', 3), 'tracker-1'],
            [createInstruction('stream-1', 4), 'tracker-1'],
            [createInstruction('stream-1', 5), 'tracker-1'],
        ])
    })
})
