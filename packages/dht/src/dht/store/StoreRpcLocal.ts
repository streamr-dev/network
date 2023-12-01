import {
    DataEntry, ReplicateDataRequest, PeerDescriptor,
    StoreDataRequest, StoreDataResponse, RecursiveOperation
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../helpers/PeerID'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StoreRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { IRecursiveOperationManager } from '../recursive-operation/RecursiveOperationManager'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, executeSafePromise } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { IStoreRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { StoreRpcRemote } from './StoreRpcRemote'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import { SortedContactList } from '../contact/SortedContactList'
import { Contact } from '../contact/Contact'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { ServiceID } from '../../types/ServiceID'
import { Empty } from '../../proto/google/protobuf/empty'
import { findIndex } from 'lodash'

interface DataStoreConfig {
    rpcCommunicator: RoutingRpcCommunicator
    recursiveOperationManager: IRecursiveOperationManager
    localPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: ServiceID
    highestTtl: number
    redundancyFactor: number
    getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => DhtNodeRpcRemote[]
    rpcRequestTimeout?: number
}

const logger = new Logger(module)

export class StoreRpcLocal implements IStoreRpc {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly recursiveOperationManager: IRecursiveOperationManager
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly localDataStore: LocalDataStore
    private readonly serviceId: ServiceID
    private readonly highestTtl: number
    private readonly redundancyFactor: number
    private readonly getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => DhtNodeRpcRemote[]
    private readonly rpcRequestTimeout?: number

    constructor(config: DataStoreConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.recursiveOperationManager = config.recursiveOperationManager
        this.localPeerDescriptor = config.localPeerDescriptor
        this.localDataStore = config.localDataStore
        this.serviceId = config.serviceId
        this.highestTtl = config.highestTtl
        this.redundancyFactor = config.redundancyFactor
        this.rpcRequestTimeout = config.rpcRequestTimeout
        this.getNodesClosestToIdFromBucket = config.getNodesClosestToIdFromBucket
        this.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest) => this.storeData(request))
        this.rpcCommunicator.registerRpcNotification(ReplicateDataRequest, 'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => this.replicateData(request, context))
    }

    onNewContact(peerDescriptor: PeerDescriptor): void {
        this.localDataStore.getStore().forEach((dataMap, _dataKey) => {
            dataMap.forEach(async (dataEntry) => {
                const shouldReplicate = this.shouldReplicateDataToNewNode(dataEntry.dataEntry, peerDescriptor)
                this.localDataStore.setStale(dataEntry.dataEntry.key, peerIdFromPeerDescriptor(dataEntry.dataEntry.creator!), !shouldReplicate)
                if (shouldReplicate) {
                    try {
                        await this.replicateDataToContact(dataEntry.dataEntry, peerDescriptor)
                    } catch (e) {
                        logger.trace('replicateDataToContact() failed', { error: e })
                    }
                }
            })
        })    
    }

    private shouldReplicateDataToNewNode(dataEntry: DataEntry, newNode: PeerDescriptor): boolean {
        const newNodeId = PeerID.fromValue(newNode.nodeId)
        const localPeerId = PeerID.fromValue(this.localPeerDescriptor.nodeId)
        const closestToData = this.getNodesClosestToIdFromBucket(dataEntry.key, 10)

        const sortedList = new SortedContactList<Contact>({
            referenceId: PeerID.fromValue(dataEntry.key), 
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
        const isClosest = sortedList.getAllContacts()[0].getPeerId().equals(localPeerId)
        if (!isClosest) {
            return false
        }
        const newPeerId = PeerID.fromValue(newNode.nodeId)
        sortedList.addContact(new Contact(newNode))
        const sorted = sortedList.getAllContacts()
        const index = findIndex(sorted, (contact) => contact.getPeerId().equals(newPeerId))
        // if new node is within the storageRedundancyFactor closest nodes to the data
        // do replicate data to it
        return (index < this.redundancyFactor)
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
        const result = await this.recursiveOperationManager.execute(key, RecursiveOperation.FIND_NODE)
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
        const { key, data, creator, createdAt, ttl } = request
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
            this.localDataStore.setAllEntriesAsStale(key)
        }
        logger.trace('storeData()')
        return StoreDataResponse.create()
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
            this.replicateDataToNeighbors((context as DhtCallContext).incomingSourceDescriptor!, request.entry!)
        }
        if (!this.selfIsOneOfClosestPeers(dataEntry.key)) {
            this.localDataStore.setAllEntriesAsStale(dataEntry.key)
        }
        logger.trace('server-side replicateData() at end')
        return {}
    }

    private replicateDataToNeighbors(incomingPeer: PeerDescriptor, dataEntry: DataEntry): void {
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
        const replicateOnlyToClosest = (!sortedList.getAllContacts()[0].getPeerId().equals(localPeerId))
        const targets = replicateOnlyToClosest
            // If we are not the closest node to the data, replicate only to the closest one to the data
            ? [sortedList.getAllContacts()[0]]
            // if we are the closest to the data, replicate to all storageRedundancyFactor nearest
            : sortedList.getAllContacts()
        targets.forEach((contact) => {
            const contactPeerId = PeerID.fromValue(contact.getPeerDescriptor().nodeId)
            if (!incomingPeerId.equals(contactPeerId) && !localPeerId.equals(contactPeerId)) {
                setImmediate(() => {
                    executeSafePromise(async () => {
                        await this.replicateDataToContact(dataEntry, contact.getPeerDescriptor())
                        logger.trace('replicateDataToContact() returned', { 
                            node: getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()),
                            replicateOnlyToClosest
                        })
                    })
                })
            }
        })
    }

    async destroy(): Promise<void> {
        await this.replicateDataToClosestNodes()
    }
}
