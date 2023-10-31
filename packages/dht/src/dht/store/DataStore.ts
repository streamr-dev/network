import {
    DataEntry, DeleteDataRequest, DeleteDataResponse, MigrateDataRequest, MigrateDataResponse, PeerDescriptor,
    StoreDataRequest, StoreDataResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../helpers/PeerID'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StoreServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { IRecursiveFinder } from '../find/RecursiveFinder'
import { areEqualPeerDescriptors, keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { IStoreService } from '../../proto/packages/dht/protos/DhtRpc.server'
import { RemoteStore } from './RemoteStore'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import EventEmitter from 'eventemitter3'
import { Events } from '../DhtNode'
import { SortedContactList } from '../contact/SortedContactList'
import { Contact } from '../contact/Contact'
import { RemoteDhtNode } from '../RemoteDhtNode'

interface DataStoreConfig {
    rpcCommunicator: RoutingRpcCommunicator
    recursiveFinder: IRecursiveFinder
    ownPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: string
    maxTtl: number
    highestTtl: number
    redundancyFactor: number
    dhtNodeEmitter: EventEmitter<Events>
    getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => RemoteDhtNode[]
}

const logger = new Logger(module)

export class DataStore implements IStoreService {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly recursiveFinder: IRecursiveFinder
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly localDataStore: LocalDataStore
    private readonly serviceId: string
    private readonly maxTtl: number
    private readonly highestTtl: number
    private readonly redundancyFactor: number
    private readonly dhtNodeEmitter: EventEmitter<Events>
    private readonly getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => RemoteDhtNode[]

    constructor(config: DataStoreConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.recursiveFinder = config.recursiveFinder
        this.ownPeerDescriptor = config.ownPeerDescriptor
        this.localDataStore = config.localDataStore
        this.serviceId = config.serviceId
        this.maxTtl = config.maxTtl
        this.highestTtl = config.highestTtl
        this.redundancyFactor = config.redundancyFactor
        this.dhtNodeEmitter = config.dhtNodeEmitter
        this.getNodesClosestToIdFromBucket = config.getNodesClosestToIdFromBucket
        this.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest, context: ServerCallContext) => this.storeData(request, context))
        this.rpcCommunicator.registerRpcMethod(MigrateDataRequest, MigrateDataResponse, 'migrateData',
            (request: MigrateDataRequest, context: ServerCallContext) => this.migrateData(request, context))
        this.rpcCommunicator.registerRpcMethod(DeleteDataRequest, DeleteDataResponse, 'deleteData',
            (request: DeleteDataRequest, context: ServerCallContext) => this.deleteData(request, context))

        this.dhtNodeEmitter.on('newContact', (peerDescriptor: PeerDescriptor) => {
            this.localDataStore.getStore().forEach((dataMap, _dataKey) => {
                dataMap.forEach((dataEntry) => {
                    if (this.shouldMigrateDataToNewNode(dataEntry.dataEntry, peerDescriptor)) {
                        this.migrateDataToContact(dataEntry.dataEntry, peerDescriptor)
                    }
                })
            })
        })
    }

    private shouldMigrateDataToNewNode(dataEntry: DataEntry, newNode: PeerDescriptor): boolean {

        const dataId = PeerID.fromValue(dataEntry.kademliaId)
        const newNodeId = PeerID.fromValue(newNode.kademliaId)
        const ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.kademliaId)

        const closestToData = this.getNodesClosestToIdFromBucket(dataEntry.kademliaId, 10)

        const sortedList = new SortedContactList<Contact>(dataId, 20, undefined, true)
        sortedList.addContact(new Contact(this.ownPeerDescriptor))

        closestToData.forEach((con) => {
            if (!newNodeId.equals(PeerID.fromValue(con.getPeerDescriptor().kademliaId))) {
                sortedList.addContact(new Contact(con.getPeerDescriptor()))
            }
        })

        if (!sortedList.getAllContacts()[0].getPeerId().equals(ownPeerId)) {
            // If we are not the closes node to the data, do not migrate
            return false
        }

        const newPeerId = PeerID.fromValue(newNode.kademliaId)
        sortedList.addContact(new Contact(newNode))

        const sorted = sortedList.getAllContacts()

        let index = 0

        for (index = 0; index < sorted.length; index++) {
            if (sorted[index].getPeerId().equals(newPeerId)) {
                break
            }
        }

        // if new node is within the storageRedundancyFactor closest nodes to the data
        // do migrate data to it

        if (index < this.redundancyFactor) {
            this.localDataStore.setStale(dataId, dataEntry.storer!, false)
            return true
        } else {
            this.localDataStore.setStale(dataId, dataEntry.storer!, true)
            return false
        }
    }

    private async migrateDataToContact(dataEntry: DataEntry, contact: PeerDescriptor, doNotConnect: boolean = false): Promise<void> {
        const remoteStore = new RemoteStore(
            this.ownPeerDescriptor,
            contact,
            this.serviceId,
            toProtoRpcClient(new StoreServiceClient(this.rpcCommunicator.getRpcClientTransport()))
        )
        try {
            const response = await remoteStore.migrateData({ dataEntry }, doNotConnect)
            if (response.error) {
                logger.trace('RemoteStore::migrateData() returned error: ' + response.error)
            }
        } catch (e) {
            logger.trace('RemoteStore::migrateData() threw an exception ' + e)
        }
    }

    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        logger.debug(`Storing data to DHT ${this.serviceId}`)
        const result = await this.recursiveFinder.startRecursiveFind(key)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.highestTtl // ToDo: make TTL decrease according to some nice curve
        const storerTime = Timestamp.now()
        for (let i = 0; i < closestNodes.length && successfulNodes.length < this.redundancyFactor; i++) {
            if (areEqualPeerDescriptors(this.ownPeerDescriptor, closestNodes[i])) {
                this.localDataStore.storeEntry({
                    kademliaId: key, 
                    storer: this.ownPeerDescriptor,
                    ttl, 
                    storedAt: Timestamp.now(), 
                    data,
                    stale: false,
                    deleted: false,
                    storerTime
                })
                successfulNodes.push(closestNodes[i])
                continue
            }
            const remoteStore = new RemoteStore(
                this.ownPeerDescriptor,
                closestNodes[i],
                this.serviceId,
                toProtoRpcClient(new StoreServiceClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            try {
                const response = await remoteStore.storeData({ kademliaId: key, data, ttl, storerTime })
                if (!response.error) {
                    successfulNodes.push(closestNodes[i])
                    logger.trace('remoteStore.storeData() returned success')
                } else {
                    logger.trace('remoteStore.storeData() returned error: ' + response.error)
                }
            } catch (e) {
                logger.trace('remoteStore.storeData() threw an exception ' + e)
            }
        }
        return successfulNodes
    }

    private selfIsOneOfClosestPeers(dataId: Uint8Array): boolean {
        const ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.kademliaId)
        const closestPeers = this.getNodesClosestToIdFromBucket(dataId, this.redundancyFactor)
        const sortedList = new SortedContactList<Contact>(ownPeerId, this.redundancyFactor, undefined, true)
        sortedList.addContact(new Contact(this.ownPeerDescriptor))
        closestPeers.forEach((con) => sortedList.addContact(new Contact(con.getPeerDescriptor())))
        return sortedList.getClosestContacts().some((node) => node.getPeerId().equals(ownPeerId))
    }

    public async deleteDataFromDht(key: Uint8Array): Promise<void> {
        logger.debug(`Deleting data from DHT ${this.serviceId}`)
        const result = await this.recursiveFinder.startRecursiveFind(key)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        for (let i = 0; i < closestNodes.length && successfulNodes.length < this.redundancyFactor; i++) {
            if (areEqualPeerDescriptors(this.ownPeerDescriptor, closestNodes[i])) {
                this.localDataStore.markAsDeleted(key, peerIdFromPeerDescriptor(this.ownPeerDescriptor))
                successfulNodes.push(closestNodes[i])
                continue
            }
            const remoteStore = new RemoteStore(
                this.ownPeerDescriptor,
                closestNodes[i],
                this.serviceId,
                toProtoRpcClient(new StoreServiceClient(this.rpcCommunicator.getRpcClientTransport()))
            )
            try {
                const response = await remoteStore.deleteData({ kademliaId: key })
                if (response.deleted) {
                    logger.trace('remoteStore.deleteData() returned success')
                } else {
                    logger.trace('could not delete data from ' + keyFromPeerDescriptor(closestNodes[i]))
                }
                successfulNodes.push(closestNodes[i])
            } catch (e) {
                logger.trace('remoteStore.deleteData() threw an exception ' + e)
            }
        }
    }

    // RPC service implementation
    async storeData(request: StoreDataRequest, context: ServerCallContext): Promise<StoreDataResponse> {
        const ttl = Math.min(request.ttl, this.maxTtl)
        const { incomingSourceDescriptor } = context as DhtCallContext
        const { kademliaId, data, storerTime } = request
        this.localDataStore.storeEntry({ 
            kademliaId, 
            storer: incomingSourceDescriptor!, 
            ttl,
            storedAt: Timestamp.now(),
            storerTime,
            data,
            stale: !this.selfIsOneOfClosestPeers(kademliaId),
            deleted: false
        })
        
        if (!this.selfIsOneOfClosestPeers(kademliaId)) {
            this.localDataStore.setAllEntriesAsStale(PeerID.fromValue(kademliaId))
        }

        logger.trace('storeData()')
        return StoreDataResponse.create()
    }

    // RPC service implementation
    async deleteData(request: DeleteDataRequest, context: ServerCallContext): Promise<DeleteDataResponse> {
        const { incomingSourceDescriptor } = context as DhtCallContext
        const { kademliaId } = request
        const deleted = this.localDataStore.markAsDeleted(kademliaId, peerIdFromPeerDescriptor(incomingSourceDescriptor!))
        return DeleteDataResponse.create({ deleted })
    }

    // RPC service implementation
    public async migrateData(request: MigrateDataRequest, context: ServerCallContext): Promise<MigrateDataResponse> {
        logger.trace('server-side migrateData()')
        const dataEntry = request.dataEntry!

        const wasStored = this.localDataStore.storeEntry(dataEntry)
        
        if (wasStored) {
            this.migrateDataToNeighborsIfNeeded((context as DhtCallContext).incomingSourceDescriptor!, request.dataEntry!)
        }
        if (!this.selfIsOneOfClosestPeers(dataEntry.kademliaId)) {
            this.localDataStore.setAllEntriesAsStale(PeerID.fromValue(dataEntry.kademliaId))
        }
        logger.trace('server-side migrateData() at end')
        return MigrateDataResponse.create()
    }

    private migrateDataToNeighborsIfNeeded(incomingPeer: PeerDescriptor, dataEntry: DataEntry): void {

        // sort own contact list according to data id
        const ownPeerId = PeerID.fromValue(this.ownPeerDescriptor.kademliaId)
        const dataId = PeerID.fromValue(dataEntry.kademliaId)
        const incomingPeerId = PeerID.fromValue(incomingPeer.kademliaId)
        const closestToData = this.getNodesClosestToIdFromBucket(dataEntry.kademliaId, 10)

        const sortedList = new SortedContactList<Contact>(dataId, this.redundancyFactor, undefined, true)
        sortedList.addContact(new Contact(this.ownPeerDescriptor))

        closestToData.forEach((con) => {
            sortedList.addContact(new Contact(con.getPeerDescriptor()))
        })

        if (!sortedList.getAllContacts()[0].getPeerId().equals(ownPeerId)) {
            // If we are not the closest node to the data, migrate only to the 
            // closest one to the data

            const contact = sortedList.getAllContacts()[0]
            const contactPeerId = PeerID.fromValue(contact.getPeerDescriptor().kademliaId)
            if (!incomingPeerId.equals(contactPeerId) && !ownPeerId.equals(contactPeerId)) {
                setImmediate(async () => {
                    try {
                        await this.migrateDataToContact(dataEntry, contact.getPeerDescriptor())
                        logger.trace('migrateDataToContact() returned when migrating to only the closest contact')
                    } catch (e) {
                        logger.error('migrating data to only the closest contact failed ' + e)
                    }
                })
            }
        } else {
            // if we are the closest to the data, migrate to all storageRedundancyFactor nearest
            sortedList.getAllContacts().forEach((contact) => {
                const contactPeerId = PeerID.fromValue(contact.getPeerDescriptor().kademliaId)
                if (!incomingPeerId.equals(contactPeerId) && !ownPeerId.equals(contactPeerId)) {
                    if (!incomingPeerId.equals(contactPeerId) && !ownPeerId.equals(contactPeerId)) {
                        setImmediate(async () => {
                            try {
                                await this.migrateDataToContact(dataEntry, contact.getPeerDescriptor())
                                logger.trace('migrateDataToContact() returned')
                            } catch (e) {
                                logger.error('migrating data to one of the closest contacts failed ' + e)
                            }
                        })
                    }
                }
            })
        }
    }
}
