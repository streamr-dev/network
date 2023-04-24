import { Simulator } from '../../src/connection/Simulator/Simulator'
import { SimulatorConnection } from '../../src/connection/Simulator/SimulatorConnection'
import { SimulatorConnector } from '../../src/connection/Simulator/SimulatorConnector'
import { ConnectionType } from '../../src/connection/IConnection'
import { NodeType, PeerDescriptor } from '../../src/exports'

// Create unit test for Simulator class in src/connection/Simulator/Simulator.ts

describe('Simulator', () => {

    it('can be created', () => {
        expect(() => new Simulator()).not.toThrow()
    })

    it('can be stopped', async () => {
        const simulator = new Simulator()
        await simulator.stop()
    })

    // test the connect method here
    it('returns an error if target connector does not exist', async () => {
        const simulator = new Simulator()
        const peerDescriptor1: PeerDescriptor = {
            kademliaId: Uint8Array.from([1]),
            nodeName: 'peer1',
            type: NodeType.NODEJS
        }

        const peerDescriptor2: PeerDescriptor = {
            kademliaId: Uint8Array.from([2]),
            nodeName: 'peer2',
            type: NodeType.NODEJS
        }

        const connection = new SimulatorConnection(peerDescriptor1, peerDescriptor2, ConnectionType.SIMULATOR_CLIENT, simulator)  
        await simulator.connect(connection, peerDescriptor2, (error) => {
            expect(error).toEqual('Target connector not found')
        })
        
        await simulator.stop()
    })

    it('can connect', async () => {
        const simulator = new Simulator()
        const peerDescriptor1: PeerDescriptor = {
            kademliaId: Uint8Array.from([1]),
            nodeName: 'peer1',
            type: NodeType.NODEJS
        }

        const peerDescriptor2: PeerDescriptor = {
            kademliaId: Uint8Array.from([2]),
            nodeName: 'peer2',
            type: NodeType.NODEJS
        }

        const sourceConnection = new SimulatorConnection(peerDescriptor1, peerDescriptor2, ConnectionType.SIMULATOR_CLIENT, simulator)  
        
        const targetConnector = new SimulatorConnector('1.0', peerDescriptor2, simulator, (connection) =>{
            expect(connection).toBeTruthy()
            return true
        })
        
        simulator.addConnector(targetConnector)

        await simulator.connect(sourceConnection, peerDescriptor2, (error) => {
            expect(error).toBeFalsy()
        })
        
        await simulator.stop()
    })
})
