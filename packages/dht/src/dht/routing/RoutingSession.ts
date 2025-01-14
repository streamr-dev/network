import { SortedContactList } from '../contact/SortedContactList'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerDescriptor, RouteMessageWrapper } from '../../../generated/packages/dht/protos/DhtRpc'
import { RouterRpcRemote, ROUTING_TIMEOUT } from './RouterRpcRemote'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RecursiveOperationRpcClient, RouterRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { Contact } from '../contact/Contact'
import { RecursiveOperationRpcRemote } from '../recursive-operation/RecursiveOperationRpcRemote'
import { getPreviousPeer } from './getPreviousPeer'
import { DhtAddress, areEqualPeerDescriptors, toDhtAddress, toNodeId } from '../../identifiers'
import { pull } from 'lodash'
import { RoutingTable, RoutingTablesCache } from './RoutingTablesCache'

const logger = new Logger(module)

const MAX_FAILED_HOPS = 2
const ROUTING_TABLE_MAX_SIZE = 20

export class RoutingRemoteContact extends Contact {
    private routerRpcRemote: RouterRpcRemote
    private recursiveOperationRpcRemote: RecursiveOperationRpcRemote

    constructor(peer: PeerDescriptor, localPeerDescriptor: PeerDescriptor, rpcCommunicator: RoutingRpcCommunicator) {
        super(peer)
        this.routerRpcRemote = new RouterRpcRemote(
            localPeerDescriptor,
            peer,
            rpcCommunicator,
            RouterRpcClient,
            ROUTING_TIMEOUT
        )
        this.recursiveOperationRpcRemote = new RecursiveOperationRpcRemote(
            localPeerDescriptor,
            peer,
            rpcCommunicator,
            RecursiveOperationRpcClient,
            ROUTING_TIMEOUT
        )
    }

    getRouterRpcRemote(): RouterRpcRemote {
        return this.routerRpcRemote
    }

    getRecursiveOperationRpcRemote(): RecursiveOperationRpcRemote {
        return this.recursiveOperationRpcRemote
    }
}

export interface RoutingSessionEvents {
    // This event is emitted when a peer responds with a success ack
    // to routeMessage call
    routingSucceeded: () => void
    partialSuccess: () => void
    // This event is emitted when all the candidates have been gone
    // through, and none of them responds with a success ack
    routingFailed: () => void
    stopped: () => void
}

export enum RoutingMode {
    ROUTE,
    FORWARD,
    RECURSIVE
}

interface RoutingSessionOptions {
    rpcCommunicator: RoutingRpcCommunicator
    localPeerDescriptor: PeerDescriptor
    routedMessage: RouteMessageWrapper
    parallelism: number
    mode: RoutingMode
    excludedNodeIds: Set<DhtAddress>
    routingTablesCache: RoutingTablesCache
    getConnections: () => PeerDescriptor[]
}

export class RoutingSession extends EventEmitter<RoutingSessionEvents> {
    public readonly sessionId = v4()
    private ongoingRequests: Set<DhtAddress> = new Set()
    private contactedPeers: Set<DhtAddress> = new Set()
    private failedHopCounter = 0
    private successfulHopCounter = 0
    private stopped = false
    private readonly options: RoutingSessionOptions

    constructor(options: RoutingSessionOptions) {
        super()
        this.options = options
    }

    private onRequestFailed(nodeId: DhtAddress) {
        logger.trace('onRequestFailed() sessionId: ' + this.sessionId)
        if (this.stopped) {
            return
        }
        if (this.ongoingRequests.has(nodeId)) {
            this.ongoingRequests.delete(nodeId)
        }
        this.deleteParallelRootIfSource(nodeId)
        this.failedHopCounter += 1
        if (this.failedHopCounter >= MAX_FAILED_HOPS) {
            logger.trace(`Stopping routing after ${MAX_FAILED_HOPS} failed attempts for sessionId: ${this.sessionId}`)
            this.emitFailure()
            return
        }
        const contacts = this.updateAndGetRoutablePeers()
        if (contacts.length === 0 && this.ongoingRequests.size === 0) {
            logger.trace('routing failed, emitting routingFailed sessionId: ' + this.sessionId)
            this.emitFailure()
        } else {
            logger.trace(
                'routing failed, retrying to route sessionId: ' +
                    this.sessionId +
                    ' failedHopCounter: ' +
                    this.failedHopCounter
            )
            this.sendMoreRequests(contacts)
        }
    }

    private emitFailure() {
        if (this.successfulHopCounter >= 1) {
            this.emit('partialSuccess')
        } else {
            this.emit('routingFailed')
        }
    }

    private onRequestSucceeded() {
        logger.trace('onRequestSucceeded() sessionId: ' + this.sessionId)
        if (this.stopped) {
            return
        }
        this.successfulHopCounter += 1
        if (this.successfulHopCounter >= this.options.parallelism) {
            this.emit('routingSucceeded')
            return
        }
        const contacts = this.updateAndGetRoutablePeers()
        if (contacts.length === 0) {
            this.emit('routingSucceeded')
        } else if (contacts.length > 0 && this.ongoingRequests.size === 0) {
            this.sendMoreRequests(contacts)
        }
    }

    private async sendRouteMessageRequest(contact: RoutingRemoteContact): Promise<boolean> {
        if (this.stopped) {
            return false
        }
        const msg = {
            ...this.options.routedMessage,
            routingPath: this.options.routedMessage.routingPath.concat([this.options.localPeerDescriptor])
        }
        if (this.options.mode === RoutingMode.FORWARD) {
            return contact.getRouterRpcRemote().forwardMessage(msg)
        } else if (this.options.mode === RoutingMode.RECURSIVE) {
            return contact.getRecursiveOperationRpcRemote().routeRequest(msg)
        } else {
            return contact.getRouterRpcRemote().routeMessage(msg)
        }
    }

    updateAndGetRoutablePeers(): RoutingRemoteContact[] {
        logger.trace('getRoutablePeers() sessionId: ' + this.sessionId)
        const previousPeer = getPreviousPeer(this.options.routedMessage)
        const previousId = previousPeer ? toNodeId(previousPeer) : undefined
        const targetId = toDhtAddress(this.options.routedMessage.target)
        let routingTable: RoutingTable
        if (this.options.routingTablesCache.has(targetId, previousId)) {
            routingTable = this.options.routingTablesCache.get(targetId, previousId)!
        } else {
            routingTable = new SortedContactList<RoutingRemoteContact>({
                referenceId: toDhtAddress(this.options.routedMessage.target),
                maxSize: ROUTING_TABLE_MAX_SIZE,
                allowToContainReferenceId: true,
                nodeIdDistanceLimit: previousId
            })
            const contacts = this.options
                .getConnections()
                .map(
                    (peer) =>
                        new RoutingRemoteContact(peer, this.options.localPeerDescriptor, this.options.rpcCommunicator)
                )
            routingTable.addContacts(contacts)
            this.options.routingTablesCache.set(targetId, routingTable, previousId)
        }
        return routingTable
            .getClosestContacts()
            .filter(
                (contact) =>
                    !this.contactedPeers.has(contact.getNodeId()) &&
                    !this.options.excludedNodeIds.has(contact.getNodeId())
            )
    }

    sendMoreRequests(uncontacted: RoutingRemoteContact[]): void {
        logger.trace('sendMoreRequests() sessionId: ' + this.sessionId)
        if (this.stopped) {
            return
        }
        if (uncontacted.length === 0) {
            this.emitFailure()
            return
        }
        while (this.ongoingRequests.size < this.options.parallelism && uncontacted.length > 0 && !this.stopped) {
            const nextPeer = uncontacted.shift()
            logger.trace(
                `Sending routeMessage request to contact: ${toNodeId(nextPeer!.getPeerDescriptor())} (sessionId=${this.sessionId})`
            )
            this.contactedPeers.add(nextPeer!.getNodeId())
            this.ongoingRequests.add(nextPeer!.getNodeId())
            this.addParallelRootIfSource(nextPeer!.getNodeId())
            setImmediate(async () => {
                try {
                    const succeeded = await this.sendRouteMessageRequest(nextPeer!)
                    if (succeeded) {
                        this.onRequestSucceeded()
                    } else {
                        this.onRequestFailed(nextPeer!.getNodeId())
                    }
                } catch (err) {
                    logger.debug('Unable to route message ', { err })
                } finally {
                    logger.trace('sendRouteMessageRequest returned')
                }
            })
        }
    }

    private addParallelRootIfSource(nodeId: DhtAddress) {
        if (
            this.options.mode === RoutingMode.RECURSIVE &&
            areEqualPeerDescriptors(this.options.localPeerDescriptor, this.options.routedMessage.sourcePeer!)
        ) {
            this.options.routedMessage.parallelRootNodeIds.push(nodeId)
        }
    }

    private deleteParallelRootIfSource(nodeId: DhtAddress) {
        if (
            this.options.mode === RoutingMode.RECURSIVE &&
            areEqualPeerDescriptors(this.options.localPeerDescriptor, this.options.routedMessage.sourcePeer!)
        ) {
            pull(this.options.routedMessage.parallelRootNodeIds, nodeId)
        }
    }

    public stop(): void {
        this.stopped = true
        this.emit('stopped')
        this.removeAllListeners()
    }
}
