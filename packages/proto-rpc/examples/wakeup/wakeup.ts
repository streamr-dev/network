import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
// eslint-disable-next-line import/no-extraneous-dependencies
import { RpcCommunicator, ProtoCallContext, toProtoRpcClient, ProtoRpcClient } from '@streamr/proto-rpc'
import { IWakeUpRpcService } from './proto/WakeUpRpc.server'
import { WakeUpRequest } from './proto/WakeUpRpc'
import { WakeUpRpcServiceClient } from './proto/WakeUpRpc.client'
import { Empty } from './proto/google/protobuf/empty'

// Rpc service
class WakeUpService implements IWakeUpRpcService {

    public nodeId: string

    constructor(nodeId: string) {
        this.nodeId = nodeId
        this.wakeUp = this.wakeUp.bind(this)
    }

    // You always have return google.protobuf.Empty from notifications
    async wakeUp(request: WakeUpRequest, _context: ServerCallContext): Promise<Empty> {
        // eslint-disable-next-line no-console
        console.log('WakeUp notification of node ' + this.nodeId + ' called with reason: ' + request.reason)
        const ret: Empty = {}
        return ret
    }
}

class Node {

    public nodeId: string
    public communicator: RpcCommunicator
    private client: ProtoRpcClient<WakeUpRpcServiceClient>
    private service: WakeUpService

    constructor(nodeId: string) {
        this.nodeId = nodeId
        this.communicator = new RpcCommunicator()
        this.client = toProtoRpcClient(new WakeUpRpcServiceClient(this.communicator.getRpcClientTransport()))
        this.service = new WakeUpService(nodeId)
        this.communicator.registerRpcNotification(WakeUpRequest, 'wakeUp', this.service.wakeUp)
    }

    public wakeUpOtherNode(targetNodeId: string, reason: string) {
        // pass targetNodeId in CallContext
        this.client.wakeUp({ reason: reason }, {
            targetNodeId,
            // By setting the notification flag the client will not wait for a response from the server
            // and the server will know not to send a response.
            notification: true
        })
    }
}
const run = async () => {

    const nodes: Record<string, Node> = {}

    const emulateNetwork = (msgBody: Uint8Array, _requestId: string, callContext?: ProtoCallContext) => {

        // Pass the message to the right based on targetNodeId passed in the context
        if (callContext!.targetNodeId) {
            const targetNodeId = callContext!['targetNodeId'] as string
            nodes[targetNodeId].communicator.handleIncomingMessage(msgBody)
        }
    }
    // Setup nodes

    nodes['1'] = new Node('1')
    nodes['1'].communicator.on('outgoingMessage', emulateNetwork) 

    nodes['2'] = new Node('2')
    nodes['2'].communicator.on('outgoingMessage', emulateNetwork)

    nodes['3'] = new Node('3')
    nodes['3'].communicator.on('outgoingMessage', emulateNetwork)

    nodes['1'].wakeUpOtherNode('2', 'Notification from node 1')
    nodes['3'].wakeUpOtherNode('1', 'Notification from node 3')

    nodes['1'].communicator.stop()
    nodes['2'].communicator.stop()
    nodes['3'].communicator.stop()
   
}

run()
