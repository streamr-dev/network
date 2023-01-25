import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { IConnectionLockerClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { LockRequest, UnlockRequest, PeerDescriptor, DisconnectNotice } from '../proto/packages/dht/protos/DhtRpc'
import { DhtRpcOptions } from '../rpc-protocol/DhtRpcOptions'
import { PeerID } from '../helpers/PeerID'

import * as Err from '../helpers/errors'

const logger = new Logger(module)

export class RemoteConnectionLocker {
    private peerId: PeerID
    private ownPeerDescriptor: PeerDescriptor
    private targetPeerDescriptor: PeerDescriptor
    private protocolVersion: string
    private client: ProtoRpcClient<IConnectionLockerClient>

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        targetPeerDescriptor: PeerDescriptor,
        protocolVersion: string,
        client: ProtoRpcClient<IConnectionLockerClient>
    ) {
        this.peerId = PeerID.fromValue(targetPeerDescriptor.kademliaId)
        this.ownPeerDescriptor = ownPeerDescriptor
        this.targetPeerDescriptor = targetPeerDescriptor
        this.protocolVersion = protocolVersion
        this.client = client
    }

    public async lockRequest(serviceId: string): Promise<boolean> {
        logger.trace(`Requesting locked connection to ${this.targetPeerDescriptor.kademliaId.toString()}`)
        const request: LockRequest = {
            peerDescriptor: this.ownPeerDescriptor,
            protocolVersion: this.protocolVersion,
            serviceId
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.targetPeerDescriptor
        }
        try {
            const res = await this.client.lockRequest(request, options)
            return res.accepted
        } catch (err) {
            logger.debug(new Err.ConnectionLocker('Connection lock rejected', err).stack!)
            return false
        }
    }

    public unlockRequest(serviceId: string): void {
        logger.trace(`Requesting connection to be unlocked from ${this.targetPeerDescriptor.kademliaId.toString()}`)
        const request: UnlockRequest = {
            peerDescriptor: this.ownPeerDescriptor,
            protocolVersion: this.protocolVersion,
            serviceId
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.targetPeerDescriptor as PeerDescriptor,
            notification: true
        }

        this.client.unlockRequest(request, options).catch((_e) => {
            logger.trace('failed to send unlockRequest')
        })
    }

    public async gracefulDisconnect(): Promise<void> {
        logger.trace(`Notifying a graceful disconnect to ${this.targetPeerDescriptor.kademliaId.toString()}`)
        const request: DisconnectNotice = {
            peerDescriptor: this.ownPeerDescriptor,
            protocolVersion: this.protocolVersion
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.targetPeerDescriptor,
            notification: true,
            doNotConnect: true
        }

        try {
            await this.client.gracefulDisconnect(request, options)
        } catch (e) {
            logger.error('Failed to send gracefulDisconnect' + e)
        }
    }
}
