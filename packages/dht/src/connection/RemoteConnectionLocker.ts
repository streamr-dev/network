import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { IConnectionLockerClient } from '../proto/DhtRpc.client'
import { LockRequest, UnlockRequest, PeerDescriptor, DisconnectNotice } from '../proto/DhtRpc'
import { DhtRpcOptions } from '../rpc-protocol/DhtRpcOptions'
import { PeerID } from '../helpers/PeerID'

import * as Err from '../helpers/errors'

const logger = new Logger(module)

export class RemoteConnectionLocker {
    private peerId: PeerID

    constructor(
        private peerDescriptor: PeerDescriptor,
        private protocolVersion: string,
        private client: ProtoRpcClient<IConnectionLockerClient>
    ) {
        this.peerId = PeerID.fromValue(peerDescriptor.peerId)
    }

    public async lockRequest(sourceDescriptor: PeerDescriptor, serviceId: string): Promise<boolean> {
        logger.trace(`Requesting locked connection to ${this.peerDescriptor.peerId.toString()}`)
        const request: LockRequest = {
            peerDescriptor: sourceDescriptor,
            protocolVersion: this.protocolVersion,
            serviceId
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor
        }
        try {
            const res = await this.client.lockRequest(request, options)
            return res.accepted
        } catch (err) {
            logger.debug(new Err.ConnectionLocker('Connection lock rejected', err).stack!)
            return false
        }
    }

    public unlockRequest(sourceDescriptor: PeerDescriptor, serviceId: string): void {
        logger.trace(`Requesting connection to be unlocked from ${this.peerDescriptor.peerId.toString()}`)
        const request: UnlockRequest = {
            peerDescriptor: sourceDescriptor,
            protocolVersion: this.protocolVersion,
            serviceId
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            notification: true
        }

        this.client.unlockRequest(request, options).catch((_e) => {
            logger.trace('failed to send unlockRequest')
        })
    }

    public async gracefulDisconnect(sourceDescriptor: PeerDescriptor): Promise<void> {
        logger.trace(`Notifying a graceful disconnect to ${this.peerDescriptor.peerId.toString()}`)
        const request: DisconnectNotice = {
            peerDescriptor: sourceDescriptor,
            protocolVersion: this.protocolVersion
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            notification: true
        }

        try {
            await this.client.gracefulDisconnect(request, options)
        } catch (_e) {
            logger.trace('Faled to send gracefulDisconnect')
        }
    }
}
