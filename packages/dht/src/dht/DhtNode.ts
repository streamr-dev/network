import { DhtPeer } from './DhtPeer'
import KBucket from 'k-bucket'
import PQueue from 'p-queue'
import EventEmitter from 'events'
import { SortedContactList } from './SortedContactList'
import { createRpcMethods } from '../rpc-protocol/server'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { PeerID } from '../PeerID'
import {
    ConnectivityResponseMessage,
    Message,
    NodeType,
    PeerDescriptor,
    RouteMessageWrapper
} from '../proto/DhtRpc'
import { RouterDuplicateDetector } from './RouterDuplicateDetector'
import { Err } from '../errors'
import { ITransport, Event as ITransportEvent } from '../transport/ITransport'
import { ConnectionManager } from '../connection/ConnectionManager'
import { DhtRpcClient } from '../proto/DhtRpc.client'

export interface RouteMessageParams {
    message: Uint8Array
    destinationPeer: PeerDescriptor
    sourcePeer: PeerDescriptor
    appId: string
    previousPeer?: PeerDescriptor
    messageId?: string
}

export enum Event {
    NEW_CONTACT = 'streamr:dht:dht-node:new-peer',
    CONTACT_REMOVED = 'streamr:dht:dht-node:peer-removed'
}

export const DEFAULT_APP_ID = 'layer0'

export interface DhtNodeConfig {
    /*peerDescriptor?: PeerDescriptor
    dhtRpcClient?: DhtRpcClient
    clientTransport?: ClientTransport
    serverTransport?: ServerTransport
    rpcCommunicator?: RpcCommunicator*/

    transportLayer?: ITransport,
    peerDescriptor?: PeerDescriptor,
    entryPoints?: PeerDescriptor[],
    webSocketHost?: string,
    webSocketPort?: number,
    peerIdString?: string
    appId?: string
}

export class DhtNode extends EventEmitter implements ITransport {
    static objectCounter = 0
    private objectId = 1

    private readonly ALPHA = 3
    private readonly K = 4
    private readonly peers: Map<string, DhtPeer>
    private readonly numberOfNodesPerKBucket = 1
    private readonly routerDuplicateDetector: RouterDuplicateDetector
    private readonly appId: string

    private bucket?: KBucket<DhtPeer>
    private neighborList?: SortedContactList
    private rpcCommunicator?: RpcCommunicator
    private transportLayer?: ITransport
    private ownPeerDescriptor?: PeerDescriptor
    private ownPeerId?: PeerID

    private cleanUpHandleForCnnectionManager?: ConnectionManager

    constructor(private config: DhtNodeConfig) {
        super()

        this.objectId = DhtNode.objectCounter
        DhtNode.objectCounter++

        this.peers = new Map()

        if (config.appId) {
            this.appId = config.appId
        }
        else {
            this.appId = DEFAULT_APP_ID
        }

        // False positives at 0.05% at maximum capacity
        this.routerDuplicateDetector = new RouterDuplicateDetector(2 ** 15, 16, 1050, 2100)
    }

    public async start(): Promise<void> {

        if (this.config.transportLayer) {
            this.transportLayer = this.config.transportLayer
            this.ownPeerDescriptor = this.transportLayer.getPeerDescriptor()
            this.ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.peerId)
        }
        else {
            let connectionManager: ConnectionManager

            if (this.config.peerDescriptor) {
                connectionManager = new ConnectionManager({
                    webSocketHost: this.config.peerDescriptor.websocket!.ip,
                    webSocketPort: this.config.peerDescriptor.websocket!.port,
                    entryPoints: this.config.entryPoints
                })
                this.ownPeerDescriptor = this.config.peerDescriptor
                await connectionManager.start()
            }
            else {
                connectionManager = new ConnectionManager({
                    webSocketHost: this.config.webSocketHost!,
                    webSocketPort: this.config.webSocketPort!, entryPoints: this.config.entryPoints
                })
                const result = await connectionManager.start()
                this.ownPeerDescriptor = this.createPeerDescriptor(result, this.config.peerIdString)
            }

            this.ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.peerId)
            connectionManager.enableConnectivity(this.ownPeerDescriptor)

            this.cleanUpHandleForCnnectionManager = connectionManager
            this.transportLayer = connectionManager
            connectionManager.createConnectorRpcs(this)
        }

        this.rpcCommunicator = new RpcCommunicator({
            connectionLayer: this.transportLayer,
            appId: this.appId
        })
        this.bindDefaultServerMethods()
        this.initKBucket(this.ownPeerId!)
    }

    private createPeerDescriptor = (msg?: ConnectivityResponseMessage, peerIdString?: string): PeerDescriptor => {

        let peerId: Uint8Array

        if (msg) {
            peerId = peerIdString ? PeerID.fromString(peerIdString).value : PeerID.fromIp(msg.ip).value
        }
        else {
            peerId = PeerID.fromString(peerIdString!).value
        }

        const ret: PeerDescriptor = { peerId: peerId, type: NodeType.NODEJS }

        if (msg && msg.websocket) {
            ret.websocket = { ip: msg.websocket!.ip, port: msg.websocket!.port }
        }

        return ret
    }

    private initKBucket(selfId: PeerID): void {
        this.bucket = new KBucket({
            localNodeId: selfId.value,
            numberOfNodesPerKBucket: this.numberOfNodesPerKBucket
        })

        this.bucket.on('ping', async (oldContacts, newContact) => {
            // Here the node should call ping() on all old contacts. If one of them fails it should be removed
            // and replaced with the newContact
            for (const contact of oldContacts) {
                const alive = await contact.ping(this.ownPeerDescriptor!)
                if (!alive) {
                    this.bucket!.remove(contact.id)
                    this.bucket!.add(newContact)
                    this.neighborList!.removeContact(contact.peerId)
                    break
                }
            }
        })
        this.bucket.on('removed', (contact: DhtPeer) => {
            if (this.appId === DEFAULT_APP_ID) {
                const connectionManager = this.rpcCommunicator!.getConnectionManager()
                connectionManager.disconnect(contact.getPeerDescriptor())
            }
            this.emit(Event.CONTACT_REMOVED, contact.getPeerDescriptor())
        })
        this.bucket.on('added', async (contact: DhtPeer) => {
            if (await contact.ping(this.ownPeerDescriptor!)) {
                this.emit(Event.NEW_CONTACT, contact.getPeerDescriptor())
            } else {
                this.bucket!.remove(contact.peerId.value)
                this.neighborList!.removeContact(contact.peerId)
                this.addClosestContactToBucket()
            }
        })
        this.bucket.on('updated', (_oldContact: DhtPeer, _newContact: DhtPeer) => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(selfId, this.K * 4)
    }

    public getNeighborList(): SortedContactList {
        return this.neighborList!
    }

    public getNodeId(): PeerID {
        return this.ownPeerId!
    }

    public onGetClosestPeers(caller: PeerDescriptor): DhtPeer[] {
        const ret = this.bucket!.closest(caller.peerId, this.K)
        if (!this.bucket!.get(caller.peerId)) {
            const contact = new DhtPeer(caller, new DhtRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            this.bucket!.add(contact)
            this.neighborList!.addContact(contact)
        }
        return ret
    }

    public async onRoutedMessage(routedMessage: RouteMessageWrapper): Promise<void> {
        this.updateBucketAndNeighborList(routedMessage.sourcePeer!)
        this.routerDuplicateDetector.add(routedMessage.nonce)
        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            const message = Message.fromBinary(routedMessage.message)
            this.emit(ITransportEvent.DATA, routedMessage.sourcePeer, message, routedMessage.appId)
        } else {
            await this.routeMessage({
                message: routedMessage.message,
                previousPeer: routedMessage.previousPeer as PeerDescriptor,
                destinationPeer: routedMessage.destinationPeer as PeerDescriptor,
                sourcePeer: routedMessage.sourcePeer as PeerDescriptor,
                appId: routedMessage.appId,
                messageId: routedMessage.nonce
            })
        }
    }

    public send(targetPeerDescriptor: PeerDescriptor, msg: Message, appId?: string): void {
        const params: RouteMessageParams = {
            message: Message.toBinary(msg),
            destinationPeer: targetPeerDescriptor,
            appId: appId ? appId : 'layer0',
            sourcePeer: this.ownPeerDescriptor!
        }
        this.routeMessage(params)
    }

    public async routeMessage(params: RouteMessageParams): Promise<void> {
        // If destination is in bucket
        if (this.bucket!.get(params.destinationPeer.peerId)) {
            const destination = this.bucket!.get(params.destinationPeer.peerId)
            try {
                const success = await destination!.routeMessage({
                    ...params,
                    previousPeer: this.ownPeerDescriptor!
                })
                if (success) {
                    return
                }
            } catch (err) {
                console.error(err)
            }
        }
        let successAcks = 0
        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 3000 })
        const closest = this.bucket!.closest(params.destinationPeer.peerId, this.K)
            .filter((peer: DhtPeer) =>
                !(peer.peerId.equals(PeerID.fromValue(params.sourcePeer!.peerId))
                    || (peer.peerId.equals(PeerID.fromValue(params.previousPeer?.peerId || new Uint8Array()))))
            )
        const initialLength = closest.length
        while (successAcks < this.ALPHA && successAcks < initialLength && closest.length > 0) {
            await queue.add(
                (async () => {
                    const success = await closest.shift()!.routeMessage({
                        ...params,
                        previousPeer: this.getPeerDescriptor()
                    })
                    if (success) {
                        successAcks += 1
                    }
                })
            )
        }
        // Only throw if originator
        if (successAcks === 0 && this.ownPeerId!.equals(PeerID.fromValue(params.sourcePeer!.peerId))) {
            throw new Err.CouldNotRoute(`Routing message to peer: ${PeerID.fromValue(params.destinationPeer!.peerId).toString()} failed.`)
        }
    }

    public canRoute(routedMessage: RouteMessageWrapper): boolean {
        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            return true
        }
        if (this.routerDuplicateDetector.test(routedMessage.nonce)) {
            return false
        }
        const closestPeers = this.bucket!.closest(routedMessage.destinationPeer!.peerId, this.K)
        const notRoutableCount = closestPeers.reduce((acc: number, curr: DhtPeer) => {
            if (curr.peerId.equals(PeerID.fromValue(routedMessage.sourcePeer!.peerId)
                || curr.peerId.equals(PeerID.fromValue(routedMessage.previousPeer?.peerId || new Uint8Array())))) {
                return acc + 1
            }
            return acc
        }, 0)
        return (closestPeers.length - notRoutableCount) > 0
    }

    private async getClosestPeersFromContact(contact: DhtPeer) {
        this.neighborList!.setContacted(contact.peerId)
        this.neighborList!.setActive(contact.peerId)
        const returnedContacts = await contact.getClosestPeers(this.ownPeerDescriptor!)
        const dhtPeers = returnedContacts.map((peer) => {
            return new DhtPeer(peer, new DhtRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        })
        this.neighborList!.addContacts(dhtPeers)
        dhtPeers.forEach((returnedContact) => {
            if (!this.bucket!.get(returnedContact.id)) {
                this.bucket!.add(returnedContact)
            }
        })
    }

    private async contactEntrypoints(): Promise<void> {
        while (true) {
            const oldClosestContactId = this.neighborList!.getClosestContactId()
            let uncontacted = this.neighborList!.getUncontactedContacts(this.ALPHA)
            if (uncontacted.length < 1) {
                return
            }

            await this.getClosestPeersFromContact(uncontacted[0])
            if (oldClosestContactId.equals(this.neighborList!.getClosestContactId())) {
                uncontacted = this.neighborList!.getUncontactedContacts(this.K)
                if (uncontacted.length < 1) {
                    return
                }
            }
        }
    }

    async joinDht(entryPointDescriptor: PeerDescriptor): Promise<void> {

        const entryPoint = new DhtPeer(entryPointDescriptor, new DhtRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 3000 })

        if (this.ownPeerId!.equals(entryPoint.peerId)) {
            return
        }

        this.bucket!.add(entryPoint)
        const closest = this.bucket!.closest(this.ownPeerId!.value, this.ALPHA)
        this.neighborList!.addContacts(closest)
        await this.contactEntrypoints()

        while (true) {
            let uncontacted = this.neighborList!.getUncontactedContacts(this.ALPHA)
            const oldClosestContactId = this.neighborList!.getClosestContactId()
            await Promise.allSettled(uncontacted.map((contact) => queue.add(
                (async () => await this.getClosestPeersFromContact(contact))
            )))
            if (this.neighborList!.getActiveContacts().length >= this.K ||
                oldClosestContactId.equals(this.neighborList!.getClosestContactId())) {
                break
            }
            uncontacted = this.neighborList!.getUncontactedContacts(this.ALPHA)
            if (uncontacted.length < 1) {
                break
            }
        }
    }

    public getBucketSize(): number {
        return this.bucket!.count()
    }

    private updateBucketAndNeighborList(contact: PeerDescriptor): void {
        const dhtPeer = new DhtPeer(contact, new DhtRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        const peerId = PeerID.fromValue(contact.peerId)
        if (!this.neighborList!.isContact(peerId)) {
            this.neighborList!.addContact(dhtPeer)
        }
        this.neighborList!.setActive(peerId)
        this.bucket!.add(dhtPeer)
    }

    private bindDefaultServerMethods() {
        const methods = createRpcMethods(this.onGetClosestPeers.bind(this), this.onRoutedMessage.bind(this), this.canRoute.bind(this))
        this.rpcCommunicator!.registerServerMethod('getClosestPeers', methods.getClosestPeers)
        this.rpcCommunicator!.registerServerMethod('ping', methods.ping)
        this.rpcCommunicator!.registerServerMethod('routeMessage', methods.routeMessage)
    }

    public getRpcCommunicator(): RpcCommunicator {
        return this.rpcCommunicator!
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor!
    }

    public getK(): number {
        return this.K
    }

    public getKBucketPeers(): PeerDescriptor[] {
        return this.bucket!.toArray().map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
    }

    private addClosestContactToBucket(): void {
        const closest = this.getClosestActiveContactNotInBucket()
        if (closest) {
            this.bucket!.add(closest)
        }
    }

    private getClosestActiveContactNotInBucket(): DhtPeer | null {
        for (const contactId of this.neighborList!.getContactIds()) {
            if (!this.bucket!.get(contactId.value) && this.neighborList!.isActive(contactId)) {
                return this.neighborList!.getContact(contactId.toString()).contact
            }
        }
        return null
    }

    public async stop(): Promise<void> {
        this.rpcCommunicator?.stop()
        this.bucket!.removeAllListeners()
        this.removeAllListeners()

        if (this.cleanUpHandleForCnnectionManager) {
            await this.cleanUpHandleForCnnectionManager.stop()
        }
    }
}