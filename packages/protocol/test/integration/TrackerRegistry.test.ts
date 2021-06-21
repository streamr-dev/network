import { createTrackerRegistry, getTrackerRegistryFromContract } from '../../src/utils/TrackerRegistry'

const contractAddress = '0xBFCF120a8fD17670536f1B27D9737B775b2FD4CF'
const jsonRpcProvider = `http://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}:8545`

describe('TrackerRegistry', () => {
    test('throw exception if address is wrong (ENS)', async () => {
        await expect(async () => (
            await getTrackerRegistryFromContract({
                contractAddress: 'address', jsonRpcProvider
            })
        )).rejects.toThrow('network does not support ENS')
    })

    test('throw exception if address is wrong', async () => {
        await expect(async () => (
            await getTrackerRegistryFromContract({
                contractAddress: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', jsonRpcProvider
            })
        )).rejects.toThrow('call revert exception')
    })

    test('throw exception if jsonRpcProvider is wrong', async () => {
        await expect(async () => (
            await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider: 'jsonRpcProvider'
            })
        )).rejects.toThrow('could not detect network')
    })

    describe('getAllTrackers', () => {
        test('get array of trackers', async () => {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(trackerRegistry.getAllTrackers()).toStrictEqual([
                {
                    http: 'http://10.200.10.1:30301',
                    ws: 'ws://10.200.10.1:30301'
                },
                {
                    http: 'http://10.200.10.1:30302',
                    ws: 'ws://10.200.10.1:30302'
                },
                {
                    http: 'http://10.200.10.1:30303',
                    ws: 'ws://10.200.10.1:30303'
                }
            ])
        })
    })

    describe('getTracker', () => {
        test('throws if stream id is invalid', async () => {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            // old format
            expect(() => {
                trackerRegistry.getTracker('stream-1::0')
            }).toThrow()

            // stream id is not a string
            expect(() => {
                trackerRegistry.getTracker(1234 as any)
            }).toThrow()

            // partition is not valid
            expect(() => {
                trackerRegistry.getTracker('stream-1', '0' as any)
            }).toThrow()

            expect(() => {
                trackerRegistry.getTracker('stream-1', -23)
            }).toThrow()

            // valid id
            expect(() => {
                trackerRegistry.getTracker('stream-1')
            }).not.toThrow()

            expect(() => {
                trackerRegistry.getTracker('stream-1', 5)
            }).not.toThrow()
        })

        test('get tracker by stream key', async () => {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            // 1->1, 2->2, 3->3 coincidence
            expect(trackerRegistry.getTracker('stream-1')).toEqual({
                http: 'http://10.200.10.1:30301',
                ws: 'ws://10.200.10.1:30301'
            })
            expect(trackerRegistry.getTracker('stream-2')).toEqual({
                http: 'http://10.200.10.1:30302',
                ws: 'ws://10.200.10.1:30302'
            })
            expect(trackerRegistry.getTracker('stream-3')).toEqual({
                http: 'http://10.200.10.1:30303',
                ws: 'ws://10.200.10.1:30303'
            })
        })
    })

    describe('createTrackerRegistry', () => {
        test('creates tracker registry', () => {
            const trackerRegistry = createTrackerRegistry([{
                http: 'http://10.200.10.1:30301',
                ws: 'ws://10.200.10.1:30301'
            }, {
                http: 'http://10.200.10.1:30302',
                ws: 'ws://10.200.10.1:30302'
            }])

            expect(trackerRegistry.getAllTrackers()).toStrictEqual([
                {
                    http: 'http://10.200.10.1:30301',
                    ws: 'ws://10.200.10.1:30301'
                },
                {
                    http: 'http://10.200.10.1:30302',
                    ws: 'ws://10.200.10.1:30302'
                }
            ])
        })
    })
})
