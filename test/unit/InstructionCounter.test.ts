import { Status } from '../../src/identifiers'
import { InstructionCounter } from '../../src/logic/InstructionCounter'

describe('InstructionCounter', () => {
    let instructionCounter: InstructionCounter

    beforeEach(() => {
        instructionCounter = new InstructionCounter()
    })

    it('filterStatus returns all if counters have not been set', () => {
        const status: Partial<Status> = {
            streams: {
                'stream-1': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 1
                },
                'stream-2': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 3
                },
            }
        }
        const filtered = instructionCounter.filterStatus(status as Status, 'node')
        expect(filtered).toEqual(status.streams)
    })

    it('filterStatus filters streams according to counters', () => {
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')

        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')

        instructionCounter.setOrIncrement('node', 'stream-3')

        const status = {
            streams: {
                'stream-1': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 1
                },
                'stream-2': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 3
                },
                'stream-3': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 0
                },
            }
        }
        const filtered = instructionCounter.filterStatus(status as any, 'node')
        expect(filtered).toEqual({
            'stream-2': {
                inboundNodes: [],
                outboundNodes: [],
                counter: 3
            },
        })
    })

    it('filterStatus is node-specific', () => {
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')

        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')

        instructionCounter.setOrIncrement('node', 'stream-3')
        instructionCounter.setOrIncrement('node', 'stream-3')
        instructionCounter.setOrIncrement('node', 'stream-3')

        const status = {
            streams: {
                'stream-1': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 1
                },
                'stream-2': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 3
                },
                'stream-3': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 0
                },
            }
        }
        const filtered = instructionCounter.filterStatus(status as any, 'another-node')
        expect(filtered).toEqual(status.streams)
    })

    it('removeNode unsets counters', () => {
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')

        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')

        instructionCounter.setOrIncrement('node', 'stream-3')
        instructionCounter.setOrIncrement('node', 'stream-3')
        instructionCounter.setOrIncrement('node', 'stream-3')

        const status = {
            streams: {
                'stream-1': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 1
                },
                'stream-2': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 3
                },
                'stream-3': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 0
                },
            }
        }

        instructionCounter.removeNode('node')
        const filtered = instructionCounter.filterStatus(status as any, 'node')
        expect(filtered).toEqual(status.streams)
    })

    it('removeStream unsets counters', () => {
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')
        instructionCounter.setOrIncrement('node', 'stream-1')

        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')
        instructionCounter.setOrIncrement('node', 'stream-2')

        instructionCounter.setOrIncrement('node', 'stream-3')
        instructionCounter.setOrIncrement('node', 'stream-3')
        instructionCounter.setOrIncrement('node', 'stream-3')

        const status = {
            streams: {
                'stream-1': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 1
                },
                'stream-2': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 3
                },
                'stream-3': {
                    inboundNodes: [],
                    outboundNodes: [],
                    counter: 0
                },
            }
        }

        instructionCounter.removeStream('stream-3')
        const filtered = instructionCounter.filterStatus(status as any, 'node')

        expect(filtered).toEqual({
            'stream-2': {
                inboundNodes: [],
                outboundNodes: [],
                counter: 3
            },
            'stream-3': {
                inboundNodes: [],
                outboundNodes: [],
                counter: 0
            },
        })
    })

    test('setOrIncrement returns node/stream-specific counter value', () => {
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
