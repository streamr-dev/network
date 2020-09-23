import { getTrackerRegistry } from '../../src/utils/TrackerRegistry'

const contractAddress = '0xBFCF120a8fD17670536f1B27D9737B775b2FD4CF'
const jsonRpcProvider = 'http://localhost:8545'

describe('TrackerRegistry', () => {
    test('get array of trackers', async () => {
        const trackerRegistry = await getTrackerRegistry({
            contractAddress, jsonRpcProvider
        })

        expect(trackerRegistry.getAllTrackers()).toStrictEqual([
            'ws://10.200.10.1:30301',
            'ws://10.200.10.1:30302',
            'ws://10.200.10.1:30303'
        ])
    })

    test('throw exception if address is wrong (ENS)', async (done) => {
        try {
            await getTrackerRegistry({
                contractAddress: 'address', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: network does not support ENS')
            done()
        }
    })

    test('throw exception if address is wrong', async (done) => {
        try {
            await getTrackerRegistry({
                contractAddress: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: call revert exception')
            done()
        }
    })

    test('throw exception if jsonRpcProvider is wrong', async (done) => {
        try {
            await getTrackerRegistry({
                contractAddress, jsonRpcProvider: 'jsonRpcProvider'
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: could not detect network')
            done()
        }
    })

    test('has method', async () => {
        const trackerRegistry = await getTrackerRegistry({
            contractAddress, jsonRpcProvider
        })

        expect(trackerRegistry.has('ws://10.200.10.1:30301')).toBeTruthy()
        expect(trackerRegistry.has('ws://10.200.10.1:30302')).toBeTruthy()
        expect(trackerRegistry.has('ws://10.200.10.1:30303')).toBeTruthy()
    })

    test('add/remove servers', async () => {
        const trackerRegistry = await getTrackerRegistry({
            contractAddress, jsonRpcProvider
        })

        trackerRegistry.remove('ws://10.200.10.1:30301')
        expect(trackerRegistry.has('ws://10.200.10.1:30301')).toBeFalsy()
        expect(trackerRegistry.has('ws://10.200.10.1:30302')).toBeTruthy()
        expect(trackerRegistry.has('ws://10.200.10.1:30303')).toBeTruthy()

        trackerRegistry.add('ws://10.200.10.1:30301')
        expect(trackerRegistry.has('ws://10.200.10.1:30301')).toBeTruthy()
        expect(trackerRegistry.has('ws://10.200.10.1:30302')).toBeTruthy()
        expect(trackerRegistry.has('ws://10.200.10.1:30303')).toBeTruthy()

        trackerRegistry.reset()
        expect(trackerRegistry.has('ws://10.200.10.1:30301')).toBeFalsy()
        expect(trackerRegistry.has('ws://10.200.10.1:30302')).toBeFalsy()
        expect(trackerRegistry.has('ws://10.200.10.1:30303')).toBeFalsy()
    })

    it('get tracker by stream key', async () => {
        const trackerRegistry = await getTrackerRegistry({
            contractAddress, jsonRpcProvider
        })

        expect(trackerRegistry.get('stream-1::0')).toEqual('ws://10.200.10.1:30302')
        expect(trackerRegistry.get('stream-3::0')).toEqual('ws://10.200.10.1:30303')
        expect(trackerRegistry.get('stream-6::0')).toEqual('ws://10.200.10.1:30301')

        trackerRegistry.remove('ws://10.200.10.1:30303')
        expect(trackerRegistry.get('stream-1::0')).toEqual('ws://10.200.10.1:30302')
        expect(trackerRegistry.get('stream-3::0')).toEqual('ws://10.200.10.1:30301')
        expect(trackerRegistry.get('stream-6::0')).toEqual('ws://10.200.10.1:30301')

        trackerRegistry.remove('ws://10.200.10.1:30302')
        expect(trackerRegistry.get('stream-1::0')).toEqual('ws://10.200.10.1:30301')
        expect(trackerRegistry.get('stream-3::0')).toEqual('ws://10.200.10.1:30301')
        expect(trackerRegistry.get('stream-6::0')).toEqual('ws://10.200.10.1:30301')

        trackerRegistry.remove('ws://10.200.10.1:30301')
        expect(trackerRegistry.get('stream-1::0')).toBeUndefined()
        expect(trackerRegistry.get('stream-2::0')).toBeUndefined()
        expect(trackerRegistry.get('stream-6::0')).toBeUndefined()
    })
})
