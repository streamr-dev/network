import { ConnectionType, IConnection } from "../IConnection"
import { Simulator } from "./Simulator"
import { PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc"
import { Connection } from "../Connection"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

export class SimulatorConnection extends Connection implements IConnection {

    private stopped = false

    constructor(public ownPeerDescriptor: PeerDescriptor, private targetPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        private simulator: Simulator) {
        super(connectionType)

        this.close = this.close.bind(this)
    }

    public send(data: Uint8Array): void {
        if (!this.stopped) {
            this.simulator.send(this, data)
                .then(() => {
                    return
                }).catch((e) => {
                    logger.error('send() failed ' + e)

                    this.doDisconnect()
                })
        } else {
            logger.error('tried to send() on a stopped connection')
        }
    }

    public close(): void {
        if (!this.stopped) {
            this.simulator.disconnect(this)
                .finally(() => {
                    this.doDisconnect()
                }).catch((_e) => { })
        } else {
            logger.error('tried to close() a stopped connection')
        }
    }

    public connect(): void {
        if (!this.stopped) {
            this.simulator.connect(this, this.targetPeerDescriptor)
                .then(() => {
                    this.emit('connected')
                    return
                }).catch((_e) => {
                    this.doDisconnect()
                })
        } else {
            logger.error('tried to connect() a stopped connection')
        }
    }

    public handleIncomingData(data: Uint8Array): void {
        //logger.info('received data: ' + this.ownPeerDescriptor.nodeName + ', ' + this.targetPeerDescriptor.nodeName)
        if (!this.stopped) {
            this.emit('data', data)
        } else {
            logger.error('tried to call handleIncomingData() a stopped connection')
        }
    }

    public handleIncomingDisconnection(): void {
        if (!this.stopped) {
            this.doDisconnect()
        } else {
            logger.error('tried to call handleIncomingDisconnection() a stopped connection')
        }
    }

    public destroy(): void {
        if (!this.stopped) {
            this.removeAllListeners()
            this.close()
        } else {
            logger.error('tried to call destroy() a stopped connection')
        }
    }

    private doDisconnect() {
        this.stopped = true
        this.emit('disconnected')
        this.removeAllListeners()
    }
}
