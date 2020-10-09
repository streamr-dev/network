import { createTrackerRegistry, getTrackerRegistryFromContract } from '../../src/utils/TrackerRegistry'

const contractAddress = '0xBFCF120a8fD17670536f1B27D9737B775b2FD4CF'
const jsonRpcProvider = 'http://localhost:8545'

describe('TrackerRegistry', () => {
    test('get array of trackers', async () => {
        const trackerRegistry = await getTrackerRegistryFromContract({
            contractAddress, jsonRpcProvider
        })

        expect(trackerRegistry.getAllTrackers()).toStrictEqual([
            {
                http: 'http://10.200.10.1:11111',
                ws: 'ws://10.200.10.1:30301'
            },
            {
                http: 'http://10.200.10.1:11112',
                ws: 'ws://10.200.10.1:30302'
            },
            {
                http: 'http://10.200.10.1:11113',
                ws: 'ws://10.200.10.1:30303'
            }
        ])
    })

    test('throw exception if address is wrong (ENS)', async (done) => {
        try {
            await getTrackerRegistryFromContract({
                contractAddress: 'address', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: network does not support ENS')
            done()
        }
    })

    test('throw exception if address is wrong', async (done) => {
        try {
            await getTrackerRegistryFromContract({
                contractAddress: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: call revert exception')
            done()
        }
    })

    test('throw exception if jsonRpcProvider is wrong', async (done) => {
        try {
            await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider: 'jsonRpcProvider'
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: could not detect network')
            done()
        }
    })

    it('get tracker by stream key', async () => {
        const trackerRegistry = await getTrackerRegistryFromContract({
            contractAddress, jsonRpcProvider
        })

        // 1->1, 2->2, 3->3 coincidence
        expect(trackerRegistry.getTracker('stream-1::0')).toEqual({
            http: 'http://10.200.10.1:11111',
            ws: 'ws://10.200.10.1:30301'
        })
        expect(trackerRegistry.getTracker('stream-2::0')).toEqual({
            http: 'http://10.200.10.1:11112',
            ws: 'ws://10.200.10.1:30302'
        })
        expect(trackerRegistry.getTracker('stream-3::0')).toEqual({
            http: 'http://10.200.10.1:11113',
            ws: 'ws://10.200.10.1:30303'
        })
    })

    test('createTrackerRegistry', () => {
        const trackerRegistry = createTrackerRegistry([JSON.stringify({
            http: 'http://10.200.10.1:11111',
            ws: 'ws://10.200.10.1:30301'
        }), JSON.stringify({
            http: 'http://10.200.10.1:11112',
            ws: 'ws://10.200.10.1:30302'
        })])

        expect(trackerRegistry.getAllTrackers()).toStrictEqual([
            {
                http: 'http://10.200.10.1:11111',
                ws: 'ws://10.200.10.1:30301'
            },
            {
                http: 'http://10.200.10.1:11112',
                ws: 'ws://10.200.10.1:30302'
            }
        ])
    })
})
