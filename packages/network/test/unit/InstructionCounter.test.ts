import { Status } from '../../src/identifiers'
import { InstructionCounter } from '../../src/logic/tracker/InstructionCounter'

describe('InstructionCounter', () => {
    let instructionCounter: InstructionCounter

    beforeEach(() => {
        instructionCounter = new InstructionCounter()
    })

    it('if counters have not been set', () => {
        const status: Partial<Status> = {
            stream: {
                id: 'stream-1',
                partition: 0,
                neighbors: [],
                counter: 123
            }
        }
        const isMostRecent = instructionCounter.isMostRecent(status as Status, 'node')
        expect(isMostRecent).toEqual(true)
    })

    it('stream specific', () => {
        instructionCounter.setOrIncrement('node', 'stream-1#0')
        instructionCounter.setOrIncrement('node', 'stream-1#0')
        instructionCounter.setOrIncrement('node', 'stream-2#0')
        instructionCounter.setOrIncrement('node', 'stream-2#0')
        instructionCounter.setOrIncrement('node', 'stream-2#0')
        const status1 = {
            stream: {
                id: 'stream-1',
                partition: 0,
                neighbors: [],
                counter: 1
            }
        }
        const status2 = {
            stream: {
                id: 'stream-2',
                partition: 0,
                neighbors: [],
                counter: 3
            }
        }
        expect(instructionCounter.isMostRecent(status1 as any, 'node')).toBe(false)
        expect(instructionCounter.isMostRecent(status2 as any, 'node')).toBe(true)
    })

    it('node specific', () => {
        instructionCounter.setOrIncrement('node-1', 'stream-1#0')
        instructionCounter.setOrIncrement('node-1', 'stream-1#0')
        instructionCounter.setOrIncrement('node-2', 'stream-1#0')
        instructionCounter.setOrIncrement('node-2', 'stream-1#0')
        instructionCounter.setOrIncrement('node-2', 'stream-1#0')
        const status1 = {
            stream: {
                id: 'stream-1',
                partition: 0,
                neighbors: [],
                counter: 1
            }
        }
        const status2 = {
            stream: {
                id: 'stream-1',
                partition: 0,
                neighbors: [],
                counter: 3
            }
        }
        expect(instructionCounter.isMostRecent(status1 as any, 'node-1')).toBe(false)
        expect(instructionCounter.isMostRecent(status2 as any, 'node-2')).toBe(true)
    })

    it('removeNode unsets counters', () => {
        instructionCounter.setOrIncrement('node', 'stream-1#0')
        instructionCounter.setOrIncrement('node', 'stream-1#0')
        instructionCounter.setOrIncrement('node', 'stream-1#0')
        instructionCounter.removeNode('node')
        const status = {
            stream: {
                id: 'stream-1',
                partition: 0,
                neighbors: [],
                counter: 0
            }
        }
        expect(instructionCounter.isMostRecent(status as any, 'node')).toEqual(true)
    })

    it('removeStream unsets counters', () => {
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.removeStream('stream-1')
        const status = {
            stream: {
                id: 'stream-1',
                partition: 0,
                neighbors: [],
                counter: 0
            }
        }
        expect(instructionCounter.isMostRecent(status as any, 'node')).toEqual(true)
    })

    it('setOrIncrement returns node/stream-specific counter value', () => {
        expect(instructionCounter.setOrIncrement('node-a', 'stream-1')).toEqual(1)
        expect(instructionCounter.setOrIncrement('node-a', 'stream-1')).toEqual(2)
        expect(instructionCounter.setOrIncrement('node-a', 'stream-1')).toEqual(3)
        expect(instructionCounter.setOrIncrement('node-a', 'stream-2')).toEqual(1)
        expect(instructionCounter.setOrIncrement('node-b', 'stream-1')).toEqual(1)
        expect(instructionCounter.setOrIncrement('node-b', 'stream-1')).toEqual(2)
        expect(instructionCounter.setOrIncrement('node-b', 'stream-2')).toEqual(1)
        expect(instructionCounter.setOrIncrement('node-b', 'stream-3')).toEqual(1)
        expect(instructionCounter.setOrIncrement('node-a', 'stream-1')).toEqual(4)
        instructionCounter.removeStream('stream-1')
        expect(instructionCounter.setOrIncrement('node-a', 'stream-1')).toEqual(1)
        expect(instructionCounter.setOrIncrement('node-b', 'stream-1')).toEqual(1)
        instructionCounter.removeNode('node-a')
        expect(instructionCounter.setOrIncrement('node-a', 'stream-1')).toEqual(1)
        expect(instructionCounter.setOrIncrement('node-a', 'stream-2')).toEqual(1)
    })
})
