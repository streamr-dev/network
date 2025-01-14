import { ConnectionType, IConnection } from '../IConnection'
import { Simulator } from './Simulator'
import { Message, PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { Connection } from '../Connection'
import { Logger } from '@streamr/utils'
import { protoToString } from '../../helpers/protoToString'
import { toNodeId } from '../../identifiers'

const logger = new Logger(module)

export class SimulatorConnection extends Connection implements IConnection {
    private stopped = false
    public localPeerDescriptor: PeerDescriptor
    private targetPeerDescriptor: PeerDescriptor
    private simulator: Simulator

    constructor(
        localPeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        simulator: Simulator
    ) {
        super(connectionType)

        this.localPeerDescriptor = localPeerDescriptor
        this.setPeerDescriptor(targetPeerDescriptor)
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
            const localNodeId = toNodeId(this.localPeerDescriptor)
            const targetNodeId = toNodeId(this.targetPeerDescriptor)
            logger.error(localNodeId + ', ' + targetNodeId + 'tried to send() on a stopped connection')
        }
    }

    public async close(gracefulLeave: boolean): Promise<void> {
        const localNodeId = toNodeId(this.localPeerDescriptor)
        const targetNodeId = toNodeId(this.targetPeerDescriptor)

        logger.trace(localNodeId + ', ' + targetNodeId + ' close()')
        if (!this.stopped) {
            logger.trace(localNodeId + ', ' + targetNodeId + ' close() not stopped')
            this.stopped = true

            try {
                logger.trace(localNodeId + ', ' + targetNodeId + ' close() calling simulator.disconnect()')
                this.simulator.close(this)
                logger.trace(localNodeId + ', ' + targetNodeId + ' close() simulator.disconnect returned')
            } catch (e) {
                logger.trace(localNodeId + ', ' + targetNodeId + 'close aborted' + e)
            } finally {
                logger.trace(localNodeId + ', ' + targetNodeId + ' calling this.doDisconnect')
                this.doDisconnect(gracefulLeave)
            }
        } else {
            logger.trace(localNodeId + ', ' + targetNodeId + ' close() tried to close a stopped connection')
        }
    }

    public connect(): void {
        if (!this.stopped) {
            logger.trace('connect() called')

            this.simulator.connect(this, this.targetPeerDescriptor, (error?: string) => {
                if (error !== undefined) {
                    logger.trace(error)
                    this.doDisconnect(false)
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
            logger.trace('handleIncomingData() ' + protoToString(Message.fromBinary(data), Message))
            this.emit('data', data)
        } else {
            logger.trace('tried to call handleIncomingData() a stopped connection')
        }
    }

    public handleIncomingDisconnection(): void {
        if (!this.stopped) {
            const localNodeId = toNodeId(this.localPeerDescriptor)
            logger.trace(localNodeId + ' handleIncomingDisconnection()')
            this.stopped = true
            this.doDisconnect(false)
        } else {
            logger.trace('tried to call handleIncomingDisconnection() a stopped connection')
        }
    }

    public destroy(): void {
        const localNodeId = toNodeId(this.localPeerDescriptor)
        if (!this.stopped) {
            logger.trace(localNodeId + ' destroy()')
            this.removeAllListeners()
            this.close(false).catch((_e) => {})
        } else {
            logger.trace(localNodeId + ' tried to call destroy() a stopped connection')
        }
    }

    private doDisconnect(gracefulLeave: boolean) {
        const localNodeId = toNodeId(this.localPeerDescriptor)
        const targetNodeId = toNodeId(this.targetPeerDescriptor)
        logger.trace(localNodeId + ' doDisconnect()')
        this.stopped = true

        logger.trace(localNodeId + ', ' + targetNodeId + ' doDisconnect emitting')

        this.emit('disconnected', gracefulLeave)
    }
}
