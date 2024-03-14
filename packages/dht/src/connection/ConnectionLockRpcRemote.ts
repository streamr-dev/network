import { Logger } from '@streamr/utils'
import { RpcRemote } from '../dht/contact/RpcRemote'
import { DisconnectMode, DisconnectNotice, LockRequest, UnlockRequest } from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionLockRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { LockID } from './ConnectionLockHandler'
import { getNodeIdFromPeerDescriptor } from '../identifiers'

const logger = new Logger(module)

export class ConnectionLockRpcRemote extends RpcRemote<ConnectionLockRpcClient> {

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
            logger.debug('Connection lock rejected', { err })
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
            connect: false,
            sendIfStopped: true,
            timeout: 2000  // TODO use config option or named constant?
        })
        await this.getClient().gracefulDisconnect(request, options)
    }
}
