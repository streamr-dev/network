import { ClaimSender } from '../../src/logic/receipts/ClaimSender'
import { DUMMY_SIGNATURE_FUNCTIONS } from '../../src/logic/receipts/SignatureFunctions'
import EventEmitter from 'eventemitter3'
import { NodeId } from '../../src/identifiers'
import { ControlMessage } from 'streamr-client-protocol'
import { NodeToNode } from '../../src/protocol/NodeToNode'

describe(ClaimSender, () => {
    let nodeToNode: EventEmitter & { send: jest.Mock<any, [NodeId, ControlMessage]> }
    let sender: ClaimSender

    beforeEach(() => {
        nodeToNode = new class extends EventEmitter {} as any
        nodeToNode.send = jest.fn()
        sender = new ClaimSender({
            myNodeId: 'nodeId',
            nodeToNode: nodeToNode as unknown as NodeToNode,
            signatureFunctions: DUMMY_SIGNATURE_FUNCTIONS,
            windowTimeoutMargin: 10,
            bucketUpdateTimeoutMargin: 10
        })
    })

    it('')
})
