import { Logger } from '@streamr/utils'
import { RpcRemote } from '../dht/contact/RpcRemote'
import {
    DisconnectMode,
    DisconnectNotice,
    LockRequest,
    UnlockRequest,
    SetPrivateRequest
} from '../../generated/packages/dht/protos/DhtRpc'
import { ConnectionLockRpcClient } from '../../generated/packages/dht/protos/DhtRpc.client'
import { LockID } from './ConnectionLockStates'
import { toNodeId } from '../identifiers'

const logger = new Logger(module)

export class ConnectionLockRpcRemote extends RpcRemote<ConnectionLockRpcClient> {
    public async lockRequest(lockId: LockID): Promise<boolean> {
        logger.trace(`Requesting locked connection to ${toNodeId(this.getPeerDescriptor())}`)
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
        logger.trace(`Requesting connection to be unlocked from ${toNodeId(this.getPeerDescriptor())}`)
        const request: UnlockRequest = {
            lockId
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient()
            .unlockRequest(request, options)
            .catch((_e) => {
                logger.trace('failed to send unlockRequest')
            })
    }

    public async gracefulDisconnect(disconnectMode: DisconnectMode): Promise<void> {
        logger.trace(`Notifying a graceful disconnect to ${toNodeId(this.getPeerDescriptor())}`)
        const request: DisconnectNotice = {
            disconnectMode
        }
        const options = this.formDhtRpcOptions({
            connect: false,
            sendIfStopped: true,
            timeout: 2000 // TODO use options option or named constant?
        })
        await this.getClient().gracefulDisconnect(request, options)
    }

    public async setPrivate(isPrivate: boolean): Promise<void> {
        logger.trace(`Setting isPrivate: ${isPrivate} for ${toNodeId(this.getPeerDescriptor())}`)
        const request: SetPrivateRequest = {
            isPrivate
        }
        const options = this.formDhtRpcOptions({
            connect: false,
            notification: true
        })
        await this.getClient().setPrivate(request, options)
    }
}
