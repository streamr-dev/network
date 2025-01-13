import { until } from '@streamr/utils'
import { range } from 'lodash'
import { RecursiveOperationSession } from '../../src/dht/recursive-operation/RecursiveOperationSession'
import { RecursiveOperationSessionRpcRemote } from '../../src/dht/recursive-operation/RecursiveOperationSessionRpcRemote'
import { ServiceID } from '../../src/types/ServiceID'
import { randomDhtAddress } from '../../src/identifiers'
import { Message, PeerDescriptor, RecursiveOperation } from '../../generated/packages/dht/protos/DhtRpc'
import { RecursiveOperationSessionRpcClient } from '../../generated/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../src/transport/RoutingRpcCommunicator'
import { FakeEnvironment } from '../utils/FakeTransport'
import { createMockPeerDescriptor } from '../utils/utils'

describe('RecursiveOperationSession', () => {
    let environment: FakeEnvironment
    let localPeerDescriptor: PeerDescriptor

    const createRpcRemote = (serviceId: ServiceID) => {
        const mockPeerDescriptor = createMockPeerDescriptor()
        const transport = environment.createTransport(mockPeerDescriptor)
        const send = (msg: Message) => transport.send(msg)
        return new RecursiveOperationSessionRpcRemote(
            mockPeerDescriptor,
            localPeerDescriptor,
            new RoutingRpcCommunicator(serviceId, send),
            RecursiveOperationSessionRpcClient
        )
    }

    beforeEach(() => {
        environment = new FakeEnvironment()
        localPeerDescriptor = createMockPeerDescriptor()
    })

    it('happy path', async () => {
        const doRouteRequest = jest.fn()
        const session = new RecursiveOperationSession({
            transport: environment.createTransport(localPeerDescriptor),
            targetId: randomDhtAddress(),
            localPeerDescriptor,
            waitedRoutingPathCompletions: 3,
            operation: RecursiveOperation.FIND_CLOSEST_NODES,
            doRouteRequest
        })
        const onCompleted = jest.fn()
        session.on('completed', onCompleted)

        session.start('')
        expect(doRouteRequest).toHaveBeenCalled()
        range(3).forEach(() => {
            const remote = createRpcRemote(session.getId())
            remote.sendResponse(
                [createMockPeerDescriptor(), createMockPeerDescriptor()],
                [createMockPeerDescriptor(), createMockPeerDescriptor()],
                [],
                true
            )
        })

        // TODO now waits for the 4s timeout, could setup test so that it completes by receiving
        // all data it wants
        await until(() => onCompleted.mock.calls.length > 0)
        const result = session.getResults()
        // TODO assert peer descriptors
        expect(result.closestNodes).toHaveLength(6)
        expect(result.dataEntries).toEqual([])
    })
})
