import { DhtNode } from "../dht/DhtNode"
import { PeerID } from "../helpers/PeerID"
import { Message, PeerDescriptor } from "../proto/DhtRpc"

export class Simulator {

    //private static singleton: Simulator
    private nodes: { [id: string]: DhtNode } = {}
    private latenciesEnabled = false

    /*
    private constructor() { }

    public static instance(): Simulator {
        if (!Simulator.singleton) {
            Simulator.singleton = new Simulator()
        }
        return Simulator.singleton
    }
    */

    addNode(node: DhtNode): void {
        this.nodes[node.getNodeId().toString()] = node
    }

    send(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor, msg: Message): void {
        if (this.latenciesEnabled) {
            setTimeout(() => {
                this.nodes[PeerID.fromValue(targetDescriptor.peerId).toString()].getRpcCommunicator().onIncomingMessage(sourceDescriptor, msg)
            }
            , Math.random() * (250 - 5) + 5)
        }
        else {
            this.nodes[PeerID.fromValue(targetDescriptor.peerId).toString()].getRpcCommunicator().onIncomingMessage(sourceDescriptor, msg)
        }
    }

    enableLatencies(): void {
        this.latenciesEnabled = true
    }

}