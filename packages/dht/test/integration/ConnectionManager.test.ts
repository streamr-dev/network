import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { NodeType } from "../../src/proto/DhtRpc"

describe('ConnectionManager', () => {
    beforeAll(async () => {
    })

    /*
    it('Can start alone', async () => {
        const connectionManager = new ConnectionManager( { webSocketHost:'localhost', webSocketPort: 9991 } )
       
        const result = await connectionManager.start()

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        await connectionManager.stop()
    })

    it('Throws an async exception if fails to connect to entrypoints', async () => {
    
        const connectionManager = new ConnectionManager( { webSocketPort: 9992, entryPoints: [
            {peerId: Uint8Array.from([1,2,3]), type: NodeType.NODEJS, websocket: {ip:'localhost', port: 123} }
        ]  } )
       
        await expect(connectionManager.start())
            .rejects
            .toThrow('Failed to connect to the entrypoints')
        
        await connectionManager.stop()
    })
    */

    it('Can probe connectivity in open internet', async () => {
        const connectionManager = new ConnectionManager( { webSocketHost:'localhost', webSocketPort: 9993 } )
       
        const result = await connectionManager.start()

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        const connectionManager2 = new ConnectionManager( { webSocketPort: 9994, entryPoints: [
            {peerId: Uint8Array.from([1,2,3]), type: NodeType.NODEJS, websocket: {ip:'localhost', port: 9993} }
        ]  } )

        const result2 = await connectionManager2.start()

        expect(result2.ip).toEqual('127.0.0.1')
        expect(result2.openInternet).toEqual(true)

        await connectionManager.stop()
        await connectionManager2.stop()
    })

    afterAll(async () => { 
    })
})