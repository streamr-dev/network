import { ProxyStreamConnectionServer } from '../../src/logic/proxy/ProxyStreamConnectionServer'
import { StreamPartManager } from '../../src/logic/StreamPartManager'
import { NodeToNode } from '../../src/protocol/NodeToNode'
import { Propagation } from '../../src/logic/propagation/Propagation'
import { Node } from '../../src/logic/Node'
import { mock } from 'jest-mock-extended'
import { toStreamID, toStreamPartID } from '@streamr/protocol'

const streamPartId = toStreamPartID(toStreamID('test.ens/foobar'), 0)

describe('ProxyStreamConnectionServer', () => {
    let connectionServer: ProxyStreamConnectionServer

    beforeEach(() => {
        connectionServer = new ProxyStreamConnectionServer({
            streamPartManager: new StreamPartManager(),
            nodeToNode: mock<NodeToNode>(),
            propagation: mock<Propagation>(),
            node: mock<Node>(),
            acceptProxyConnections: true
        })
    })

    afterEach(() => {
        connectionServer.stop()
    })

    it('getNodeIdsForUserId returns empty array on non-existing stream part', () => {
        const actual = connectionServer.getNodeIdsForUserId(streamPartId, 'aaa')
        expect(actual).toEqual([])
    })
})
