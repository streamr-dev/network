import { LocationManager } from '../../src/logic/LocationManager'
import { Logger } from "../../src/helpers/Logger"

describe('LocationManager', () => {
    let locationManager: LocationManager

    beforeEach(() => {
        locationManager = new LocationManager(new Logger([]))
    })

    describe('#updateLocation', () => {
        it('passing valid location', () => {
            locationManager.updateLocation({
                nodeId: 'nodeId',
                location: {
                    city: 'Helsinki',
                    country: 'Finland',
                    latitude: null,
                    longitude: null
                },
                address: 'ws://193.166.4.1'
            })
            expect(locationManager.getNodeLocation('nodeId')).toEqual({
                city: 'Helsinki',
                country: 'Finland',
                latitude: null,
                longitude: null
            })
        })

        it('passing empty location but valid address', () => {
            locationManager.updateLocation({
                nodeId: 'nodeId',
                location: null,
                address: 'ws://193.166.4.1'
            })
            expect(locationManager.getNodeLocation('nodeId')).toEqual({
                city: '',
                country: 'FI',
                latitude: 60.1708,
                longitude: 24.9375
            })
        })

        it('passing empty location and address', () => {
            locationManager.updateLocation({
                nodeId: 'nodeId',
                location: null,
                address: null as any
            })
            expect(locationManager.getNodeLocation('nodeId')).toBeUndefined()
        })

        it('passing invalid address causes error to be logged', () => {
            // @ts-expect-error private field
            locationManager.logger.warn = jest.fn()
            locationManager.updateLocation({
                nodeId: 'nodeId',
                location: null,
                address: 'dsjklgasdjklgjasdklgj'
            })
            expect(locationManager.getNodeLocation('nodeId')).toBeUndefined()
            // @ts-expect-error private field
            expect(locationManager.logger.warn).toHaveBeenCalled()
        })

        it('passing invalid location to already set location does not overwrite', () => {
            locationManager.updateLocation({
                nodeId: 'nodeId',
                location: {
                    city: 'Helsinki',
                    country: 'Finland',
                    latitude: null,
                    longitude: null
                },
                address: 'ws://193.166.4.1'
            })
            locationManager.updateLocation({
                nodeId: 'nodeId',
                location: null,
                address: 'ws://193.166.4.1'
            })
            expect(locationManager.getNodeLocation('nodeId')).toEqual({
                city: 'Helsinki',
                country: 'Finland',
                latitude: null,
                longitude: null
            })
        })
    })

    it('getAllNodeLocations', () => {
        locationManager.updateLocation({
            nodeId: 'node-1',
            location: null,
            address: 'ws://193.166.4.1'
        })
        locationManager.updateLocation({
            nodeId: 'node-2',
            location: null,
            address: 'ws://8.8.8.8'
        })
        expect(locationManager.getAllNodeLocations()).toEqual({
            'node-1': {
                city: '',
                country: 'FI',
                latitude: 60.1708,
                longitude: 24.9375
            },
            'node-2': {
                city: '',
                country: 'US',
                latitude: 37.751,
                longitude: -97.822
            },
        })
    })

    it('removeNode', () => {
        locationManager.updateLocation({
            nodeId: 'node-1',
            location: null,
            address: 'ws://193.166.4.1'
        })
        locationManager.updateLocation({
            nodeId: 'node-2',
            location: null,
            address: 'ws://8.8.8.8'
        })
        locationManager.removeNode('node-2')
        expect(locationManager.getAllNodeLocations()).toEqual({
            'node-1': {
                city: '',
                country: 'FI',
                latitude: 60.1708,
                longitude: 24.9375
            }
        })
    })
})
