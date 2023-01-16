import { ConnectionType, IConnection } from "../IConnection"
import { Simulator } from "./Simulator"
import { Message, PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc"
import { Connection } from "../Connection"
import { Logger } from "@streamr/utils"
import { protoToString } from "../../helpers/protoToString"

const logger = new Logger(module)

export class SimulatorConnection extends Connection implements IConnection {

    private stopped = false
   
    constructor(public ownPeerDescriptor: PeerDescriptor, private targetPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        private simulator: Simulator) {
        super(connectionType)

        this.send = this.send.bind(this)
        this.close = this.close.bind(this)
        this.connect = this.connect.bind(this)
        this.handleIncomingData = this.handleIncomingData.bind(this)
        this.handleIncomingDisconnection = this.handleIncomingDisconnection.bind(this)
        this.destroy = this.destroy.bind(this)
        this.doDisconnect = this.doDisconnect.bind(this)
    }

    public send(data: Uint8Array): void {
        logger.info('send()')
        if (!this.stopped) {
            
            this.simulator.send(this, data)
            
        } else {
            logger.error('tried to send() on a stopped connection')
        }
    }

    public async close(): Promise<void> {
        if (!this.stopped) {
            logger.info(this.ownPeerDescriptor.nodeName + ' close()')
            this.stopped = true

            try {
                await this.simulator.disconnect(this)
            } catch (_e) {
                console.error('close aborted')
            } finally {
                this.doDisconnect()
            }
            
        } else {
            logger.error('tried to close() a stopped connection')
        }
    }

    public connect(): void {
        if (!this.stopped) {
            logger.info('connect() called')
            
            this.simulator.connect(this, this.targetPeerDescriptor, (error?: string) => {
                if (error) {
                    logger.error(error)
                    this.doDisconnect()
                } else {
                    this.emit('connected')
                } 
            })
        } else {
            logger.error('tried to connect() a stopped connection')
        }
    }

    public handleIncomingData(data: Uint8Array): void {
        //logger.info('received data: ' + this.ownPeerDescriptor.nodeName + ', ' + this.targetPeerDescriptor.nodeName)
        if (!this.stopped) {
            logger.info('handleIncomingData()')
            logger.info(protoToString(Message.fromBinary(data), Message))
            this.emit('data', data)
        } else {
            logger.error('tried to call handleIncomingData() a stopped connection')
        }
    }

    public handleIncomingDisconnection(): void {
        if (!this.stopped) {
            logger.info(this.ownPeerDescriptor.nodeName + ' handleIncomingDisconnection()')
            this.stopped = true
            this.doDisconnect()
        } else {
            logger.error('tried to call handleIncomingDisconnection() a stopped connection')
        }
    }

    public destroy(): void {
        if (!this.stopped) {
            logger.info(this.ownPeerDescriptor.nodeName + ' destroy()')
            this.removeAllListeners()
            this.close().catch((_e) => { })
        } else {
            logger.error(this.ownPeerDescriptor.nodeName + ' tried to call destroy() a stopped connection')
        }
    }

    private doDisconnect() {
        logger.info(this.ownPeerDescriptor.nodeName + ' doDisconnect()')
        this.stopped = true
        this.emit('disconnected')
        this.removeAllListeners()
    }
}
