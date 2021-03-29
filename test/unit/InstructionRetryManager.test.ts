import { wait } from 'streamr-test-utils'
import { TrackerLayer } from 'streamr-client-protocol'

import { InstructionRetryManager } from '../../src/logic/InstructionRetryManager'
import { Logger } from "../../src/helpers/Logger"

describe('InstructionRetryManager', () => {
    let handlerCb: any
    let instructionRetryManager: InstructionRetryManager

    beforeEach(() => {
        handlerCb = jest.fn().mockResolvedValue(true)
        instructionRetryManager = new InstructionRetryManager(new Logger([]), handlerCb, 100)
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
    it('Instructions are reattempted after an interval', async () => {
        instructionRetryManager.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-2', 2), 'tracker-2')
        instructionRetryManager.add(createInstruction('stream-3', 3), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-4', 4), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-5', 5), 'tracker-2')

        await wait(110)

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
            [createInstruction('stream-3', 3), 'tracker-1', false],
            [createInstruction('stream-4', 4), 'tracker-1', false],
            [createInstruction('stream-5', 5), 'tracker-2', false],
        ])
    })

    it('Instructions are further reattempted after an interval', async () => {
        instructionRetryManager.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-2', 2), 'tracker-2')
        instructionRetryManager.add(createInstruction('stream-3', 3), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-4', 4), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-5', 5), 'tracker-2')

        await wait(220)

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
            [createInstruction('stream-3', 3), 'tracker-1', false],
            [createInstruction('stream-4', 4), 'tracker-1', false],
            [createInstruction('stream-5', 5), 'tracker-2', false],
            [createInstruction('stream-1', 1), 'tracker-1', true],
            [createInstruction('stream-2', 2), 'tracker-2', true],
            [createInstruction('stream-3', 3), 'tracker-1', true],
            [createInstruction('stream-4', 4), 'tracker-1', true],
            [createInstruction('stream-5', 5), 'tracker-2', true],
        ])
    })
    it('Instruction reattempts are updated properly per stream', async () => {
        instructionRetryManager.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-2', 2), 'tracker-2')

        await wait(110)

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
        ])

        instructionRetryManager.add(createInstruction('stream-1', 5), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-2', 8), 'tracker-2')

        await wait(110)

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
            [createInstruction('stream-1', 5), 'tracker-1', false],
            [createInstruction('stream-2', 8), 'tracker-2', false],
        ])
    })
    it('Instructions for streams can be deleted and timeouts are cleared', async () => {
        instructionRetryManager.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-2', 2), 'tracker-2')

        await wait(110)
        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
        ])

        instructionRetryManager.removeStreamId('stream-1::0')
        await wait(110)
        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
            [createInstruction('stream-2', 2), 'tracker-2', true],
        ])
    })
    it('Instructions are no longer repeated for existing streams after reset() is called', async () => {
        instructionRetryManager.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionRetryManager.add(createInstruction('stream-2', 2), 'tracker-2')

        await wait(110)
        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
        ])
        instructionRetryManager.reset()
        await wait(220)
        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1), 'tracker-1', false],
            [createInstruction('stream-2', 2), 'tracker-2', false],
        ])
    })
})