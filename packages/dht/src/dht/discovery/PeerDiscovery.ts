import { DiscoverySession } from './DiscoverySession'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Logger, scheduleAtInterval, setAbortableTimeout } from '@streamr/utils'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { PeerManager } from '../PeerManager'
import { DhtAddress, createRandomDhtAddress } from '../../identifiers'
import { ServiceID } from '../../types/ServiceID'

interface PeerDiscoveryConfig {
    localPeerDescriptor: PeerDescriptor
    joinNoProgressLimit: number
    peerDiscoveryQueryBatchSize: number
    serviceId: ServiceID
    parallelism: number
    joinTimeout: number
    connectionManager?: ConnectionManager
    peerManager: PeerManager
}

const logger = new Logger(module)

export class PeerDiscovery {

    private ongoingDiscoverySessions: Map<string, DiscoverySession> = new Map()
    private rejoinOngoing = false
    private joinCalled = false
    private readonly abortController: AbortController
    private recoveryIntervalStarted = false
    private readonly config: PeerDiscoveryConfig

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
            + ` via entrypoint ${getNodeIdFromPeerDescriptor(entryPointDescriptor)}`
        )
        if (areEqualPeerDescriptors(entryPointDescriptor, this.config.localPeerDescriptor)) {
            return
        }
        this.config.connectionManager?.lockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)
        this.config.peerManager.handleNewPeers([entryPointDescriptor])
        const targetId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        const sessions = [this.createSession(targetId)]
        if (doAdditionalRandomPeerDiscovery) {
            sessions.push(this.createSession(createRandomDhtAddress()))
        }
        await this.runSessions(sessions, entryPointDescriptor, retry)
        this.config.connectionManager?.unlockConnection(entryPointDescriptor, `${this.config.serviceId}::joinDht`)

    }

    private createSession(targetId: DhtAddress): DiscoverySession {
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
                this.ongoingDiscoverySessions.set(session.id, session)
                await session.findClosestNodes(this.config.joinTimeout)
            }
        } catch (_e) {
            logger.debug(`DHT join on ${this.config.serviceId} timed out`)
        } finally {
            if (!this.isStopped()) {
                if (this.config.peerManager.getNumberOfNeighbors() === 0) {
                    if (retry) {
                        // TODO should we catch possible promise rejection?
                        // TODO use config option or named constant?
                        setAbortableTimeout(() => this.rejoinDht(entryPointDescriptor), 1000, this.abortController.signal)
                    }
                } else {
                    await this.ensureRecoveryIntervalIsRunning()
                }
            }
            sessions.forEach((session) => this.ongoingDiscoverySessions.delete(session.id))
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
                // TODO should we catch possible promise rejection?
                // TODO use config option or named constant?
                setAbortableTimeout(() => this.rejoinDht(entryPoint), 5000, this.abortController.signal)
            }
        } finally {
            this.rejoinOngoing = false
        }
    }

    private async ensureRecoveryIntervalIsRunning(): Promise<void> {
        if (!this.recoveryIntervalStarted) {
            this.recoveryIntervalStarted = true
            // TODO use config option or named constant?
            await scheduleAtInterval(() => this.fetchClosestPeersFromBucket(), 60000, true, this.abortController.signal)
        }
    }

    private async fetchClosestPeersFromBucket(): Promise<void> {
        if (this.isStopped()) {
            return
        }
        const nodes = this.config.peerManager.getClosestNeighborsTo(
            getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor),
            this.config.parallelism
        )
        await Promise.allSettled(
            nodes.map(async (peer: DhtNodeRpcRemote) => {
                const contacts = await peer.getClosestPeers(getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor))
                this.config.peerManager.handleNewPeers(contacts)
            })
        )
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
        this.ongoingDiscoverySessions.forEach((session) => {
            session.stop()
        })
    }
}
