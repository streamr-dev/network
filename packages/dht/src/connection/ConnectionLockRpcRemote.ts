import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { IConnectionLockRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { LockRequest, UnlockRequest, PeerDescriptor, DisconnectNotice, DisconnectMode } from '../proto/packages/dht/protos/DhtRpc'
import * as Err from '../helpers/errors'
import { getNodeIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { RpcRemote } from '../dht/contact/RpcRemote'
import { LockID } from './ConnectionLockHandler'

const logger = new Logger(module)

export class ConnectionLockRpcRemote extends RpcRemote<IConnectionLockRpcClient> {

    constructor(
        localPeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<IConnectionLockRpcClient>
    ) {
        super(localPeerDescriptor, targetPeerDescriptor, 'DUMMY', client)
    }

    public async lockRequest(lockId: LockID): Promise<boolean> {
        logger.trace(`Requesting locked connection to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: LockRequest = {
            lockId
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

    public unlockRequest(lockId: LockID): void {
        logger.trace(`Requesting connection to be unlocked from ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: UnlockRequest = {
            lockId
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().unlockRequest(request, options).catch((_e) => {
            logger.trace('failed to send unlockRequest')
        })
    }

    public async gracefulDisconnect(disconnectMode: DisconnectMode): Promise<void> {
        logger.trace(`Notifying a graceful disconnect to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())}`)
        const request: DisconnectNotice = {
            disconnectMode
        }
        const options = this.formDhtRpcOptions({
            doNotConnect: true,
            doNotMindStopped: true,
            timeout: 2000
        })
        await this.getClient().gracefulDisconnect(request, options)
    }
}
