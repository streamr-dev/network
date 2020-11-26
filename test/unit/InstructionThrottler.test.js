const { waitForCondition } = require('streamr-test-utils')
const { TrackerLayer } = require('streamr-client-protocol')

const InstructionThrottler = require('../../src/logic/InstructionThrottler')

describe('InstructionThrottler', () => {
    let handlerCb
    let instructionThrottler

    beforeEach(() => {
        handlerCb = jest.fn().mockResolvedValue(true)
        instructionThrottler = new InstructionThrottler(handlerCb)
    })

    function createInstruction(streamId, counter) {
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

    it('max one handlerCb is awaited for at a time', async () => {
        const events = []
        handlerCb.mockReset().mockImplementation(() => {
            events.push('in')
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(true)
                    events.push('out')
                }, 20)
            })
        })

        instructionThrottler.add(createInstruction('stream-1', 1), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-2', 2), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-3', 3), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-4', 4), 'tracker-1')
        instructionThrottler.add(createInstruction('stream-5', 5), 'tracker-1')

        await waitForCondition(() => !instructionThrottler.handling)

        expect(events).toEqual([
            'in', 'out',
            'in', 'out',
            'in', 'out',
            'in', 'out',
            'in', 'out',
        ])
    })
})
