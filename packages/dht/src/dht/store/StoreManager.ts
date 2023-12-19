import {
    DataEntry, ReplicateDataRequest, PeerDescriptor,
    StoreDataRequest, StoreDataResponse, RecursiveOperation
} from '../../proto/packages/dht/protos/DhtRpc'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RecursiveOperationManager } from '../recursive-operation/RecursiveOperationManager'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, executeSafePromise, hexToBinary } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { StoreRpcRemote } from './StoreRpcRemote'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import { SortedContactList } from '../contact/SortedContactList'
import { Contact } from '../contact/Contact'
import { ServiceID } from '../../types/ServiceID'
import { findIndex } from 'lodash'
import { NodeID, areEqualNodeIds, getNodeIdFromBinary, getNodeIdFromDataKey } from '../../identifiers'
import { StoreRpcLocal } from './StoreRpcLocal'
import { getDistance } from '../PeerManager'

interface StoreManagerConfig {
    rpcCommunicator: RoutingRpcCommunicator
    recursiveOperationManager: RecursiveOperationManager
    localPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: ServiceID
    highestTtl: number
    redundancyFactor: number
    getClosestNeighborsTo: (id: Uint8Array, n?: number) => PeerDescriptor[]
    createRpcRemote: (contact: PeerDescriptor) => StoreRpcRemote
}

const logger = new Logger(module)

export class StoreManager {

    private readonly config: StoreManagerConfig

    constructor(config: StoreManagerConfig) {
        this.config = config
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new StoreRpcLocal({
            localDataStore: this.config.localDataStore,
            replicateDataToNeighbors: (incomingPeer: PeerDescriptor, dataEntry: DataEntry) => this.replicateDataToNeighbors(incomingPeer, dataEntry),
            selfIsWithinRedundancyFactor: (key: Uint8Array): boolean => this.selfIsWithinRedundancyFactor(key)
        })
        this.config.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest) => rpcLocal.storeData(request))
        this.config.rpcCommunicator.registerRpcNotification(ReplicateDataRequest, 'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => rpcLocal.replicateData(request, context))
    }

    onNewContact(peerDescriptor: PeerDescriptor): void {
        for (const dataEntry of this.config.localDataStore.values()) {
            this.replicateAndUpdateStaleState(dataEntry, peerDescriptor)
        }
    }

    private replicateAndUpdateStaleState(dataEntry: DataEntry, newNode: PeerDescriptor): void {
        const newNodeId = getNodeIdFromPeerDescriptor(newNode)
        // TODO use config option or named constant?
        const closestToData = this.config.getClosestNeighborsTo(dataEntry.key, 10)
        const sortedList = new SortedContactList<Contact>({
            referenceId: getNodeIdFromDataKey(dataEntry.key), 
            maxSize: 20,  // TODO use config option or named constant?
            allowToContainReferenceId: true,
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.config.localPeerDescriptor))
        closestToData.forEach((neighbor) => {
            if (!areEqualNodeIds(newNodeId, getNodeIdFromPeerDescriptor(neighbor))) {
                sortedList.addContact(new Contact(neighbor))
            }
        })
        const selfIsPrimaryStorer = areEqualNodeIds(
            sortedList.getClosestContactId(),
            getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        )
        if (selfIsPrimaryStorer) {
            sortedList.addContact(new Contact(newNode))
            const sorted = sortedList.getContactIds()
            // findIndex should never return -1 here because we just added the new node to the list
            const index = findIndex(sorted, (nodeId) => areEqualNodeIds(nodeId, newNodeId))
            // if new node is within the storageRedundancyFactor closest nodes to the data
            // do replicate data to it
            if (index < this.config.redundancyFactor) {
                setImmediate(async () => {
                    await this.replicateDataToContact(dataEntry, newNode)
                })
            }
        } else if (!this.selfIsWithinRedundancyFactor(dataEntry.key)) {
            this.config.localDataStore.setStale(dataEntry.key, getNodeIdFromBinary(dataEntry.creator), true)
        }
    }

    private async replicateDataToContact(dataEntry: DataEntry, contact: PeerDescriptor): Promise<void> {
        const rpcRemote = this.config.createRpcRemote(contact)
        try {
            await rpcRemote.replicateData({ entry: dataEntry })
        } catch (e) {
            logger.trace('replicateData() threw an exception ' + e)
        }
    }

    public async storeDataToDht(key: Uint8Array, data: Any, creator: NodeID): Promise<PeerDescriptor[]> {
        logger.debug(`Storing data to DHT ${this.config.serviceId}`)
        const result = await this.config.recursiveOperationManager.execute(key, RecursiveOperation.FIND_NODE)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.config.highestTtl // ToDo: make TTL decrease according to some nice curve
        const createdAt = Timestamp.now()
        for (let i = 0; i < closestNodes.length && successfulNodes.length < this.config.redundancyFactor; i++) {
            if (areEqualPeerDescriptors(this.config.localPeerDescriptor, closestNodes[i])) {
                this.config.localDataStore.storeEntry({
                    key, 
                    data,
                    creator: hexToBinary(creator),
                    createdAt,
                    storedAt: Timestamp.now(), 
                    ttl, 
                    stale: false,
                    deleted: false,
                })
                successfulNodes.push(closestNodes[i])
                continue
            }
            const rpcRemote = this.config.createRpcRemote(closestNodes[i])
            try {
                await rpcRemote.storeData({
                    key,
                    data,
                    creator: hexToBinary(creator),
                    createdAt,
                    ttl
                })
                successfulNodes.push(closestNodes[i])
                logger.trace('remote.storeData() success')
            } catch (e) {
                logger.trace('remote.storeData() threw an exception ' + e)
            }
        }
        return successfulNodes
    }

    private selfIsWithinRedundancyFactor(dataKey: Uint8Array): boolean {
        const closestNeighbors = this.config.getClosestNeighborsTo(dataKey, this.config.redundancyFactor)
        if (closestNeighbors.length < this.config.redundancyFactor) {
            return true
        } else {
            const localNodeId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
            const furthestCloseNeighbor = getNodeIdFromPeerDescriptor(closestNeighbors[closestNeighbors.length - 1])
            const dataId = getNodeIdFromDataKey(dataKey)
            return getDistance(dataId, localNodeId) < getDistance(dataId, furthestCloseNeighbor)
        }
    }

    private async replicateDataToClosestNodes(): Promise<void> {
        const dataEntries = Array.from(this.config.localDataStore.values())
        await Promise.all(dataEntries.map(async (dataEntry) => {
            const neighbors = this.config.getClosestNeighborsTo(dataEntry.key, this.config.redundancyFactor)
            await Promise.all(neighbors.map(async (neighbor) => {
                const rpcRemote = this.config.createRpcRemote(neighbor)
                try {
                    await rpcRemote.replicateData({ entry: dataEntry })
                } catch (err) {
                    logger.trace('Failed to replicate data in replicateDataToClosestNodes', { error: err })
                }
            }))
        }))
    }

    private replicateDataToNeighbors(incomingPeer: PeerDescriptor, dataEntry: DataEntry): void {
        // sort own contact list according to data id
        const localNodeId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        const incomingNodeId = getNodeIdFromPeerDescriptor(incomingPeer)
        // TODO use config option or named constant?
        const closestToData = this.config.getClosestNeighborsTo(dataEntry.key, 10)
        const sortedList = new SortedContactList<Contact>({
            referenceId: getNodeIdFromDataKey(dataEntry.key), 
            maxSize: this.config.redundancyFactor, 
            allowToContainReferenceId: true, 
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.config.localPeerDescriptor))
        closestToData.forEach((neighbor) => {
            sortedList.addContact(new Contact(neighbor))
        })
        const selfIsPrimaryStorer = areEqualNodeIds(sortedList.getClosestContactId(), localNodeId)
        const targets = selfIsPrimaryStorer
            // if we are the closest to the data, replicate to all storageRedundancyFactor nearest
            ? sortedList.getAllContacts()
            // if we are not the closest node to the data, replicate only to the closest one to the data
            : [sortedList.getAllContacts()[0]]
        targets.forEach((contact) => {
            const contactNodeId = getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())
            if (!areEqualNodeIds(incomingNodeId, contactNodeId) && !areEqualNodeIds(localNodeId, contactNodeId)) {
                setImmediate(() => {
                    executeSafePromise(async () => {
                        await this.replicateDataToContact(dataEntry, contact.getPeerDescriptor())
                        logger.trace('replicateDataToContact() returned', { 
                            node: getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()),
                            replicateOnlyToClosest: !selfIsPrimaryStorer
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
