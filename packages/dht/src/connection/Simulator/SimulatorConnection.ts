import { ConnectionType, IConnection } from "../IConnection"
import { Simulator } from "./Simulator"
import { Message, PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc"
import { Connection } from "../Connection"
import { Logger } from "@streamr/utils"
import { protoToString } from "../../helpers/protoToString"

const logger = new Logger(module)

export class SimulatorConnection extends Connection implements IConnection {

    private stopped = false
    public ownPeerDescriptor: PeerDescriptor
    private targetPeerDescriptor: PeerDescriptor
    private simulator: Simulator

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        simulator: Simulator
    ) {
        super(connectionType)

        this.ownPeerDescriptor = ownPeerDescriptor
        this.targetPeerDescriptor = targetPeerDescriptor
        this.connectionType = connectionType
        this.simulator = simulator

        this.send = this.send.bind(this)
        this.close = this.close.bind(this)
        this.connect = this.connect.bind(this)
        this.handleIncomingData = this.handleIncomingData.bind(this)
        this.handleIncomingDisconnection = this.handleIncomingDisconnection.bind(this)
        this.destroy = this.destroy.bind(this)
        this.doDisconnect = this.doDisconnect.bind(this)
    }

    public send(data: Uint8Array): void {
        logger.trace('send()')
        if (!this.stopped) {
            
            this.simulator.send(this, data)
            
        } else {
            logger.error('tried to send() on a stopped connection')
        }
    }

    public async close(): Promise<void> {
        if (!this.stopped) {
            logger.trace(this.ownPeerDescriptor.nodeName + ' close()')
            this.stopped = true

            try {
                await this.simulator.disconnect(this)
            } catch (_e) {
                console.error('close aborted')
            } finally {
                this.doDisconnect()
            }
            
        } else {
            logger.trace('tried to close() a stopped connection')
        }
    }

    public connect(): void {
        if (!this.stopped) {
            logger.trace('connect() called')
            
            this.simulator.connect(this, this.targetPeerDescriptor, (error?: string) => {
                if (error) {
                    logger.trace(error)
                    this.doDisconnect()
                } else {
                    this.emit('connected')
                } 
            })
        } else {
            logger.trace('tried to connect() a stopped connection')
        }
    }

    public handleIncomingData(data: Uint8Array): void {
        if (!this.stopped) {
            logger.trace('handleIncomingData()')
            logger.trace(protoToString(Message.fromBinary(data), Message))
            this.emit('data', data)
        } else {
            logger.trace('tried to call handleIncomingData() a stopped connection')
        }
    }

    public handleIncomingDisconnection(): void {
        if (!this.stopped) {
            logger.trace(this.ownPeerDescriptor.nodeName + ' handleIncomingDisconnection()')
            this.stopped = true
            this.doDisconnect()
        } else {
            logger.trace('tried to call handleIncomingDisconnection() a stopped connection')
        }
    }

    public destroy(): void {
        if (!this.stopped) {
            logger.trace(this.ownPeerDescriptor.nodeName + ' destroy()')
            this.removeAllListeners()
            this.close().catch((_e) => { })
        } else {
            logger.trace(this.ownPeerDescriptor.nodeName + ' tried to call destroy() a stopped connection')
        }
    }

    private doDisconnect() {
        logger.trace(this.ownPeerDescriptor.nodeName + ' doDisconnect()')
        this.stopped = true
        this.emit('disconnected')
        this.removeAllListeners()
    }
}
