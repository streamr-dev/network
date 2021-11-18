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

    /*
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
        let trackerPeerInfo = PeerInfo.newTracker('tracker');
        serverWsEndpoint = new ServerWsEndpoint(listen, false, httpServer, trackerPeerInfo )
        
        clientWsEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('node1'))
        
        let result = await clientWsEndpoint.connect(serverWsEndpoint.getUrl() + '/ws', trackerPeerInfo)
        
        expect(result).toEqual('tracker')
       
        await serverWsEndpoint.stop()
        await clientWsEndpoint.stop()

    })
    
    test('receives encrypted connections', async () => {
        if (typeof _streamr_electron_test !== 'undefined') {
            return
        }
        const listen = {
            hostname: '127.0.0.1',
            port: wssPort2
        }
        const httpsServer = await startHttpServer(
            listen,
            'test/fixtures/key.pem',
            'test/fixtures/cert.pem'
        )
        let trackerPeerInfo = PeerInfo.newTracker('tracker');
        serverWsEndpoint = new ServerWsEndpoint(listen, true, httpsServer, trackerPeerInfo)
        
        clientWsEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('node1'))
        
        let result = await clientWsEndpoint.connect(serverWsEndpoint.getUrl() + '/ws', trackerPeerInfo)
        
        expect(result).toEqual('tracker')
       
        await serverWsEndpoint.stop()
        await clientWsEndpoint.stop()

    })
    */

    test('can handle closed and reopened connections', async () => {
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
        /*
        let closedTwo = false
        const originalEmitTwo = serverWsEndpoint.emit.bind(serverWsEndpoint)

        const spyTwo = jest.spyOn(serverWsEndpoint, 'emit').mockImplementation((event, ...args) => {
            if (event === Event.MESSAGE_RECEIVED) {
                console.info(args[1])
                if (!closedTwo) {
                    closedTwo = true
                    spyTwo.mockRestore()

                    //return nodeTwo.trackerManager.nodeToTracker.endpoint.close('tracker')
                }
            }
            return originalEmitTwo(event, ...args)
        })
        
        await clientWsEndpoint.connect(serverWsEndpoint.getUrl() + '/ws', trackerPeerInfo)
        
        await runAndWaitForEvents(
            () => { clientWsEndpoint!.close('tracker', DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION) }, [
            [clientWsEndpoint, Event.PEER_DISCONNECTED]
        ])

        await clientWsEndpoint.connect(serverWsEndpoint.getUrl() + '/ws', trackerPeerInfo)
        await runAndWaitForEvents(
            () => { clientWsEndpoint!.close('tracker', DisconnectionCode.DEAD_CONNECTION, DisconnectionReason.DEAD_CONNECTION) }, [
            [clientWsEndpoint, Event.PEER_DISCONNECTED]
        ])
        */

        await runAndWaitForEvents(
            () => { clientWsEndpoint!.connect(serverWsEndpoint!.getUrl() + '/ws', trackerPeerInfo) }, [
                [serverWsEndpoint, Event.PEER_CONNECTED]
            ])

        await runAndWaitForEvents(
            () => { serverWsEndpoint!.send('node1', 'hello') }, [
                [clientWsEndpoint, Event.PEER_DISCONNECTED]
            ])
        
        try {
            await clientWsEndpoint.send('tracker', 'message')
        }
        catch (e) {
            //console.log(e)
        }
       
        await serverWsEndpoint.stop()
        await clientWsEndpoint.stop()

    })
    
})
