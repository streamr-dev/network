// import WebSocket from 'ws'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { ServerWsEndpoint, startHttpServer } from '../../src/connection/ws/ServerWsEndpoint'
import NodeClientWsEndpoint from "../../src/connection/ws/NodeClientWsEndpoint"
import { runAndWaitForEvents } from 'streamr-test-utils'
import { DisconnectionCode, DisconnectionReason, Event } from '../../src/connection/ws/AbstractWsEndpoint'

const wssPort1 = 7777

describe('ServerWsEndpoint', () => {
    let serverWsEndpoint: ServerWsEndpoint | undefined = undefined
    let clientWsEndpoint: NodeClientWsEndpoint | undefined = undefined

    test('starts and stops', async () => {
        const listen = {
            hostname: '127.0.0.1',
            port: wssPort1
        }
        const httpServer = await startHttpServer(
            listen,
            undefined,
            undefined
        )
        serverWsEndpoint = new ServerWsEndpoint(listen, false, httpServer, PeerInfo.newTracker('tracker'))
        await serverWsEndpoint.stop()
    })

    test('receives unencrypted connections', async () => {
        const listen = {
            hostname: '127.0.0.1',
            port: wssPort1
        }
        const httpServer = await startHttpServer(
            listen,
            undefined,
            undefined
        )
        const trackerPeerInfo = PeerInfo.newTracker('tracker')
        serverWsEndpoint = new ServerWsEndpoint(listen, false, httpServer, trackerPeerInfo )
        
        clientWsEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('node1'))
        
        const result = await clientWsEndpoint.connect(serverWsEndpoint.getUrl() + '/ws', trackerPeerInfo)
        
        expect(result).toEqual('tracker')
       
        await serverWsEndpoint.stop()
        await clientWsEndpoint.stop()

    })
    
    test('can handle unexpected closing of connections', async () => {
        const listen = {
            hostname: '127.0.0.1',
            port: wssPort1
        }
        const httpServer = await startHttpServer(
            listen,
            undefined,
            undefined
        )
        const trackerPeerInfo = PeerInfo.newTracker('tracker')
        serverWsEndpoint = new ServerWsEndpoint(listen, false, httpServer, trackerPeerInfo )
        
        clientWsEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('node1'))
        
        let closedOne = false
        const originalEmitOne = clientWsEndpoint.emit.bind(clientWsEndpoint)

        const spyOne = jest.spyOn(clientWsEndpoint, 'emit').mockImplementation((event, ...args) => {
            if (event === Event.MESSAGE_RECEIVED) {

                if (!closedOne) {
                    closedOne = true
                    spyOne.mockRestore()

                    clientWsEndpoint!.close('tracker', DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION)
                }
            }
            return originalEmitOne(event, ...args)
        })
       
        await runAndWaitForEvents(
            () => { clientWsEndpoint!.connect(serverWsEndpoint!.getUrl() + '/ws', trackerPeerInfo) }, [
                [serverWsEndpoint, Event.PEER_CONNECTED]
            ])

        await runAndWaitForEvents(
            () => { serverWsEndpoint!.send('node1', 'hello') }, [
                [clientWsEndpoint, Event.PEER_DISCONNECTED]
            ])
        
        await serverWsEndpoint.stop()
        await clientWsEndpoint.stop()

    })
    
})
