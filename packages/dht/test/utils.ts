import { DhtNode } from '../src/dht/DhtNode'
import { generateId } from '../src/dht/helpers'
import { DhtTransportClient } from '../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../src/transport/DhtTransportServer'
import { MockConnectionManager } from '../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../src/proto/DhtRpc.client'

export const createMockConnectionDhtNode = (stringId: string): DhtNode => {
    const id = generateId(stringId)
    const clientTransport = new DhtTransportClient()
    const serverTransport = new DhtTransportServer()
    const mockConnectionLayer = new MockConnectionManager()
    const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
    const client = new DhtRpcClient(clientTransport)
    return new DhtNode(id, client, clientTransport, serverTransport, rpcCommunicator)
}
