import { Instruction, InstructionSender } from '../../src/logic/InstructionSender'
import { StreamKey } from '../../src/identifiers'

const MOCK_STREAM_1 = 'stream-id::1'
const MOCK_STREAM_2 = 'stream-id::2'
const STARTUP_TIME = 1234567890

const DEBOUNCE_WAIT = 100
const MAX_WAIT = 2000

let mockInstructionIdSuffix = 0

const createMockInstruction = (streamKey: StreamKey) => {
    mockInstructionIdSuffix++
    return {
        nodeId: `mock-node-id-${mockInstructionIdSuffix}`,
        streamKey
    } as any
}

const assertEqualInstructions = (
    callArgs: [buffer: { getInstructions: () => IterableIterator<Instruction>}],
    expected: Instruction[]
) => {
    const actual = Array.from(callArgs[0].getInstructions())
    expect(actual).toEqual(expected)
}

describe('InstructionSender', () => {
    let sender: any
    let send: any

    beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(STARTUP_TIME)
        sender = new InstructionSender({
            debounceWait: DEBOUNCE_WAIT,
            maxWait: MAX_WAIT
        }, undefined as any, undefined as any) as any
        send = jest.spyOn(sender, 'sendInstructions').mockResolvedValue(undefined) as any
    })

    afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
    })

    it('wait stabilization', () => {
        const instruction = createMockInstruction(MOCK_STREAM_1)
        sender.addInstruction(instruction)
        expect(send).not.toBeCalled()
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        expect(send).toBeCalledTimes(1)
        assertEqualInstructions(send.mock.calls[0], [ instruction ])
    })

    it('add within stabilization wait', () => {
        const instruction1 = createMockInstruction(MOCK_STREAM_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        const instruction2 = createMockInstruction(MOCK_STREAM_1)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        expect(send).toBeCalledTimes(1)
        assertEqualInstructions(send.mock.calls[0], [ instruction1, instruction2 ])
    })

    it('add after stabilization wait', () => {
        const instruction1 = createMockInstruction(MOCK_STREAM_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        const instruction2 = createMockInstruction(MOCK_STREAM_1)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        expect(send).toBeCalledTimes(2)
        assertEqualInstructions(send.mock.calls[1], [ instruction2 ])
    })

    it('max wait reached', () => {
        const expected: Instruction[] = []
        while ((Date.now() - STARTUP_TIME) < MAX_WAIT) {
            const instruction = createMockInstruction(MOCK_STREAM_1)
            sender.addInstruction(instruction)
            expected.push(instruction)
            jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        }
        expect(send).toBeCalledTimes(1)
        assertEqualInstructions(send.mock.calls[0], expected)
    })

    it('independent stream buffers', () => {
        const instruction1 = createMockInstruction(MOCK_STREAM_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        const instruction2 = createMockInstruction(MOCK_STREAM_2)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        expect(send).toBeCalledTimes(2)
        assertEqualInstructions(send.mock.calls[0], [ instruction1 ])
        assertEqualInstructions(send.mock.calls[1], [ instruction2 ])
    })
})