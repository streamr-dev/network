import { Logger, scheduleAtInterval, setAbortableTimeout } from '@streamr/utils'
import { ConnectionLocker } from '../../connection/ConnectionManager'
import {
    DhtAddress,
    areEqualPeerDescriptors,
    createRandomDhtAddress,
    getDhtAddressFromRaw,
    getNodeIdFromPeerDescriptor,
    getRawFromDhtAddress
} from '../../identifiers'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ServiceID } from '../../types/ServiceID'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { PeerManager } from '../PeerManager'
import { getClosestNodes } from '../contact/getClosestNodes'
import { RingIdRaw, getRingIdRawFromPeerDescriptor } from '../contact/ringIdentifiers'
import { DiscoverySession } from './DiscoverySession'
import { RingDiscoverySession } from './RingDiscoverySession'
import { CONTROL_LAYER_NODE_SERVICE_ID } from '../DhtNode'

interface PeerDiscoveryConfig {
    localPeerDescriptor: PeerDescriptor
    joinNoProgressLimit: number
    serviceId: ServiceID
    parallelism: number
    joinTimeout: number
    connectionLocker?: ConnectionLocker
    peerManager: PeerManager
    abortSignal: AbortSignal
    createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => DhtNodeRpcRemote
}

export const createDistantDhtAddress = (address: DhtAddress): DhtAddress => {
    const raw = getRawFromDhtAddress(address)
    const flipped = raw.map((val) => ~val)
    return getDhtAddressFromRaw(flipped)
}

const logger = new Logger(module)

export class PeerDiscovery {

    private ongoingDiscoverySessions: Map<string, DiscoverySession> = new Map()
    private ongoingRingDiscoverySessions: Map<string, RingDiscoverySession> = new Map()
    
    private rejoinOngoing = false
    private joinCalled = false
    private recoveryIntervalStarted = false
    private readonly config: PeerDiscoveryConfig

    constructor(config: PeerDiscoveryConfig) {
        this.config = config
    }

    async joinDht(
        entryPoints: PeerDescriptor[],
        doAdditionalDistantPeerDiscovery = true,
        retry = true
    ): Promise<void> {
        const contactedPeers = new Set<DhtAddress>()
        const distantJoinConfig = doAdditionalDistantPeerDiscovery 
            ? { enabled: true, contactedPeers: new Set<DhtAddress>() } : { enabled: false } as const
        await Promise.all(entryPoints.map((entryPoint) => this.joinThroughEntryPoint(
            entryPoint,
            contactedPeers,
            distantJoinConfig,
            retry
        )))
    }

    private async joinThroughEntryPoint(
        entryPointDescriptor: PeerDescriptor,
        // Note that this set is mutated by DiscoverySession
        contactedPeers: Set<DhtAddress>,
        additionalDistantJoin: { enabled: true, contactedPeers: Set<DhtAddress> } | { enabled: false },
        retry = true
    ): Promise<void> {
        if (this.isStopped()) {
            return
        }
        this.joinCalled = true
        logger.debug(
            `Joining ${this.config.serviceId === CONTROL_LAYER_NODE_SERVICE_ID ? 'The Streamr Network' : `Control Layer for ${this.config.serviceId}`}`
            + ` via entrypoint ${getNodeIdFromPeerDescriptor(entryPointDescriptor)}`
        )
        if (areEqualPeerDescriptors(entryPointDescriptor, this.config.localPeerDescriptor)) {
            return
        }
        this.config.connectionLocker?.lockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
        this.config.peerManager.addContact(entryPointDescriptor)
        const targetId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        const sessions = [this.createSession(targetId, contactedPeers)]
        if (additionalDistantJoin.enabled) {
            sessions.push(this.createSession(createDistantDhtAddress(targetId), additionalDistantJoin.contactedPeers))
        }
        await this.runSessions(sessions, entryPointDescriptor, retry)
        this.config.connectionLocker?.unlockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)

    }

    async joinRing(): Promise<void> {
        const contactedPeers = new Set<DhtAddress>()
        const sessions = [this.createRingSession(getRingIdRawFromPeerDescriptor(this.config.localPeerDescriptor), contactedPeers)]
        await this.runRingSessions(sessions)
    }

    private createSession(targetId: DhtAddress, contactedPeers: Set<DhtAddress>): DiscoverySession {
        const sessionOptions = {
            targetId,
            parallelism: this.config.parallelism,
            noProgressLimit: this.config.joinNoProgressLimit,
            peerManager: this.config.peerManager,
            contactedPeers,
            abortSignal: this.config.abortSignal,
            createDhtNodeRpcRemote: this.config.createDhtNodeRpcRemote
        }
        return new DiscoverySession(sessionOptions)
    }

    private createRingSession(targetId: RingIdRaw, contactedPeers: Set<DhtAddress>): RingDiscoverySession {
        const sessionOptions = {
            targetId,
            parallelism: this.config.parallelism,
            noProgressLimit: this.config.joinNoProgressLimit,
            peerManager: this.config.peerManager,
            contactedPeers,
            abortSignal: this.config.abortSignal,
            createDhtNodeRpcRemote: this.config.createDhtNodeRpcRemote
        }
        return new RingDiscoverySession(sessionOptions)
    }

    private async runSessions(sessions: DiscoverySession[], entryPointDescriptor: PeerDescriptor, retry: boolean): Promise<void> {
        try {
            for (const session of sessions) {
                this.ongoingDiscoverySessions.set(session.id, session)
                await session.findClosestNodes(this.config.joinTimeout)
            }
        } catch (_e) {
            logger.debug(`DHT join on ${this.config.serviceId} timed out`)
        } finally {
            if (!this.isStopped()) {
                if (this.config.peerManager.getNeighborCount() === 0) {
                    if (retry) {
                        // TODO should we catch possible promise rejection?
                        // TODO use config option or named constant?
                        setAbortableTimeout(() => this.rejoinDht(entryPointDescriptor), 1000, this.config.abortSignal)
                    }
                } else {
                    await this.ensureRecoveryIntervalIsRunning()
                }
            }
            sessions.forEach((session) => this.ongoingDiscoverySessions.delete(session.id))
        }
    }

    private async runRingSessions(sessions: RingDiscoverySession[]): Promise<void> {
        try {
            for (const session of sessions) {
                this.ongoingRingDiscoverySessions.set(session.id, session)
                await session.findClosestNodes(this.config.joinTimeout)
            }
        } catch (_e) {
            logger.debug(`Ring join on ${this.config.serviceId} timed out`)
        } finally {
            sessions.forEach((session) => this.ongoingDiscoverySessions.delete(session.id))
        }
    }

    public async rejoinDht(
        entryPoint: PeerDescriptor,
        contactedPeers: Set<DhtAddress> = new Set(),
        distantJoinContactPeers: Set<DhtAddress> = new Set()
    ): Promise<void> {
        if (this.isStopped() || this.rejoinOngoing) {
            return
        }
        logger.debug(`Rejoining DHT ${this.config.serviceId}`)
        this.rejoinOngoing = true
        try {
            await this.joinThroughEntryPoint(entryPoint, contactedPeers, { enabled: true, contactedPeers: distantJoinContactPeers })
            logger.debug(`Rejoined DHT successfully ${this.config.serviceId}!`)
        } catch (err) {
            logger.warn(`Rejoining DHT ${this.config.serviceId} failed`)
            if (!this.isStopped()) {
                // TODO should we catch possible promise rejection?
                // TODO use config option or named constant?
                setAbortableTimeout(() => this.rejoinDht(entryPoint), 5000, this.config.abortSignal)
            }
        } finally {
            this.rejoinOngoing = false
        }
    }

    private async ensureRecoveryIntervalIsRunning(): Promise<void> {
        if (!this.recoveryIntervalStarted) {
            this.recoveryIntervalStarted = true
            // TODO use config option or named constant?
            await scheduleAtInterval(() => this.fetchClosestAndRandomNeighbors(), 60000, true, this.config.abortSignal)
        }
    }

    private async fetchClosestAndRandomNeighbors(): Promise<void> {
        if (this.isStopped()) {
            return
        }
        const localNodeId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        const nodes = this.getClosestNeighbors(localNodeId, this.config.parallelism)
        const randomNodes = this.getClosestNeighbors(createRandomDhtAddress(), 1)
        await Promise.allSettled([
            ...nodes.map(async (node: PeerDescriptor) => {
                const remote = this.config.createDhtNodeRpcRemote(node)
                const contacts = await remote.getClosestPeers(localNodeId)
                for (const contact of contacts) {
                    this.config.peerManager.addContact(contact)
                }
            }),
            ...randomNodes.map(async (node: PeerDescriptor) => {
                const remote = this.config.createDhtNodeRpcRemote(node)
                const contacts = await remote.getClosestPeers(createRandomDhtAddress())
                for (const contact of contacts) {
                    this.config.peerManager.addContact(contact)
                }
            })
        ])
    }

    private getClosestNeighbors(referenceId: DhtAddress, maxCount: number): PeerDescriptor[] {
        return getClosestNodes(referenceId, this.config.peerManager.getNeighbors().map((n) => n.getPeerDescriptor()), { maxCount })
    }

    public isJoinOngoing(): boolean {
        return !this.joinCalled ? true : this.ongoingDiscoverySessions.size > 0
    }

    public isJoinCalled(): boolean {
        return this.joinCalled
    }

    private isStopped() {
        return this.config.abortSignal.aborted
    }
}
