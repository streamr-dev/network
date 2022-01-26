import { createTrackerRegistry, getTrackerRegistryFromContract } from '../../src/utils/TrackerRegistry'
import { StreamPartIDUtils } from "../../src"

const contractAddress = '0xBFCF120a8fD17670536f1B27D9737B775b2FD4CF'
const jsonRpcProvider = `http://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}:8545`

describe('TrackerRegistry', () => {
    test('throw exception if address is wrong (ENS)', async () => {
        await expect(async () => (
            await getTrackerRegistryFromContract({
                contractAddress: 'address', jsonRpcProvider
            })
        )).rejects.toThrow('ENS')
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
                    id: '0xb9e7cEBF7b03AE26458E32a059488386b05798e8',
                    http: 'http://10.200.10.1:30301',
                    ws: 'ws://10.200.10.1:30301'
                },
                {
                    id: '0x0540A3e144cdD81F402e7772C76a5808B71d2d30',
                    http: 'http://10.200.10.1:30302',
                    ws: 'ws://10.200.10.1:30302'
                },
                {
                    id: '0xf2C195bE194a2C91e93Eacb1d6d55a00552a85E2',
                    http: 'http://10.200.10.1:30303',
                    ws: 'ws://10.200.10.1:30303'
                }
            ])
        })
    })

    describe('getTracker', () => {
        test('get tracker by StreamPartID', async () => {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(trackerRegistry.getTracker(StreamPartIDUtils.parse('stream-1#3'))).toEqual({
                id: '0xb9e7cEBF7b03AE26458E32a059488386b05798e8',
                http: 'http://10.200.10.1:30301',
                ws: 'ws://10.200.10.1:30301'
            })
            expect(trackerRegistry.getTracker(StreamPartIDUtils.parse('stream-2#2'))).toEqual({
                id: '0x0540A3e144cdD81F402e7772C76a5808B71d2d30',
                http: 'http://10.200.10.1:30302',
                ws: 'ws://10.200.10.1:30302'
            })
            expect(trackerRegistry.getTracker(StreamPartIDUtils.parse('stream-3#0'))).toEqual({
                id: '0xf2C195bE194a2C91e93Eacb1d6d55a00552a85E2',
                http: 'http://10.200.10.1:30303',
                ws: 'ws://10.200.10.1:30303'
            })
        })
    })

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
