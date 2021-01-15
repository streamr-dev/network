import { OverlayTopology } from '../../src/logic/OverlayTopology'

const maxNeighborsPerNodeArray = [4, 8, 12, 16]

describe('overlay creation', () => {
    test('forming overlay topology', () => {
        const topology = new OverlayTopology(3, (arr) => arr, (arr) => arr[0])

        expect(topology.hasNode('node-1')).toEqual(false)
        topology.update('node-1', [])
        expect(topology.formInstructions('node-1')).toEqual({})
        expect(topology.hasNode('node-1')).toEqual(true)

        topology.update('node-2', [])
        expect(topology.formInstructions('node-2')).toEqual({
            'node-1': ['node-2'],
            'node-2': ['node-1'],
        })

        topology.update('node-1', ['node-2'])
        topology.update('node-2', ['node-1'])

        expect(topology.formInstructions('node-1')).toEqual({})
        expect(topology.formInstructions('node-2')).toEqual({})

        topology.update('node-3', [])
        expect(topology.formInstructions('node-3')).toEqual({
            'node-1': ['node-2', 'node-3'],
            'node-2': ['node-1', 'node-3'],
            'node-3': ['node-1', 'node-2']
        })

        topology.update('node-3', ['node-1', 'node-2'])
        topology.update('node-1', ['node-2', 'node-3'])

        expect(topology.formInstructions('node-1')).toEqual({})
        expect(topology.formInstructions('node-2')).toEqual({})
        expect(topology.formInstructions('node-3')).toEqual({})

        topology.update('node-2', ['node-1', 'node-3'])
        expect(topology.formInstructions('node-1')).toEqual({})
        expect(topology.formInstructions('node-2')).toEqual({})
        expect(topology.formInstructions('node-3')).toEqual({})

        topology.update('node-4', ['node-1'])
        expect(topology.formInstructions('node-4')).toEqual({
            'node-2': ['node-1', 'node-3', 'node-4'],
            'node-3': ['node-1', 'node-2', 'node-4'],
            'node-4': ['node-1', 'node-2', 'node-3']
        })

        topology.update('node-4', ['node-1', 'node-2', 'node-3'])
        expect(topology.state()).toEqual({ // fully connected
            'node-1': [
                'node-2',
                'node-3',
                'node-4'
            ],
            'node-2': [
                'node-1',
                'node-3',
                'node-4'
            ],
            'node-3': [
                'node-1',
                'node-2',
                'node-4'
            ],
            'node-4': [
                'node-1',
                'node-2',
                'node-3'
            ]
        })
        expect(topology.getNeighbors('node-1')).toEqual(new Set(['node-2', 'node-3', 'node-4']))
        expect(topology.getNeighbors('node-4')).toEqual(new Set(['node-1', 'node-2', 'node-3']))

        expect(topology.formInstructions('node-1')).toEqual({})
        expect(topology.formInstructions('node-2')).toEqual({})
        expect(topology.formInstructions('node-3')).toEqual({})
        expect(topology.formInstructions('node-4')).toEqual({})

        // Neighbor limits reached here
        topology.update('node-5', [])
        expect(topology.formInstructions('node-5')).toEqual({
            'node-1': [
                'node-3',
                'node-4',
                'node-5'
            ],
            'node-2': [
                'node-3',
                'node-4',
                'node-5'
            ],
            'node-5': [
                'node-1',
                'node-2'
            ]
        })

        topology.update('node-5', ['node-1', 'node-2'])
        topology.update('node-2', ['node-3', 'node-4', 'node-5'])
        topology.update('node-1', ['node-3', 'node-4', 'node-5'])

        expect(topology.formInstructions('node-1')).toEqual({})
        expect(topology.formInstructions('node-2')).toEqual({})
        expect(topology.formInstructions('node-3')).toEqual({})
        expect(topology.formInstructions('node-5')).toEqual({})

        expect(topology.state()).toEqual({
            'node-1': [
                'node-3',
                'node-4',
                'node-5'
            ],
            'node-2': [
                'node-3',
                'node-4',
                'node-5'
            ],
            'node-3': [
                'node-1',
                'node-2',
                'node-4'
            ],
            'node-4': [
                'node-1',
                'node-2',
                'node-3'
            ],
            'node-5': [
                'node-1',
                'node-2',
            ]
        })

        topology.update('node-6', [])
        expect(topology.formInstructions('node-6')).toEqual({
            'node-1': ['node-4', 'node-5', 'node-6'],
            'node-3': ['node-2', 'node-4', 'node-6'],
            'node-5': ['node-1', 'node-2', 'node-6'],
            'node-6': ['node-5', 'node-1', 'node-3']
        })

        topology.leave('node-6')
        expect(topology.state()).toEqual({
            'node-1': [
                'node-4',
                'node-5',
            ],
            'node-2': [
                'node-3',
                'node-4',
                'node-5'
            ],
            'node-3': [
                'node-2',
                'node-4',
            ],
            'node-4': [
                'node-1',
                'node-2',
                'node-3'
            ],
            'node-5': [
                'node-1',
                'node-2',
            ]
        })

        topology.update('node-1', ['node-4', 'node-5'])
        expect(topology.formInstructions('node-1')).toEqual({
            'node-1': ['node-4', 'node-5', 'node-3'],
            'node-3': ['node-2', 'node-4', 'node-1'],
        })
        expect(topology.state()).toEqual({
            'node-1': [
                'node-3',
                'node-4',
                'node-5'
            ],
            'node-2': [
                'node-3',
                'node-4',
                'node-5'
            ],
            'node-3': [
                'node-1',
                'node-2',
                'node-4',
            ],
            'node-4': [
                'node-1',
                'node-2',
                'node-3'
            ],
            'node-5': [
                'node-1',
                'node-2',
            ]
        })

        topology.leave('node-3')
        expect(topology.state()).toEqual({
            'node-1': [
                'node-4',
                'node-5'
            ],
            'node-2': [
                'node-4',
                'node-5'
            ],
            'node-4': [
                'node-1',
                'node-2',
            ],
            'node-5': [
                'node-1',
                'node-2',
            ]
        })

        topology.leave('node-1')
        expect(topology.hasNode('node-1')).toEqual(false)
        expect(topology.state()).toEqual({
            'node-2': [
                'node-4',
                'node-5'
            ],
            'node-4': [
                'node-2',
            ],
            'node-5': [
                'node-2',
            ]
        })
    })

    test('unknown nodes are discarded', () => {
        maxNeighborsPerNodeArray.forEach((maxNeighborsPerNode) => {
            const topology = new OverlayTopology(maxNeighborsPerNode)

            topology.update('node-1', [])
            topology.update('node-2', [])
            topology.update('node-3', [])

            topology.update('node-1', ['node-2', 'node-3', 'node-4'])
            expect(topology.state()).toEqual({
                'node-1': [
                    'node-2',
                    'node-3'
                ],
                'node-2': [
                    'node-1'
                ],
                'node-3': [
                    'node-1'
                ]
            })
        })
    })

    test('self-connections are discarded', () => {
        const topology = new OverlayTopology(4, (arr) => arr, (arr) => arr[0])

        topology.update('node-1', [])
        topology.update('node-2', [])
        topology.update('node-3', [])

        topology.update('node-3', ['node-1', 'node-2', 'node-3'])

        expect(topology.state()).toEqual({
            'node-1': [
                'node-3',
            ],
            'node-2': [
                'node-3'
            ],
            'node-3': [
                'node-1',
                'node-2'
            ]
        })
    })

    test('test case when all nodes leave topology', () => {
        const topology = new OverlayTopology(3, (arr) => arr, (arr) => arr[0])

        expect(topology.isEmpty()).toBeTruthy()
        expect(topology.state()).toEqual({})
        topology.update('node-1', [])
        expect(topology.state()).toEqual({
            'node-1': []
        })
        topology.leave('node-1')
        expect(topology.state()).toEqual({})
        expect(topology.isEmpty()).toBeTruthy()
        expect(topology.getNeighbors('node-1')).toEqual(new Set([]))
    })

    // TODO: remove or write better, since not the best way to test randomness
    test('100 rounds of typical operation does not lead to invariant exception', () => {
        maxNeighborsPerNodeArray.forEach((maxNeighborsPerNode) => {
            for (let i = 0; i < 100; ++i) {
                const topology = new OverlayTopology(maxNeighborsPerNode)
                topology.update('node-1', [])
                topology.update('node-2', [])
                topology.formInstructions('node-2')
                topology.update('node-3', [])
                topology.formInstructions('node-3')
                topology.update('node-4', [])
                topology.formInstructions('node-4')
                topology.update('node-5', [])
                topology.formInstructions('node-5')
                topology.update('node-0', [])
                topology.formInstructions('node-0')
            }
        })
    })
})
