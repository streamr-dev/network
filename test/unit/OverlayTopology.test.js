const OverlayTopology = require('../../src/logic/OverlayTopology')

test('forming overlay topology', () => {
    const topology = new OverlayTopology(3, (arr) => arr, (arr) => arr[0])

    topology.update('node-1', [])
    expect(topology.formInstructions('node-1')).toEqual({})

    topology.update('node-2', [])
    expect(topology.formInstructions('node-2')).toEqual({
        'node-2': ['node-1']
    })

    topology.update('node-1', ['node-2'])
    topology.update('node-2', ['node-1'])

    expect(topology.formInstructions('node-1')).toEqual({})
    expect(topology.formInstructions('node-2')).toEqual({})

    topology.update('node-3', [])
    expect(topology.formInstructions('node-3')).toEqual({
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
        'node-1': ['node-4', 'node-5', 'node-3']
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
