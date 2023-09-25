import { Simulator, PeerDescriptor, NodeType, SimulatorTransport } from "@streamr/dht"
import { NetworkStack } from "../../src/NetworkStack"
import { IInfoRpcClient } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc.client"
import { hexToBinary } from "../../../utils/dist/src/binaryUtils"
import { createRandomNodeId } from "../utils/utils"
import { RemoteInfoRpcServer } from "../../src/logic/info-rpc/RemoteInfoRpcServer"

describe('NetworkStack InfoRpc', () => {

    let stack1: NetworkStack
    let stack2: NetworkStack
    let remoteInfoRpcServer: RemoteInfoRpcServer
    let transport1: SimulatorTransport
    let transport2: SimulatorTransport
    let transport3: SimulatorTransport

    let simulator: Simulator

    const stack1PeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }

    const stack2PeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }

    const stack3PeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }


    beforeEach(async () => {
        simulator = new Simulator()
        transport1 = new SimulatorTransport(stack1PeerDescriptor, simulator)
        transport2 = new SimulatorTransport(stack2PeerDescriptor, simulator)
        transport3 = new SimulatorTransport(stack3PeerDescriptor, simulator)
        stack1 = new NetworkStack({
            layer0: {
                simulator,
                peerDescriptor: stack1PeerDescriptor,
                entryPoints: [stack1PeerDescriptor]
            }
        })
        stack2 = new NetworkStack({
            layer0: {
                simulator,
                peerDescriptor: stack2PeerDescriptor,
                entryPoints: [stack1PeerDescriptor]
            }
        })
        await stack1.start()
        await stack2.start()
        await transport3.start()
        remoteInfoRpcServer = new RemoteInfoRpcServer()
    })

    afterEach(() => {

    })
})