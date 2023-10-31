import { DiscoverySession } from './DiscoverySession'
import { RemoteDhtNode } from '../RemoteDhtNode'
import { areEqualPeerDescriptors, keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Logger, scheduleAtInterval, setAbortableTimeout } from '@streamr/utils'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { IPeerManager } from '../IPeerManager'
import { createRandomKademliaId } from '../../helpers/kademliaId'

interface PeerDiscoveryConfig {
    ownPeerDescriptor: PeerDescriptor
    joinNoProgressLimit: number
    getClosestContactsLimit: number
    serviceId: string
    parallelism: number
    joinTimeout: number
    connectionManager?: ConnectionManager
    peerManager: IPeerManager
}

const logger = new Logger(module)

export class PeerDiscovery {

    private readonly config: PeerDiscoveryConfig
    private ongoingDiscoverySessions: Map<string, DiscoverySession> = new Map()
    private rejoinOngoing = false
    private joinCalled = false
    private rejoinTimeoutRef?: NodeJS.Timeout
    private readonly abortController: AbortController
    private recoveryIntervalStarted = false

    constructor(config: PeerDiscoveryConfig) {
        this.config = config
        this.abortController = new AbortController()
    }

    async joinDht(entryPointDescriptor: PeerDescriptor, doAdditionalRandomPeerDiscovery = true, retry = true): Promise<void> {
        if (this.isStopped()) {
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
        this.config.peerManager.handleNewPeers([entryPointDescriptor])

        const sessions = [this.createSession(peerIdFromPeerDescriptor(this.config.ownPeerDescriptor).value)]
        if (doAdditionalRandomPeerDiscovery) {
            sessions.push(this.createSession(createRandomKademliaId()))
        }
        await this.runSessions(sessions, entryPointDescriptor, retry)
        this.config.connectionManager?.unlockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)

    }

    private createSession(targetId: Uint8Array): DiscoverySession {
        const sessionOptions = {
            targetId,
            parallelism: this.config.parallelism,
            noProgressLimit: this.config.joinNoProgressLimit,
            peerManager: this.config.peerManager
        }
        return new DiscoverySession(sessionOptions)
    }

    private async runSessions(sessions: DiscoverySession[], entryPointDescriptor: PeerDescriptor, retry: boolean): Promise<void> {
        try {
            for (const session of sessions) {
                this.ongoingDiscoverySessions.set(session.sessionId, session)
                await session.findClosestNodes(this.config.joinTimeout)
            }
        } catch (_e) {
            logger.debug(`DHT join on ${this.config.serviceId} timed out`)
        } finally {
            if (!this.isStopped()) {
                if (this.config.peerManager.getKBucketSize() === 0) {
                    if (retry) {
                        setAbortableTimeout(() => this.rejoinDht(entryPointDescriptor), 1000, this.abortController.signal)
                    }
                } else {
                    await this.ensureRecoveryIntervalIsRunning()
                }
            }
            sessions.forEach((session) => this.ongoingDiscoverySessions.delete(session.sessionId))
        }
    }

    public async rejoinDht(entryPoint: PeerDescriptor): Promise<void> {
        if (this.isStopped() || this.rejoinOngoing) {
            return
        }
        logger.debug(`Rejoining DHT ${this.config.serviceId}`)
        this.rejoinOngoing = true
        try {
            await this.joinDht(entryPoint)
            logger.debug(`Rejoined DHT successfully ${this.config.serviceId}!`)
        } catch (err) {
            logger.warn(`Rejoining DHT ${this.config.serviceId} failed`)
            if (!this.isStopped()) {
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
        if (this.isStopped()) {
            return
        }
        await Promise.allSettled(this.config.peerManager.getClosestPeersTo(
            this.config.ownPeerDescriptor.kademliaId, this.config.parallelism).map(async (peer: RemoteDhtNode) => {
            const contacts = await peer.getClosestPeers(this.config.ownPeerDescriptor.kademliaId!)
            this.config.peerManager.handleNewPeers(contacts)
        }))
    }

    public isJoinOngoing(): boolean {
        return !this.joinCalled ? true : this.ongoingDiscoverySessions.size > 0
    }

    public isJoinCalled(): boolean {
        return this.joinCalled
    }

    private isStopped() {
        return this.abortController.signal.aborted
    }

    public stop(): void {
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
