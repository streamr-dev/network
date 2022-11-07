import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import {
    Instruction,
    InstructionAndStatusAckSender,
    SendInstructionFn,
    SendStatusAckFn, StatusAck,
} from '../../src/logic/InstructionAndStatusAckSender'
import { MetricsContext } from '@streamr/utils'

const MOCK_STREAM_PART_1 = StreamPartIDUtils.parse('stream-id#1')
const MOCK_STREAM_PART_2 = StreamPartIDUtils.parse('stream-id#2')
const STARTUP_TIME = 1234567890

const DEBOUNCE_WAIT = 100
const MAX_WAIT = 2000

let mockInstructionIdSuffix = 0
let mockStatusAckSuffix = 0

const createMockInstruction = (streamPartId: StreamPartID): Instruction => {
    mockInstructionIdSuffix += 1
    return {
        nodeId: `mock-node-id-${mockInstructionIdSuffix}`,
        streamPartId,
        newNeighbors: [],
        counterValue: 0
    }
}

const createMockStatusAck = (streamPartId: StreamPartID): StatusAck => {
    mockStatusAckSuffix += 1
    return {
        nodeId: `mock-node-id-${mockStatusAckSuffix}`,
        streamPartId
    }
}

describe('InstructionAndStatusAckSender', () => {
    let sendInstruction: jest.Mock<ReturnType<SendInstructionFn>, Parameters<SendInstructionFn>>
    let sendStatusAck: jest.Mock<ReturnType<SendStatusAckFn>, Parameters<SendStatusAckFn>>
    let sender: InstructionAndStatusAckSender

    beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(STARTUP_TIME)
        sendInstruction = jest.fn().mockResolvedValue(true)
        sendStatusAck = jest.fn().mockResolvedValue(true)
        sender = new InstructionAndStatusAckSender({
            debounceWait: DEBOUNCE_WAIT,
            maxWait: MAX_WAIT,
        }, sendInstruction, sendStatusAck, new MetricsContext())
    })

    afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
    })

    function assertInstructionsSent(instructions: readonly Instruction[]): void {
        expect(sendInstruction).toBeCalledTimes(instructions.length)
        for (let i = 0; i < instructions.length; ++i) {
            const { nodeId, streamPartId, newNeighbors, counterValue } = instructions[i]
            expect(sendInstruction).toHaveBeenNthCalledWith(i + 1, nodeId, streamPartId, newNeighbors, counterValue)
        }
    }

    function assertStatusAcksSent(statusAcks: readonly StatusAck[]): void {
        expect(sendStatusAck).toBeCalledTimes(statusAcks.length)
        for (let i = 0; i < statusAcks.length; ++i) {
            const { nodeId, streamPartId } = statusAcks[i]
            expect(sendStatusAck).toHaveBeenNthCalledWith(i + 1, nodeId, streamPartId)
        }
    }

    it('wait stabilization (instruction)', () => {
        const instruction = createMockInstruction(MOCK_STREAM_PART_1)
        sender.addInstruction(instruction)
        expect(sendInstruction).not.toBeCalled()
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertInstructionsSent([instruction])
    })

    it('wait stabilization (statusAck)', () => {
        const statusAck = createMockStatusAck(MOCK_STREAM_PART_1)
        sender.addStatusAck(statusAck)
        expect(sendStatusAck).not.toBeCalled()
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertStatusAcksSent([statusAck])
    })

    it('add within stabilization wait', () => {
        const instruction1 = createMockInstruction(MOCK_STREAM_PART_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        const instruction2 = createMockInstruction(MOCK_STREAM_PART_1)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertInstructionsSent([instruction1, instruction2])
    })

    it('add after stabilization wait', () => {
        const instruction1 = createMockInstruction(MOCK_STREAM_PART_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        const instruction2 = createMockInstruction(MOCK_STREAM_PART_1)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertInstructionsSent([instruction1, instruction2])
    })

    it('max wait reached', () => {
        const expected: Instruction[] = []
        while ((Date.now() - STARTUP_TIME) < MAX_WAIT) {
            const instruction = createMockInstruction(MOCK_STREAM_PART_1)
            sender.addInstruction(instruction)
            expected.push(instruction)
            jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        }
        assertInstructionsSent(expected)
    })

    it('independent stream buffers', () => {
        const instruction1 = createMockInstruction(MOCK_STREAM_PART_1)
        sender.addInstruction(instruction1)
        jest.advanceTimersByTime(DEBOUNCE_WAIT / 2)
        const instruction2 = createMockInstruction(MOCK_STREAM_PART_2)
        sender.addInstruction(instruction2)
        jest.advanceTimersByTime(DEBOUNCE_WAIT)
        assertInstructionsSent([instruction1, instruction2])
    })
})
