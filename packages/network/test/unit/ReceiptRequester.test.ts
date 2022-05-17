import { ReceiptRequester } from '../../src/logic/receipts/ReceiptRequester'
import { DUMMY_SIGNATURE_FUNCTIONS } from '../../src/logic/receipts/SignatureFunctions'
import EventEmitter from 'eventemitter3'
import { NodeId } from '../../src/identifiers'
import { ControlMessage } from 'streamr-client-protocol'
import { NodeToNode } from '../../src/protocol/NodeToNode'

describe(ReceiptRequester, () => {
    let nodeToNode: EventEmitter & { send: jest.Mock<any, [NodeId, ControlMessage]> }
    let requester: ReceiptRequester

    beforeEach(() => {
        nodeToNode = new class extends EventEmitter {} as any
        nodeToNode.send = jest.fn()
        requester = new ReceiptRequester({
            myNodeId: 'nodeId',
            nodeToNode: nodeToNode as unknown as NodeToNode,
            signatureFunctions: DUMMY_SIGNATURE_FUNCTIONS,
            windowTimeoutMargin: 10,
            bucketUpdateTimeoutMargin: 10
        })
    })
})
