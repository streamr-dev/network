import { EventEmitter } from 'eventemitter3'
import { DhtAddress, toDhtAddress, toNodeId } from '../../src/identifiers'
import { Message, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
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
        const targetNodeId = toNodeId(msg.targetDescriptor!)
        if (connect && !this.connections.some((c) => toNodeId(c) === targetNodeId)) {
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

    getConnectionCount(): number {
        return this.connections.length
    }

    hasConnection(nodeId: DhtAddress): boolean {
        return this.connections.some((c) => toNodeId(c) === nodeId)
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void | Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    getDiagnosticInfo(): Record<string, unknown> {
        return {}
    }
}

export class FakeEnvironment {
    private transports: FakeTransport[] = []

    createTransport(peerDescriptor: PeerDescriptor): FakeTransport {
        const transport = new FakeTransport(peerDescriptor, (msg) => {
            const targetNode = toDhtAddress(msg.targetDescriptor!.nodeId)
            const targetTransport = this.transports.find((t) => toNodeId(t.getLocalPeerDescriptor()) === targetNode)
            if (targetTransport !== undefined) {
                targetTransport.emit('message', msg)
            }
        })
        this.transports.push(transport)
        return transport
    }
}
