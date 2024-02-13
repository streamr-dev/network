import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { SortedContactList } from '../contact/SortedContactList'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerDescriptor, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { RouterRpcRemote } from './RouterRpcRemote'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RecursiveOperationRpcClient, RouterRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Contact } from '../contact/Contact'
import { RecursiveOperationRpcRemote } from '../recursive-operation/RecursiveOperationRpcRemote'
import { EXISTING_CONNECTION_TIMEOUT } from '../contact/RpcRemote'
import { getPreviousPeer } from './getPreviousPeer'
import { DhtAddress, areEqualPeerDescriptors, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { pull } from 'lodash'

const logger = new Logger(module)

const MAX_FAILED_HOPS = 2
const CONTACT_LIST_MAX_SIZE = 10

class RemoteContact extends Contact {

    private routerRpcRemote: RouterRpcRemote
    private recursiveOperationRpcRemote: RecursiveOperationRpcRemote

    constructor(peer: DhtNodeRpcRemote, localPeerDescriptor: PeerDescriptor, rpcCommunicator: RoutingRpcCommunicator) {
        super(peer.getPeerDescriptor())
        this.routerRpcRemote = new RouterRpcRemote(
            localPeerDescriptor,
            peer.getPeerDescriptor(),
            rpcCommunicator,
            RouterRpcClient,
            EXISTING_CONNECTION_TIMEOUT
        )
        this.recursiveOperationRpcRemote = new RecursiveOperationRpcRemote(
            localPeerDescriptor,
            peer.getPeerDescriptor(),
            rpcCommunicator,
            RecursiveOperationRpcClient,
            EXISTING_CONNECTION_TIMEOUT
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

export enum RoutingMode { ROUTE, FORWARD, RECURSIVE }

interface RoutingSessionConfig {
    rpcCommunicator: RoutingRpcCommunicator
    localPeerDescriptor: PeerDescriptor
    routedMessage: RouteMessageWrapper
    connections: Map<DhtAddress, DhtNodeRpcRemote>
    parallelism: number
    mode: RoutingMode
    excludedNodeIds?: Set<DhtAddress>
}

export class RoutingSession extends EventEmitter<RoutingSessionEvents> {

    public readonly sessionId = v4()
    private ongoingRequests: Set<DhtAddress> = new Set()
    private contactList: SortedContactList<RemoteContact>
    private failedHopCounter = 0
    private successfulHopCounter = 0
    private stopped = false
    private readonly config: RoutingSessionConfig

    constructor(config: RoutingSessionConfig) {
        super()
        this.config = config
        const previousPeer = getPreviousPeer(config.routedMessage)
        const previousId = previousPeer ? getNodeIdFromPeerDescriptor(previousPeer) : undefined
        this.contactList = new SortedContactList({
            referenceId: getDhtAddressFromRaw(config.routedMessage.target),
            maxSize: CONTACT_LIST_MAX_SIZE,
            allowToContainReferenceId: true,
            nodeIdDistanceLimit: previousId,
            excludedNodeIds: config.excludedNodeIds,
            emitEvents: false
        })
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
            // TODO should call this.stop() so that we do cleanup? (after the emitFailure call)
            this.stopped = true
            this.emitFailure()
        } else {
            logger.trace('routing failed, retrying to route sessionId: ' + this.sessionId + ' failedHopCounter: ' + this.failedHopCounter)
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
        if (this.successfulHopCounter >= this.config.parallelism) {
            this.emitSuccess()
            return
        }
        const contacts = this.updateAndGetRoutablePeers()
        if (contacts.length === 0) {
            this.emitSuccess()
        } else if (contacts.length > 0 && this.ongoingRequests.size === 0) {
            this.sendMoreRequests(contacts)
        }
    }

    private emitSuccess() {
        // TODO should call this.stop() so that we do cleanup? (after the routingSucceeded call)
        this.stopped = true
        this.emit('routingSucceeded')
    }

    private async sendRouteMessageRequest(contact: RemoteContact): Promise<boolean> {
        if (this.stopped) {
            return false
        }
        const msg = {
            ...this.config.routedMessage,
            routingPath: this.config.routedMessage.routingPath.concat([this.config.localPeerDescriptor])
        }
        if (this.config.mode === RoutingMode.FORWARD) {
            return contact.getRouterRpcRemote().forwardMessage(msg)
        } else if (this.config.mode === RoutingMode.RECURSIVE) {
            return contact.getRecursiveOperationRpcRemote().routeRequest(msg)
        } else {
            return contact.getRouterRpcRemote().routeMessage(msg)
        }
    }

    updateAndGetRoutablePeers(): RemoteContact[] {
        logger.trace('getRoutablePeers() sessionId: ' + this.sessionId)
        // Remove stale contacts that may have been removed from connections
        this.contactList.getContactIds().forEach((nodeId) => {
            if (!this.config.connections.has(nodeId)) {
                this.contactList.removeContact(nodeId)
            }
        })
        const contacts = Array.from(this.config.connections.values())
            .map((peer) => new RemoteContact(peer, this.config.localPeerDescriptor, this.config.rpcCommunicator))
        this.contactList.addContacts(contacts)
        return this.contactList.getUncontactedContacts(this.config.parallelism)
    }

    sendMoreRequests(uncontacted: RemoteContact[]): void {
        logger.trace('sendMoreRequests() sessionId: ' + this.sessionId)
        if (this.stopped) {
            return
        }
        if (uncontacted.length === 0) {
            this.emitFailure()
            return
        }
        while ((this.ongoingRequests.size < this.config.parallelism) && (uncontacted.length > 0) && !this.stopped) {
            const nextPeer = uncontacted.shift()
            // eslint-disable-next-line max-len
            logger.trace(`Sending routeMessage request to contact: ${getNodeIdFromPeerDescriptor(nextPeer!.getPeerDescriptor())} (sessionId=${this.sessionId})`)
            this.contactList.setContacted(nextPeer!.getNodeId())
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
                } catch (e) {
                    logger.debug('Unable to route message ', { error: e })
                } finally {
                    logger.trace('sendRouteMessageRequest returned')
                }
            })
        }
    }

    private addParallelRootIfSource(nodeId: DhtAddress) {
        if (
            this.config.mode === RoutingMode.RECURSIVE
            && areEqualPeerDescriptors(this.config.localPeerDescriptor, this.config.routedMessage.sourcePeer!)
        ) {
            this.config.routedMessage.parallelRootNodeIds.push(nodeId)
        }
    }

    private deleteParallelRootIfSource(nodeId: DhtAddress) {
        if (
            this.config.mode === RoutingMode.RECURSIVE
            && areEqualPeerDescriptors(this.config.localPeerDescriptor, this.config.routedMessage.sourcePeer!)
        ) {
            pull(this.config.routedMessage.parallelRootNodeIds, nodeId)
        }
    }

    public stop(): void {
        this.stopped = true
        this.contactList.stop()
        this.emit('stopped')
        this.removeAllListeners()
    }
}
