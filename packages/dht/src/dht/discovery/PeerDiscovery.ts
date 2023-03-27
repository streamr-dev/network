import { DiscoverySession } from './DiscoverySession'
import { DhtPeer } from '../DhtPeer'
import crypto from "crypto"
import * as Err from '../../helpers/errors'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { DhtRpcServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Logger, scheduleAtInterval } from '@streamr/utils'
import KBucket from 'k-bucket'
import { SortedContactList } from '../contact/SortedContactList'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RandomContactList } from '../contact/RandomContactList'

interface PeerDiscoveryConfig {
    rpcCommunicator: RoutingRpcCommunicator
    ownPeerDescriptor: PeerDescriptor
    ownPeerId: PeerID
    bucket: KBucket<DhtPeer>
    connections: Map<PeerIDKey, DhtPeer>
    neighborList: SortedContactList<DhtPeer>
    randomPeers: RandomContactList<DhtPeer>
    openInternetPeers: SortedContactList<DhtPeer>
    joinNoProgressLimit: number
    getClosestContactsLimit: number
    serviceId: string
    parallelism: number
    joinTimeout: number
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    connectionManager?: ConnectionManager
}

const logger = new Logger(module)

export class PeerDiscovery {
    private readonly config: PeerDiscoveryConfig
    private ongoingDiscoverySessions: Map<string, DiscoverySession> = new Map()
    private stopped = false
    private rejoinOngoing = false

    private rejoinTimeoutRef?: NodeJS.Timeout
    private readonly abortController: AbortController

    constructor(config: PeerDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    async joinDht(entryPointDescriptor: PeerDescriptor, doRandomJoin = true): Promise<void> {
        if (this.stopped) {
            return
        }
        logger.info(
            `Joining ${this.config.serviceId === 'layer0' ? 'The Streamr Network' : `Control Layer for ${this.config.serviceId}`}`
            + ` via entrypoint ${keyFromPeerDescriptor(entryPointDescriptor)}`
        )
        const entryPointClient = toProtoRpcClient(new DhtRpcServiceClient(this.config.rpcCommunicator.getRpcClientTransport()))
        const entryPoint = new DhtPeer(this.config.ownPeerDescriptor, entryPointDescriptor, entryPointClient, this.config.serviceId)
        if (this.config.ownPeerId!.equals(entryPoint.getPeerId())) {
            return
        }
        this.config.connectionManager?.lockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
        this.config.addContact(entryPointDescriptor)
        const closest = this.config.bucket.closest(this.config.ownPeerId!.value, this.config.getClosestContactsLimit)
        this.config.neighborList.addContacts(closest)
        const sessionOptions = {
            neighborList: this.config.neighborList!,
            targetId: this.config.ownPeerId!.value,
            ownPeerDescriptor: this.config.ownPeerDescriptor!,
            serviceId: this.config.serviceId,
            rpcCommunicator: this.config.rpcCommunicator!,
            parallelism: this.config.parallelism,
            noProgressLimit: this.config.joinNoProgressLimit,
            newContactListener: (newPeer: DhtPeer) => this.config.addContact(newPeer.getPeerDescriptor()),
            nodeName: this.config.ownPeerDescriptor.nodeName
        }
        const session = new DiscoverySession(sessionOptions)
        const randomSession = doRandomJoin ? new DiscoverySession({
            ...sessionOptions,
            targetId: crypto.randomBytes(8),
            nodeName: this.config.ownPeerDescriptor.nodeName + '-random'
        }) : null
        this.ongoingDiscoverySessions.set(session.sessionId, session)
        if (randomSession) {
            this.ongoingDiscoverySessions.set(randomSession.sessionId, randomSession)
        }
        try {
            await session.findClosestNodes(this.config.joinTimeout)
            if (randomSession) {
                await randomSession.findClosestNodes(this.config.joinTimeout)
            }
            if (!this.stopped) {
                if (this.config.bucket.count() === 0) {
                    this.rejoinDht(entryPointDescriptor).catch(() => {})
                } else {
                    await scheduleAtInterval(() => this.getClosestPeersFromBucket(), 60000, true, this.abortController.signal)
                }
            }
        } catch (_e) {
            throw new Err.DhtJoinTimeout('join timed out')
        } finally {
            this.ongoingDiscoverySessions.delete(session.sessionId)
            if (randomSession) {
                this.ongoingDiscoverySessions.delete(randomSession.sessionId)
            }
            this.config.connectionManager?.unlockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
        }
    }

    public async rejoinDht(entryPoint: PeerDescriptor): Promise<void> {
        if (this.stopped || this.rejoinOngoing) {
            return
        }
        logger.info(`Rejoining DHT ${this.config.serviceId} ${this.config.ownPeerDescriptor.nodeName}!`)
        this.rejoinOngoing = true
        try {
            this.config.neighborList.clear()
            await this.joinDht(entryPoint)
            logger.info(`Rejoined DHT successfully ${this.config.serviceId}!`)
        } catch (err) {
            logger.warn(`rejoining DHT ${this.config.serviceId} failed`)
            if (!this.stopped) {
                setTimeout(() => this.rejoinDht(entryPoint), 5000)
            }
        } finally {
            this.rejoinOngoing = false
        }
    }

    private async getClosestPeersFromBucket(): Promise<void> {
        if (this.stopped) {
            return
        }
        await Promise.allSettled(this.config.bucket.closest(this.config.ownPeerId.value, 5).map(async (peer: DhtPeer) => {
            const contacts = await peer.getClosestPeers(this.config.ownPeerDescriptor.kademliaId!)
            contacts.forEach((contact) => {
                this.config.addContact(contact)
            })
        }))
    }

    public isJoinOngoing(): boolean {
        return this.ongoingDiscoverySessions.size > 0
    }

    public stop(): void {
        this.stopped = true
        this.abortController.abort()
        if (this.rejoinTimeoutRef) {
            clearTimeout(this.rejoinTimeoutRef)
            this.rejoinTimeoutRef = undefined
        }
        this.ongoingDiscoverySessions.forEach((session, _id) => {
            session.stop()
        })
    }
}
