import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { IConnectionLockRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { LockRequest, UnlockRequest, PeerDescriptor, DisconnectNotice, DisconnectMode } from '../proto/packages/dht/protos/DhtRpc'

import * as Err from '../helpers/errors'
import { keyFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { Remote } from '../dht/contact/Remote'

const logger = new Logger(module)

export class ConnectionLockRpcRemote extends Remote<IConnectionLockRpcClient> {

    private protocolVersion: string

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        protocolVersion: string,
        client: ProtoRpcClient<IConnectionLockRpcClient>
    ) {
        super(ownPeerDescriptor, targetPeerDescriptor, 'DUMMY', client)
        this.protocolVersion = protocolVersion
    }

    public async lockRequest(serviceId: string): Promise<boolean> {
        logger.trace(`Requesting locked connection to ${keyFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: LockRequest = {
            peerDescriptor: this.getLocalPeerDescriptor(),
            protocolVersion: this.protocolVersion,
            serviceId
        }
        const options = this.formDhtRpcOptions()
        try {
            const res = await this.getClient().lockRequest(request, options)
            return res.accepted
        } catch (err) {
            logger.debug(new Err.ConnectionLocker('Connection lock rejected', err).stack!)
            return false
        }
    }

    public unlockRequest(serviceId: string): void {
        logger.trace(`Requesting connection to be unlocked from ${keyFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: UnlockRequest = {
            peerDescriptor: this.getLocalPeerDescriptor(),
            protocolVersion: this.protocolVersion,
            serviceId
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().unlockRequest(request, options).catch((_e) => {
            logger.trace('failed to send unlockRequest')
        })
    }

    public async gracefulDisconnect(disconnecMode: DisconnectMode): Promise<void> {
        logger.trace(`Notifying a graceful disconnect to ${keyFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: DisconnectNotice = {
            peerDescriptor: this.getLocalPeerDescriptor(),
            protocolVersion: this.protocolVersion,
            disconnecMode
        }
        const options = this.formDhtRpcOptions({
            doNotConnect: true,
            doNotMindStopped: true,
            timeout: 2000
        })
        await this.getClient().gracefulDisconnect(request, options)
    }
}
