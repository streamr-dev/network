import { DiscoverySession } from './DiscoverySession'
import { RemoteDhtNode } from '../RemoteDhtNode'
import crypto from 'crypto'
import { areEqualPeerDescriptors, keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Logger, scheduleAtInterval, setAbortableTimeout } from '@streamr/utils'
import KBucket from 'k-bucket'
import { SortedContactList } from '../contact/SortedContactList'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { PeerIDKey } from '../../helpers/PeerID'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RandomContactList } from '../contact/RandomContactList'

interface PeerDiscoveryConfig {
    rpcCommunicator: RoutingRpcCommunicator
    ownPeerDescriptor: PeerDescriptor
    bucket: KBucket<RemoteDhtNode>
    connections: Map<PeerIDKey, RemoteDhtNode>
    neighborList: SortedContactList<RemoteDhtNode>
    randomPeers: RandomContactList<RemoteDhtNode>
    openInternetPeers: SortedContactList<RemoteDhtNode>
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
    private joinCalled = false

    private rejoinTimeoutRef?: NodeJS.Timeout
    private readonly abortController: AbortController
    private recoveryIntervalStarted = false

    constructor(config: PeerDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    async joinDht(entryPointDescriptor: PeerDescriptor, doRandomJoin = true, retry = true): Promise<void> {
        if (this.stopped) {
            return
        }
        this.joinCalled = true
        logger.debug(
            `Joining ${this.config.serviceId === 'layer0' ? 'The Streamr Network' : `Control Layer for ${this.config.serviceId}`}`
            + ` via entrypoint ${keyFromPeerDescriptor(entryPointDescriptor)}`
        )
        if (areEqualPeerDescriptors(entryPointDescriptor, this.config.ownPeerDescriptor)) {
            return
        }
        this.config.connectionManager?.lockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
        this.config.addContact(entryPointDescriptor)
        const closest = this.config.bucket.closest(peerIdFromPeerDescriptor(this.config.ownPeerDescriptor).value, this.config.getClosestContactsLimit)
        this.config.neighborList.addContacts(closest)
        const sessionOptions = {
            bucket: this.config.bucket,
            neighborList: this.config.neighborList,
            targetId: peerIdFromPeerDescriptor(this.config.ownPeerDescriptor).value,
            ownPeerDescriptor: this.config.ownPeerDescriptor,
            serviceId: this.config.serviceId,
            rpcCommunicator: this.config.rpcCommunicator,
            parallelism: this.config.parallelism,
            noProgressLimit: this.config.joinNoProgressLimit,
            newContactListener: (newPeer: RemoteDhtNode) => this.config.addContact(newPeer.getPeerDescriptor())
        }
        const session = new DiscoverySession(sessionOptions)
        const randomSession = doRandomJoin ? new DiscoverySession({
            ...sessionOptions,
            // TODO why 8 bytes? (are we generating a random "kademliaId" here?)
            targetId: crypto.randomBytes(8)
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
        } catch (_e) {
            logger.debug(`DHT join on ${this.config.serviceId} timed out`)
        } finally {
            if (!this.stopped) {
                if (this.config.bucket.count() === 0) {
                    if (retry) {
                        setAbortableTimeout(() => this.rejoinDht(entryPointDescriptor), 1000, this.abortController.signal)
                    }
                } else {
                    await this.ensureRecoveryIntervalIsRunning()
                }
            }
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
        logger.debug(`Rejoining DHT ${this.config.serviceId}`)
        this.rejoinOngoing = true
        try {
            this.config.neighborList.clear()
            await this.joinDht(entryPoint)
            logger.debug(`Rejoined DHT successfully ${this.config.serviceId}!`)
        } catch (err) {
            logger.warn(`Rejoining DHT ${this.config.serviceId} failed`)
            if (!this.stopped) {
                setAbortableTimeout(() => this.rejoinDht(entryPoint), 5000, this.abortController.signal)
            }
        } finally {
            this.rejoinOngoing = false
        }
    }

    private async ensureRecoveryIntervalIsRunning(): Promise<void> {
        if (!this.recoveryIntervalStarted) {
            this.recoveryIntervalStarted = true
            await scheduleAtInterval(() => this.fetchClosestPeersFromBucket(), 60000, true, this.abortController.signal)
        }
    }

    private async fetchClosestPeersFromBucket(): Promise<void> {
        if (this.stopped) {
            return
        }
        const nodes = this.config.bucket.closest(peerIdFromPeerDescriptor(this.config.ownPeerDescriptor).value, this.config.parallelism)
        await Promise.allSettled(nodes.map(async (peer: RemoteDhtNode) => {
            const contacts = await peer.getClosestPeers(this.config.ownPeerDescriptor.kademliaId)
            contacts.forEach((contact) => {
                this.config.addContact(contact)
            })
        }))
    }

    public isJoinOngoing(): boolean {
        return !this.joinCalled ? true : this.ongoingDiscoverySessions.size > 0
    }

    public isJoinCalled(): boolean {
        return this.joinCalled
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
