//import { DhtNode } from "../dht/DhtNode"
import { PeerID } from "../helpers/PeerID"
import { Message, PeerDescriptor } from "../proto/DhtRpc"
import { MockConnectionManager } from "./MockConnectionManager"

export class Simulator {

    //private static singleton: Simulator
    //private nodes: { [id: string]: DhtNode } = {}
    private connectionManagers: { [id: string]: MockConnectionManager } = {}
    
    private latenciesEnabled = false

    /*
    addNode(node: DhtNode): void {
        this.nodes[node.getNodeId().toMapKey()] = node
    }
    */

    addConnectionManager(manager: MockConnectionManager): void {
        this.connectionManagers[PeerID.fromValue(manager.getPeerDescriptor().peerId).toMapKey()] = manager
    }

    send(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor, msg: Message): void {
        if (this.latenciesEnabled) {
            setTimeout(() => {
                this.connectionManagers[PeerID.fromValue(targetDescriptor.peerId).toMapKey()].handleIncomingMessage(sourceDescriptor, msg)
            }
            , Math.random() * (250 - 5) + 5)
        }
        else {
            this.connectionManagers[PeerID.fromValue(targetDescriptor.peerId).toMapKey()].handleIncomingMessage(sourceDescriptor, msg)
        }
    }

    enableLatencies(): void {
        this.latenciesEnabled = true
    }

}