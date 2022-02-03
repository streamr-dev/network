import { createTrackerRegistry } from '../../../src/utils/TrackerRegistry'

describe('TrackerRegistry', () => {
    describe('createTrackerRegistry', () => {
        test('creates tracker registry', () => {
            const trackerRegistry = createTrackerRegistry([{
                id: '',
                http: 'http://10.200.10.1:30301',
                ws: 'ws://10.200.10.1:30301'
            }, {
                id: '',
                http: 'http://10.200.10.1:30302',
                ws: 'ws://10.200.10.1:30302'
            }])

            expect(trackerRegistry.getAllTrackers()).toStrictEqual([
                {
                    id: '',
                    http: 'http://10.200.10.1:30301',
                    ws: 'ws://10.200.10.1:30301'
                },
                {
                    id: '',
                    http: 'http://10.200.10.1:30302',
                    ws: 'ws://10.200.10.1:30302'
                }
            ])
        })
    })
})
