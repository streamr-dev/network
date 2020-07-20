const { waitForCondition } = require('streamr-test-utils')

const InstructionMessage = require('../../src/messages/InstructionMessage')
const InstructionThrottler = require('../../src/logic/InstructionThrottler')

describe('InstructionThrottler', () => {
    let handlerCb
    let instructionThrottler

    beforeEach(() => {
        handlerCb = jest.fn().mockResolvedValue(true)
        instructionThrottler = new InstructionThrottler(handlerCb)
    })

    function createInstruction(streamId, counter) {
        return new InstructionMessage(streamId, [], counter)
    }

    it('all instructions are handled when inserting a burst of them with distinct streams', async () => {
        instructionThrottler.add(createInstruction('stream-1', 1))
        instructionThrottler.add(createInstruction('stream-2', 2))
        instructionThrottler.add(createInstruction('stream-3', 3))
        instructionThrottler.add(createInstruction('stream-4', 4))
        instructionThrottler.add(createInstruction('stream-5', 5))

        await waitForCondition(() => instructionThrottler.isIdle())

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1)],
            [createInstruction('stream-2', 2)],
            [createInstruction('stream-3', 3)],
            [createInstruction('stream-4', 4)],
            [createInstruction('stream-5', 5)],
        ])
    })

    it('first and last instructions handled when inserting a burst of them with identical keys (throttle)', async () => {
        instructionThrottler.add(createInstruction('stream-1', 1))
        instructionThrottler.add(createInstruction('stream-1', 2))
        instructionThrottler.add(createInstruction('stream-1', 3))
        instructionThrottler.add(createInstruction('stream-1', 4))
        instructionThrottler.add(createInstruction('stream-1', 5))

        await waitForCondition(() => instructionThrottler.isIdle())

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1)],
            [createInstruction('stream-1', 5)]
        ])
    })

    it('all instructions are handled when inserting them slowly with identical keys (no throttle)', async () => {
        instructionThrottler.add(createInstruction('stream-1', 1))
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 2))
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 3))
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 4))
        await waitForCondition(() => instructionThrottler.isIdle())
        instructionThrottler.add(createInstruction('stream-1', 5))

        await waitForCondition(() => instructionThrottler.isIdle())

        expect(handlerCb.mock.calls).toEqual([
            [createInstruction('stream-1', 1)],
            [createInstruction('stream-1', 2)],
            [createInstruction('stream-1', 3)],
            [createInstruction('stream-1', 4)],
            [createInstruction('stream-1', 5)],
        ])
    })

    it('max one handlerCb is awaited for at a time', async () => {
        const events = []
        handlerCb.mockReset().mockImplementation(() => {
            events.push('in')
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    resolve(true)
                    events.push('out')
                }, 20)
            })
        })

        instructionThrottler.add(createInstruction('stream-1', 1))
        instructionThrottler.add(createInstruction('stream-2', 2))
        instructionThrottler.add(createInstruction('stream-3', 3))
        instructionThrottler.add(createInstruction('stream-4', 4))
        instructionThrottler.add(createInstruction('stream-5', 5))

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
