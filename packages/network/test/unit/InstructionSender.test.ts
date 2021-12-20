import { SPID, SPIDKey } from 'streamr-client-protocol'
import { Instruction, InstructionSender, SendInstructionFn } from '../../src/logic/tracker/InstructionSender'
import { Metrics, MetricsContext } from '../../src/helpers/MetricsContext'

const MOCK_SPID_1 = 'stream-id#1'
const MOCK_SPID_2 = 'stream-id#2'
const STARTUP_TIME = 1234567890

const DEBOUNCE_WAIT = 100
const MAX_WAIT = 2000

let mockInstructionIdSuffix = 0

const createMockInstruction = (spidKey: SPIDKey): Instruction => {
    mockInstructionIdSuffix++
    return {
        nodeId: `mock-node-id-${mockInstructionIdSuffix}`,
        spidKey,
        newNeighbors: [],
        counterValue: 0
    }
}

describe('InstructionSender', () => {
    let metrics: Metrics
    let send: jest.Mock<ReturnType<SendInstructionFn>, Parameters<SendInstructionFn>>
    let sender: InstructionSender

    beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(STARTUP_TIME)
        metrics = new MetricsContext('').create('test')
        send = jest.fn().mockResolvedValue(true)
        sender = new InstructionSender({
            debounceWait: DEBOUNCE_WAIT,
            maxWait: MAX_WAIT
        }, send, metrics)
    })

    afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
    })

    function assertSendsCalled(instructions: readonly Instruction[]): void {
        expect(send).toBeCalledTimes(instructions.length)
        for (let i = 0; i < instructions.length; ++i) {
            const { nodeId, spidKey, newNeighbors, counterValue } = instructions[i]
            expect(send).toHaveBeenNthCalledWith(i + 1, nodeId, SPID.from(spidKey), newNeighbors, counterValue)
        }
    }

    it('wait stabilization', () => {
        const instruction = createMockInstruction(MOCK_SPID_1)
        sender.addInstruction(instruction)
        expect(send).not.toBeCalled()
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertSendsCalled([instruction])
    })

    it('add within stabilization wait', () => {
        const instruction1 = createMockInstruction(MOCK_SPID_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        const instruction2 = createMockInstruction(MOCK_SPID_1)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertSendsCalled([instruction1, instruction2])
    })

    it('add after stabilization wait', () => {
        const instruction1 = createMockInstruction(MOCK_SPID_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        const instruction2 = createMockInstruction(MOCK_SPID_1)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertSendsCalled([instruction1, instruction2])
    })

    it('max wait reached', () => {
        const expected: Instruction[] = []
        while ((Date.now() - STARTUP_TIME) < MAX_WAIT) {
            const instruction = createMockInstruction(MOCK_SPID_1)
            sender.addInstruction(instruction)
            expected.push(instruction)
            jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        }
        assertSendsCalled(expected)
    })

    it('independent stream buffers', () => {
        const instruction1 = createMockInstruction(MOCK_SPID_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        const instruction2 = createMockInstruction(MOCK_SPID_2)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertSendsCalled([instruction1, instruction2])
    })
})