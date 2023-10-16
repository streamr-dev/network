import { ConnectionType, IConnection } from '../IConnection'
import { Simulator } from './Simulator'
import { Message, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Connection } from '../Connection'
import { Logger } from '@streamr/utils'
import { protoToString } from '../../helpers/protoToString'
import { DisconnectionType } from '../../transport/ITransport'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

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
            logger.error(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) +
                'tried to send() on a stopped connection')
        }
    }

    public async close(disconnectionType: DisconnectionType): Promise<void> {
        logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) + ' close()')

        if (!this.stopped) {
            logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) + ' close() not stopped')
            this.stopped = true

            try {
                logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) +
                    ' close() calling simulator.disconnect()')
                this.simulator.close(this)
                logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) +
                    ' close() simulator.disconnect returned')
            } catch (e) {
                logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) +
                    'close aborted' + e)
            } finally {
                logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) +
                    ' calling this.doDisconnect')
                this.doDisconnect(disconnectionType)
            }

        } else {
            logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) +
                ' close() tried to close a stopped connection')
        }
    }

    public connect(): void {
        if (!this.stopped) {
            logger.trace('connect() called')

            this.simulator.connect(this, this.targetPeerDescriptor, (error?: string) => {
                if (error) {
                    logger.trace(error)
                    this.doDisconnect('OTHER')
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
            logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ' handleIncomingDisconnection()')
            this.stopped = true
            this.doDisconnect('OTHER')
        } else {
            logger.trace('tried to call handleIncomingDisconnection() a stopped connection')
        }
    }

    public destroy(): void {
        if (!this.stopped) {
            logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ' destroy()')
            this.removeAllListeners()
            this.close('OTHER').catch((_e) => { })
        } else {
            logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ' tried to call destroy() a stopped connection')
        }
    }

    private doDisconnect(disconnectionType: DisconnectionType) {
        logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ' doDisconnect()')
        this.stopped = true

        logger.trace(keyFromPeerDescriptor(this.ownPeerDescriptor) + ', ' + keyFromPeerDescriptor(this.targetPeerDescriptor) + ' doDisconnect emitting')

        this.emit('disconnected', disconnectionType)

    }
}
