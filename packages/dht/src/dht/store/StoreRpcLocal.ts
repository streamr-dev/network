import {
    DataEntry, ReplicateDataRequest, PeerDescriptor,
    StoreDataRequest, StoreDataResponse, RecursiveOperation
} from '../../proto/packages/dht/protos/DhtRpc'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StoreRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { IRecursiveOperationManager } from '../recursive-operation/RecursiveOperationManager'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
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
import { areEqualNodeIds, getNodeIdFromDataKey } from '../../helpers/nodeId'

interface DataStoreConfig {
    rpcCommunicator: RoutingRpcCommunicator
    recursiveOperationManager: IRecursiveOperationManager
    localPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: ServiceID
    highestTtl: number
    redundancyFactor: number
    getClosestNeighborsTo: (id: Uint8Array, n?: number) => DhtNodeRpcRemote[]
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
    private readonly getClosestNeighborsTo: (id: Uint8Array, n?: number) => DhtNodeRpcRemote[]
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
        this.getClosestNeighborsTo = config.getClosestNeighborsTo
        this.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest) => this.storeData(request))
        this.rpcCommunicator.registerRpcNotification(ReplicateDataRequest, 'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => this.replicateData(request, context))
    }

    onNewContact(peerDescriptor: PeerDescriptor): void {
        this.localDataStore.getStore().forEach((dataMap, _dataKey) => {
            dataMap.forEach(async (dataEntry) => {
                await this.replicateAndUpdateStaleStateIfClosest(dataEntry.dataEntry, peerDescriptor)
            })
        })
    }

    private async replicateAndUpdateStaleStateIfClosest(dataEntry: DataEntry, newNode: PeerDescriptor): Promise<void> {
        const newNodeId = getNodeIdFromPeerDescriptor(newNode)
        // TODO use config option or named constant?
        const closestToData = this.getClosestNeighborsTo(dataEntry.key, 10)
        const sortedList = new SortedContactList<Contact>({
            referenceId: getNodeIdFromDataKey(dataEntry.key), 
            maxSize: 20,  // TODO use config option or named constant?
            allowToContainReferenceId: true,
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.localPeerDescriptor))
        closestToData.forEach((con) => {
            if (!areEqualNodeIds(newNodeId, getNodeIdFromPeerDescriptor(con.getPeerDescriptor()))) {
                sortedList.addContact(new Contact(con.getPeerDescriptor()))
            }
        })
        const selfIsPrimaryStorer = areEqualNodeIds(sortedList.getAllContacts()[0].getNodeId(), getNodeIdFromPeerDescriptor(this.localPeerDescriptor))
        if (selfIsPrimaryStorer) {
            sortedList.addContact(new Contact(newNode))
            const sorted = sortedList.getAllContacts()
            // findIndex should never return -1 here because we just added the new node to the list
            const index = findIndex(sorted, (contact) => areEqualNodeIds(contact.getNodeId(), newNodeId))
            // if new node is within the storageRedundancyFactor closest nodes to the data
            // do replicate data to it
            if (index < this.redundancyFactor) {
                try {
                    await this.replicateDataToContact(dataEntry, newNode)
                } catch (e) {
                    logger.trace('replicateDataToContact() failed', { error: e })
                }
            }
        } else if (!this.selfIsOneOfClosestPeers(dataEntry.key)) {
            this.localDataStore.setStale(dataEntry.key, getNodeIdFromPeerDescriptor(dataEntry.creator!), true)
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
        const closestPeers = this.getClosestNeighborsTo(dataId, this.redundancyFactor)
        const localNodeId = getNodeIdFromPeerDescriptor(this.localPeerDescriptor)
        const sortedList = new SortedContactList<Contact>({
            referenceId: localNodeId, 
            maxSize: this.redundancyFactor, 
            allowToContainReferenceId: true, 
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.localPeerDescriptor))
        closestPeers.forEach((con) => sortedList.addContact(new Contact(con.getPeerDescriptor())))
        return sortedList.getClosestContacts().some((node) => areEqualNodeIds(node.getNodeId(), localNodeId))
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
            const dhtNodeRemotes = this.getClosestNeighborsTo(dataEntry.key, this.redundancyFactor)
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
        const localNodeId = getNodeIdFromPeerDescriptor(this.localPeerDescriptor)
        const incomingNodeId = getNodeIdFromPeerDescriptor(incomingPeer)
        // TODO use config option or named constant?
        const closestToData = this.getClosestNeighborsTo(dataEntry.key, 10)
        const sortedList = new SortedContactList<Contact>({
            referenceId: getNodeIdFromDataKey(dataEntry.key), 
            maxSize: this.redundancyFactor, 
            allowToContainReferenceId: true, 
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.localPeerDescriptor))
        closestToData.forEach((con) => {
            sortedList.addContact(new Contact(con.getPeerDescriptor()))
        })
        const selfIsPrimaryStorer = (!areEqualNodeIds(sortedList.getAllContacts()[0].getNodeId(), localNodeId))
        const targets = selfIsPrimaryStorer
            // If we are not the closest node to the data, replicate only to the closest one to the data
            ? [sortedList.getAllContacts()[0]]
            // if we are the closest to the data, replicate to all storageRedundancyFactor nearest
            : sortedList.getAllContacts()
        targets.forEach((contact) => {
            const contactNodeId = getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())
            if (!areEqualNodeIds(incomingNodeId, contactNodeId) && !areEqualNodeIds(localNodeId, contactNodeId)) {
                setImmediate(() => {
                    executeSafePromise(async () => {
                        await this.replicateDataToContact(dataEntry, contact.getPeerDescriptor())
                        logger.trace('replicateDataToContact() returned', { 
                            node: getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()),
                            replicateOnlyToClosest: selfIsPrimaryStorer
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
