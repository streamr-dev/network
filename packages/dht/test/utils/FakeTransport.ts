import { EventEmitter } from 'eventemitter3'
import { DhtAddress, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { Message, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DEFAULT_SEND_OPTIONS, ITransport, SendOptions, TransportEvents } from '../../src/transport/ITransport'
import { ConnectionsView } from '../../src/exports'

// TODO extract ConnectionsView functionality to FakeConnectionsView
class FakeTransport extends EventEmitter<TransportEvents> implements ITransport, ConnectionsView {

    private onSend: (msg: Message) => void
    private readonly localPeerDescriptor: PeerDescriptor
    // currently adds a peerDescription to the connections array when a "connect" option is seen in
    // in send() call and never disconnects (TODO could add some disconnection logic? and maybe
    // the connection should be seen by another FakeTransport instance, too?)
    private connections: PeerDescriptor[] = []

    constructor(peerDescriptor: PeerDescriptor, onSend: (msg: Message) => void) {
        super()
        this.onSend = onSend
        this.localPeerDescriptor = peerDescriptor
    }

    async send(msg: Message, opts?: SendOptions): Promise<void> {
        const connect = opts?.connect ?? DEFAULT_SEND_OPTIONS.connect
        const targetNodeId = getNodeIdFromPeerDescriptor(msg.targetDescriptor!)
        if (connect && !this.connections.some((c) => getNodeIdFromPeerDescriptor(c) === targetNodeId)) {
            this.connect(msg.targetDescriptor!)
        }
        msg.sourceDescriptor = this.localPeerDescriptor
        this.onSend(msg)
    }

    getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
    }

    private connect(peerDescriptor: PeerDescriptor) {
        this.connections.push(peerDescriptor)
        this.emit('connected', peerDescriptor)
    }

    getConnections(): PeerDescriptor[] {
        return this.connections
    }

    // eslint-disable-next-line class-methods-use-this
    getConnectionCount(): number {
        return this.connections.length
    }

    // eslint-disable-next-line class-methods-use-this
    hasConnection(nodeId: DhtAddress): boolean {
        return this.connections.some((c) => getNodeIdFromPeerDescriptor(c) === nodeId)
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void | Promise<void> {
    }

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticsInfo(): Record<string, unknown> {
        return {}
    }
}

export class FakeEnvironment {

    private transports: FakeTransport[] = []

    createTransport(peerDescriptor: PeerDescriptor): FakeTransport {
        const transport = new FakeTransport(peerDescriptor, (msg) => {
            const targetNode = getDhtAddressFromRaw(msg.targetDescriptor!.nodeId)
            const targetTransport = this.transports.find((t) => getNodeIdFromPeerDescriptor(t.getLocalPeerDescriptor()) === targetNode)
            if (targetTransport !== undefined) {
                targetTransport.emit('message', msg)
            }
        })
        this.transports.push(transport)
        return transport
    }
}
