import {
    DataEntry, ReplicateDataRequest, PeerDescriptor,
    StoreDataRequest, StoreDataResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../helpers/PeerID'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StoreRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { IFinder } from '../find/Finder'
import { areEqualPeerDescriptors } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { IStoreRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { StoreRpcRemote } from './StoreRpcRemote'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import EventEmitter from 'eventemitter3'
import { Events } from '../DhtNode'
import { SortedContactList } from '../contact/SortedContactList'
import { Contact } from '../contact/Contact'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { ServiceID } from '../../types/ServiceID'
import { Empty } from '../../proto/google/protobuf/empty'

interface DataStoreConfig {
    rpcCommunicator: RoutingRpcCommunicator
    finder: IFinder
    localPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: ServiceID
    maxTtl: number
    highestTtl: number
    redundancyFactor: number
    dhtNodeEmitter: EventEmitter<Events>
    getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => DhtNodeRpcRemote[]
    rpcRequestTimeout?: number
}

const logger = new Logger(module)

export class StoreRpcLocal implements IStoreRpc {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly finder: IFinder
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly localDataStore: LocalDataStore
    private readonly serviceId: ServiceID
    private readonly maxTtl: number
    private readonly highestTtl: number
    private readonly redundancyFactor: number
    private readonly dhtNodeEmitter: EventEmitter<Events>
    private readonly getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => DhtNodeRpcRemote[]
    private readonly rpcRequestTimeout?: number

    constructor(config: DataStoreConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.finder = config.finder
        this.localPeerDescriptor = config.localPeerDescriptor
        this.localDataStore = config.localDataStore
        this.serviceId = config.serviceId
        this.maxTtl = config.maxTtl
        this.highestTtl = config.highestTtl
        this.redundancyFactor = config.redundancyFactor
        this.dhtNodeEmitter = config.dhtNodeEmitter
        this.rpcRequestTimeout = config.rpcRequestTimeout
        this.getNodesClosestToIdFromBucket = config.getNodesClosestToIdFromBucket
        this.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest) => this.storeData(request))
        this.rpcCommunicator.registerRpcNotification(ReplicateDataRequest, 'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => this.replicateData(request, context))

        this.dhtNodeEmitter.on('newContact', (peerDescriptor: PeerDescriptor) => {
            this.localDataStore.getStore().forEach((dataMap, _dataKey) => {
                dataMap.forEach(async (dataEntry) => {
                    if (this.shouldReplicateDataToNewNode(dataEntry.dataEntry, peerDescriptor)) {
                        try {
                            await this.replicateDataToContact(dataEntry.dataEntry, peerDescriptor)
                        } catch (e) {
                            logger.trace('replicateDataToContact() failed', { error: e })
                        }
                    }
                })
            })
        })
    }

    private shouldReplicateDataToNewNode(dataEntry: DataEntry, newNode: PeerDescriptor): boolean {

        const dataId = PeerID.fromValue(dataEntry.key)
        const newNodeId = PeerID.fromValue(newNode.nodeId)
        const localPeerId = PeerID.fromValue(this.localPeerDescriptor.nodeId)

        const closestToData = this.getNodesClosestToIdFromBucket(dataEntry.key, 10)

        const sortedList = new SortedContactList<Contact>({
            referenceId: dataId, 
            maxSize: 20, 
            allowToContainReferenceId: true,
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.localPeerDescriptor))

        closestToData.forEach((con) => {
            if (!newNodeId.equals(PeerID.fromValue(con.getPeerDescriptor().nodeId))) {
                sortedList.addContact(new Contact(con.getPeerDescriptor()))
            }
        })

        if (!sortedList.getAllContacts()[0].getPeerId().equals(localPeerId)) {
            // If we are not the closes node to the data, do not replicate
            return false
        }

        const newPeerId = PeerID.fromValue(newNode.nodeId)
        sortedList.addContact(new Contact(newNode))

        const sorted = sortedList.getAllContacts()

        let index = 0

        for (index = 0; index < sorted.length; index++) {
            if (sorted[index].getPeerId().equals(newPeerId)) {
                break
            }
        }

        // if new node is within the storageRedundancyFactor closest nodes to the data
        // do replicate data to it

        if (index < this.redundancyFactor) {
            this.localDataStore.setStale(dataId, dataEntry.creator!, false)
            return true
        } else {
            this.localDataStore.setStale(dataId, dataEntry.creator!, true)
            return false
        }
    }

    private async replicateDataToContact(dataEntry: DataEntry, contact: PeerDescriptor, doNotConnect: boolean = false): Promise<void> {
        const rpcRemote = new StoreRpcRemote(
            this.localPeerDescriptor,
            contact,
            this.serviceId,
            toProtoRpcClient(new StoreRpcClient(this.rpcCommunicator.getRpcClientTransport())),
            this.rpcRequestTimeout
        )
        try {
            await rpcRemote.replicateData({ entry: dataEntry }, doNotConnect)
        } catch (e) {
            logger.trace('replicateData() threw an exception ' + e)
        }
    }

    public async storeDataToDht(key: Uint8Array, data: Any, creator: PeerDescriptor): Promise<PeerDescriptor[]> {
        logger.debug(`Storing data to DHT ${this.serviceId}`)
        const result = await this.finder.startFind(key)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.highestTtl // ToDo: make TTL decrease according to some nice curve
        const createdAt = Timestamp.now()
        for (let i = 0; i < closestNodes.length && successfulNodes.length < this.redundancyFactor; i++) {
            if (areEqualPeerDescriptors(this.localPeerDescriptor, closestNodes[i])) {
                this.localDataStore.storeEntry({
                    key, 
                    data,
                    creator,
                    createdAt,
                    storedAt: Timestamp.now(), 
                    ttl, 
                    stale: false,
                    deleted: false,
                })
                successfulNodes.push(closestNodes[i])
                continue
            }
            const rpcRemote = new StoreRpcRemote(
                this.localPeerDescriptor,
                closestNodes[i],
                this.serviceId,
                toProtoRpcClient(new StoreRpcClient(this.rpcCommunicator.getRpcClientTransport())),
                this.rpcRequestTimeout
            )
            try {
                const response = await rpcRemote.storeData({
                    key,
                    data,
                    creator,
                    createdAt,
                    ttl
                })
                if (!response.error) {
                    successfulNodes.push(closestNodes[i])
                    logger.trace('remote.storeData() returned success')
                } else {
                    logger.trace('remote.storeData() returned error: ' + response.error)
                }
            } catch (e) {
                logger.trace('remote.storeData() threw an exception ' + e)
            }
        }
        return successfulNodes
    }

    private selfIsOneOfClosestPeers(dataId: Uint8Array): boolean {
        const localPeerId = PeerID.fromValue(this.localPeerDescriptor.nodeId)
        const closestPeers = this.getNodesClosestToIdFromBucket(dataId, this.redundancyFactor)
        const sortedList = new SortedContactList<Contact>({
            referenceId: localPeerId, 
            maxSize: this.redundancyFactor, 
            allowToContainReferenceId: true, 
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.localPeerDescriptor))
        closestPeers.forEach((con) => sortedList.addContact(new Contact(con.getPeerDescriptor())))
        return sortedList.getClosestContacts().some((node) => node.getPeerId().equals(localPeerId))
    }

    // RPC service implementation
    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        const ttl = Math.min(request.ttl, this.maxTtl)
        const { key, data, createdAt, creator } = request
        this.localDataStore.storeEntry({ 
            key, 
            data,
            creator, 
            createdAt,
            storedAt: Timestamp.now(),
            ttl,
            stale: !this.selfIsOneOfClosestPeers(key),
            deleted: false
        })
        
        if (!this.selfIsOneOfClosestPeers(key)) {
            this.localDataStore.setAllEntriesAsStale(PeerID.fromValue(key))
        }

        logger.trace('storeData()')
        return StoreDataResponse.create()
    }

    async destroy(): Promise<void> {
        await this.replicateDataToClosestNodes()
    }

    private async replicateDataToClosestNodes(): Promise<void> {
        const dataEntries = Array.from(this.localDataStore.getStore().values())
            .flatMap((dataMap) => Array.from(dataMap.values()))
            .map((localData) => localData.dataEntry)

        await Promise.all(dataEntries.map(async (dataEntry) => {
            const dhtNodeRemotes = this.getNodesClosestToIdFromBucket(dataEntry.key, this.redundancyFactor)
            await Promise.all(dhtNodeRemotes.map(async (remoteDhtNode) => {
                const rpcRemote = new StoreRpcRemote(
                    this.localPeerDescriptor,
                    remoteDhtNode.getPeerDescriptor(),
                    this.serviceId,
                    toProtoRpcClient(new StoreRpcClient(this.rpcCommunicator.getRpcClientTransport())),
                    this.rpcRequestTimeout
                )
                try {
                    await rpcRemote.replicateData({ entry: dataEntry })
                } catch (err) {
                    logger.trace('Failed to replicate data in replicateDataToClosestNodes', { error: err })
                }
            }))
        }))
    }

    // RPC service implementation
    public async replicateData(request: ReplicateDataRequest, context: ServerCallContext): Promise<Empty> {
        logger.trace('server-side replicateData()')
        const dataEntry = request.entry!

        const wasStored = this.localDataStore.storeEntry(dataEntry)
        
        if (wasStored) {
            this.replicateDataToNeighborsIfNeeded((context as DhtCallContext).incomingSourceDescriptor!, request.entry!)
        }
        if (!this.selfIsOneOfClosestPeers(dataEntry.key)) {
            this.localDataStore.setAllEntriesAsStale(PeerID.fromValue(dataEntry.key))
        }
        logger.trace('server-side replicateData() at end')
        return {}
    }

    private replicateDataToNeighborsIfNeeded(incomingPeer: PeerDescriptor, dataEntry: DataEntry): void {

        // sort own contact list according to data id
        const localPeerId = PeerID.fromValue(this.localPeerDescriptor.nodeId)
        const dataId = PeerID.fromValue(dataEntry.key)
        const incomingPeerId = PeerID.fromValue(incomingPeer.nodeId)
        const closestToData = this.getNodesClosestToIdFromBucket(dataEntry.key, 10)

        const sortedList = new SortedContactList<Contact>({
            referenceId: dataId, 
            maxSize: this.redundancyFactor, 
            allowToContainReferenceId: true, 
            emitEvents: false })
        sortedList.addContact(new Contact(this.localPeerDescriptor))

        closestToData.forEach((con) => {
            sortedList.addContact(new Contact(con.getPeerDescriptor()))
        })

        if (!sortedList.getAllContacts()[0].getPeerId().equals(localPeerId)) {
            // If we are not the closest node to the data, replicate only to the 
            // closest one to the data

            const contact = sortedList.getAllContacts()[0]
            const contactPeerId = PeerID.fromValue(contact.getPeerDescriptor().nodeId)
            if (!incomingPeerId.equals(contactPeerId) && !localPeerId.equals(contactPeerId)) {
                setImmediate(async () => {
                    try {
                        await this.replicateDataToContact(dataEntry, contact.getPeerDescriptor())
                        logger.trace('replicateDataToContact() returned when migrating to only the closest contact')
                    } catch (e) {
                        logger.error('replicating data to only the closest contact failed ' + e)
                    }
                })
            }
        } else {
            // if we are the closest to the data, replicate to all storageRedundancyFactor nearest
            sortedList.getAllContacts().forEach((contact) => {
                const contactPeerId = PeerID.fromValue(contact.getPeerDescriptor().nodeId)
                if (!incomingPeerId.equals(contactPeerId) && !localPeerId.equals(contactPeerId)) {
                    if (!incomingPeerId.equals(contactPeerId) && !localPeerId.equals(contactPeerId)) {
                        setImmediate(async () => {
                            try {
                                await this.replicateDataToContact(dataEntry, contact.getPeerDescriptor())
                                logger.trace('replicateDataToContact() returned')
                            } catch (e) {
                                logger.error('replicating data to one of the closest contacts failed ' + e)
                            }
                        })
                    }
                }
            })
        }
    }
}
