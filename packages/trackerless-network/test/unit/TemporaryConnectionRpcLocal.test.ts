import { getDhtAddressFromRaw } from '@streamr/dht/dist/src/identifiers'
import { TemporaryConnectionRpcLocal } from '../../src/logic/temporary-connection/TemporaryConnectionRpcLocal'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor } from '../utils/utils'
import { ListeningRpcCommunicator } from '@streamr/dht'

describe('TemporaryConnectionRpcLocal', () => {

    const peerDescriptor = createMockPeerDescriptor()
    let rpcCommunicator: ListeningRpcCommunicator
    let rpcLocal: TemporaryConnectionRpcLocal

    beforeEach(() => {
        rpcCommunicator = new ListeningRpcCommunicator('mock', new MockTransport())
        rpcLocal = new TemporaryConnectionRpcLocal({
            localPeerDescriptor: peerDescriptor,
            rpcCommunicator
        })

    })

    afterEach(() => {
        rpcCommunicator.destroy()
    })

    it('Open Connection', async () => {
        const caller = createMockPeerDescriptor()
        await rpcLocal.openConnection(peerDescriptor, { incomingSourceDescriptor: caller } as any)
        expect(rpcLocal.getNodes().get(getDhtAddressFromRaw(caller.nodeId))).toBeDefined()
    })

    it('Open and Close Connection', async () => {
        const caller = createMockPeerDescriptor()
        await rpcLocal.openConnection(peerDescriptor, { incomingSourceDescriptor: caller } as any)
        expect(rpcLocal.getNodes().get(getDhtAddressFromRaw(caller.nodeId))).toBeDefined()
        await rpcLocal.closeConnection({}, { incomingSourceDescriptor: caller } as any)
        expect(rpcLocal.getNodes().get(getDhtAddressFromRaw(caller.nodeId))).toBeUndefined()
    })

})
