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
    private openInternetPeers?: SortedContactList
    private rpcCommunicator?: RpcCommunicator
    private transportLayer?: ITransport
    private ownPeerDescriptor?: PeerDescriptor
    private ownPeerId?: PeerID

    private cleanUpHandleForConnectionManager?: ConnectionManager
    private started = false
    private stopped = false

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
        this.started = true
        if (this.config.transportLayer) {
            this.transportLayer = this.config.transportLayer
            this.ownPeerDescriptor = this.transportLayer.getPeerDescriptor()
            this.ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.peerId)
        }
        else {
            let connectionManager: ConnectionManager
            if (this.config.peerDescriptor && this.config.peerDescriptor.websocket) {
                connectionManager = new ConnectionManager({
                    webSocketHost: this.config.peerDescriptor.websocket.ip,
                    webSocketPort: this.config.peerDescriptor.websocket.port,
                    entryPoints: this.config.entryPoints
                })
                this.ownPeerDescriptor = this.config.peerDescriptor
                connectionManager.createWsConnector(this)
                connectionManager.createWebRtcConnector(this)
                await connectionManager.start()
            } else if (!this.config.webSocketPort) {
                connectionManager = new ConnectionManager({
                    entryPoints: this.config.entryPoints
                })
                connectionManager.createWsConnector(this)
                connectionManager.createWebRtcConnector(this)
                await connectionManager.start()
                this.ownPeerDescriptor = this.createPeerDescriptor(undefined, this.config.peerIdString)
            } else {
                connectionManager = new ConnectionManager({
                    webSocketHost: this.config.webSocketHost!,
                    webSocketPort: this.config.webSocketPort!,
                    entryPoints: this.config.entryPoints
                })
                connectionManager.createWsConnector(this)
                connectionManager.createWebRtcConnector(this)
                const result = await connectionManager.start()
                this.ownPeerDescriptor = this.createPeerDescriptor(result, this.config.peerIdString)
            }

            this.ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.peerId)
            connectionManager.enableConnectivity(this.ownPeerDescriptor)

            this.cleanUpHandleForConnectionManager = connectionManager
            this.transportLayer = connectionManager
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
            ret.openInternet = true
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
                    this.removeContact(contact.getPeerDescriptor(), true)
                    this.addNewContact(newContact.getPeerDescriptor())
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
                this.removeContact(contact.getPeerDescriptor())
                this.addClosestContactToBucket()
            }
        })
        this.bucket.on('updated', (_oldContact: DhtPeer, _newContact: DhtPeer) => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(selfId, this.K * 4)
        this.openInternetPeers = new SortedContactList(selfId, this.K * 2)
    }

    public getNeighborList(): SortedContactList {
        return this.neighborList!
    }

    public getNodeId(): PeerID {
        return this.ownPeerId!
    }

    public onGetClosestPeers(caller: PeerDescriptor): DhtPeer[] {
        if (!this.started || this.stopped) {
            return []
        }
        console.log(this.ownPeerId!.toString(), "onGetClosestPeers")
        const ret = this.bucket!.closest(caller.peerId, this.K)
        this.addNewContact(caller, true)
        return ret
    }

    public async onRoutedMessage(routedMessage: RouteMessageWrapper): Promise<void> {
        if (!this.started || this.stopped) {
            return
        }
        this.addNewContact(routedMessage.sourcePeer!, true)
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
        if (!this.started || this.stopped) {
            return
        }
        const params: RouteMessageParams = {
            message: Message.toBinary(msg),
            destinationPeer: targetPeerDescriptor,
            appId: appId ? appId : 'layer0',
            sourcePeer: this.ownPeerDescriptor!
        }
        this.routeMessage(params).catch((_err) => {
            // console.error(err)
        })
    }

    public async routeMessage(params: RouteMessageParams): Promise<void> {
        if (!this.started || this.stopped) {
            return
        }
        let successAcks = 0
        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 4000 })
        const closest = this.bucket!.closest(params.destinationPeer.peerId, this.K)
            .filter((peer: DhtPeer) =>
                !(peer.peerId.equals(PeerID.fromValue(params.sourcePeer!.peerId))
                    || (peer.peerId.equals(PeerID.fromValue(params.previousPeer?.peerId || new Uint8Array()))))
            )
        const initialLength = closest.length
        while (successAcks < this.ALPHA && successAcks < initialLength && closest.length > 0) {
            if (this.stopped) {
                break
            }
            const next = closest.shift()
            console.log(this.ownPeerId!.toString(), next!.peerId.toString())
            queue.add(
                (async () => {
                    const success = await next!.routeMessage({
                        ...params,
                        previousPeer: this.getPeerDescriptor()
                    })
                    if (success) {
                        successAcks += 1
                    } else{
                        console.log("COULD NOT ROUTE")
                    }
                })
            )
        }
        await queue.onIdle()
        queue.removeAllListeners()
        // Only throw if originator
        if (successAcks === 0 && this.ownPeerId!.equals(PeerID.fromValue(params.sourcePeer!.peerId))) {
            throw new Err.CouldNotRoute(
                `Routing message to peer: ${PeerID.fromValue(params.destinationPeer!.peerId).toString()}`
                + ` from ${this.ownPeerId!.toString()} failed.`
            )
        }
    }

    public canRoute(routedMessage: RouteMessageWrapper): boolean {
        if (!this.started || this.stopped) {
            return false
        }
        if (this.ownPeerId!.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            return true
        }
        if (this.routerDuplicateDetector.test(routedMessage.nonce)) {
            return false
        }
        const closestPeers = this.bucket!.closest(routedMessage.destinationPeer!.peerId, this.K)
        console.log(this.bucket!.toArray().length)
        closestPeers.forEach((p) => {console.log(p.peerId.toString())})
        const notRoutableCount = closestPeers.reduce((acc: number, curr: DhtPeer) => {
            if (curr.peerId.equals(PeerID.fromValue(routedMessage.sourcePeer!.peerId)
                || curr.peerId.equals(PeerID.fromValue(routedMessage.previousPeer?.peerId || new Uint8Array())))) {
                return acc + 1
            }
            return acc
        }, 0)
        console.log(closestPeers.length, notRoutableCount)
        return (closestPeers.length - notRoutableCount) > 0
    }

    private async getClosestPeersFromContact(contact: DhtPeer) {
        if (!this.started || this.stopped) {
            return
        }
        this.neighborList!.setContacted(contact.peerId)
        this.neighborList!.setActive(contact.peerId)
        const returnedContacts = await contact.getClosestPeers(this.ownPeerDescriptor!)
        const dhtPeers = returnedContacts.map((peer) => {
            return new DhtPeer(peer, new DhtRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        })
        this.neighborList!.addContacts(dhtPeers)
        dhtPeers.forEach((returnedContact) => {
            this.addNewContact(returnedContact.getPeerDescriptor(), true)
        })
    }

    private async contactEntrypoints(): Promise<void> {
        if (!this.started || this.stopped) {
            return
        }
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
        if (!this.started || this.stopped) {
            return
        }
        const entryPoint = new DhtPeer(entryPointDescriptor, new DhtRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 4000 })
        const entryPointId = PeerID.fromValue(entryPointDescriptor.peerId)
        if (this.ownPeerId!.equals(entryPoint.peerId)) {
            return
        }

        this.addNewContact(entryPointDescriptor)
        const closest = this.bucket!.closest(this.ownPeerId!.value, this.ALPHA)
        this.neighborList!.addContacts(closest)
        await this.contactEntrypoints()

        this.neighborList!.setActive(entryPointId)
        this.openInternetPeers!.setActive(entryPointId)

        while (true) {
            if (this.stopped) {
                break
            }
            let uncontacted = this.neighborList!.getUncontactedContacts(this.ALPHA)
            const oldClosestContactId = this.neighborList!.getClosestContactId()
            uncontacted.map((contact) => queue.add(
                (async () => await this.getClosestPeersFromContact(contact))
            ))
            if (this.neighborList!.getActiveContacts().length >= this.K ||
                oldClosestContactId.equals(this.neighborList!.getClosestContactId())) {
                break
            }
            uncontacted = this.neighborList!.getUncontactedContacts(this.ALPHA)
            if (uncontacted.length < 1) {
                break
            }
            await queue.onEmpty()
        }
    }

    public getBucketSize(): number {
        return this.bucket!.count()
    }

    private addNewContact(contact: PeerDescriptor, setActive = false): void {
        if (!this.bucket!.get(contact.peerId)) {
            const dhtPeer = new DhtPeer(contact, new DhtRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
            const peerId = PeerID.fromValue(contact.peerId)
            if (!this.neighborList!.isContact(peerId)) {
                this.neighborList!.addContact(dhtPeer)
            }
            if (contact.openInternet && !this.openInternetPeers!.isContact(peerId)) {
                this.openInternetPeers!.addContact(dhtPeer)
            }
            if (setActive) {
                this.neighborList!.setActive(peerId)
                this.openInternetPeers!.isActive(peerId)
            }
            this.bucket!.add(dhtPeer)
        }
    }

    private removeContact(contact: PeerDescriptor, removeFromOpenInternetPeers = false): void {
        const peerId = PeerID.fromValue(contact.peerId)
        this.bucket!.remove(peerId.value)
        this.neighborList!.removeContact(peerId)
        if (removeFromOpenInternetPeers) {
            this.openInternetPeers!.removeContact(peerId)
        }
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

    public getOpenInternetPeerDescriptors(): PeerDescriptor[] {
        return this.openInternetPeers!.getActiveContacts().map((contact) => contact.getPeerDescriptor())
    }

    private addClosestContactToBucket(): void {
        const closest = this.getClosestActiveContactNotInBucket()
        if (closest) {
            this.addNewContact(closest.getPeerDescriptor())
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
        if (!this.started) {
            return
        }
        this.stopped = true
        this.rpcCommunicator?.stop()
        this.bucket!.removeAllListeners()
        this.removeAllListeners()

        if (this.cleanUpHandleForConnectionManager) {
            await this.cleanUpHandleForConnectionManager.stop()
        }
    }
}