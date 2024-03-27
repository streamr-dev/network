import {
    DataEntry, ReplicateDataRequest, PeerDescriptor,
    StoreDataRequest, StoreDataResponse, RecursiveOperation
} from '../../proto/packages/dht/protos/DhtRpc'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RecursiveOperationManager } from '../recursive-operation/RecursiveOperationManager'
import { Logger, executeSafePromise } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { StoreRpcRemote } from './StoreRpcRemote'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import { SortedContactList } from '../contact/SortedContactList'
import { Contact } from '../contact/Contact'
import { ServiceID } from '../../types/ServiceID'
import { DhtAddress, areEqualPeerDescriptors, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../identifiers'
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
    getClosestNeighborsTo: (dataKey: DhtAddress, n?: number) => PeerDescriptor[]
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
            selfIsWithinRedundancyFactor: (key: DhtAddress): boolean => this.selfIsWithinRedundancyFactor(key)
        })
        this.config.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest) => rpcLocal.storeData(request))
        this.config.rpcCommunicator.registerRpcNotification(ReplicateDataRequest, 'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => rpcLocal.replicateData(request, context))
    }

    onContactAdded(peerDescriptor: PeerDescriptor): void {
        for (const key of this.config.localDataStore.keys()) {
            this.replicateAndUpdateStaleState(key, peerDescriptor)
        }
    }

    private replicateAndUpdateStaleState(key: DhtAddress, newNode: PeerDescriptor): void {
        const newNodeId = getNodeIdFromPeerDescriptor(newNode)
        const closestToData = this.config.getClosestNeighborsTo(key, this.config.redundancyFactor)
        const sortedList = new SortedContactList<Contact>({
            referenceId: key, 
            maxSize: this.config.redundancyFactor,
            allowToContainReferenceId: true,
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.config.localPeerDescriptor))
        closestToData.forEach((neighbor) => {
            if (newNodeId !== getNodeIdFromPeerDescriptor(neighbor)) {
                sortedList.addContact(new Contact(neighbor))
            }
        })
        const selfIsPrimaryStorer = (sortedList.getClosestContactId() === getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor))
        if (selfIsPrimaryStorer) {
            sortedList.addContact(new Contact(newNode))
            if (sortedList.getContact(newNodeId) !== undefined) {
                setImmediate(async () => {
                    const dataEntries = Array.from(this.config.localDataStore.values(key))
                    await Promise.all(dataEntries.map(async (dataEntry) => this.replicateDataToContact(dataEntry, newNode)))
                })
            }
        } else if (!this.selfIsWithinRedundancyFactor(key)) {
            this.config.localDataStore.setAllEntriesAsStale(key)
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

    public async storeDataToDht(key: DhtAddress, data: Any, creator: DhtAddress): Promise<PeerDescriptor[]> {
        logger.debug(`Storing data to DHT ${this.config.serviceId}`)
        const result = await this.config.recursiveOperationManager.execute(key, RecursiveOperation.FIND_CLOSEST_NODES)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.config.highestTtl // ToDo: make TTL decrease according to some nice curve
        const createdAt = Timestamp.now()
        for (let i = 0; i < closestNodes.length && successfulNodes.length < this.config.redundancyFactor; i++) {
            const keyRaw = getRawFromDhtAddress(key)
            const creatorRaw = getRawFromDhtAddress(creator)
            if (areEqualPeerDescriptors(this.config.localPeerDescriptor, closestNodes[i])) {
                this.config.localDataStore.storeEntry({
                    key: keyRaw,
                    data,
                    creator: creatorRaw,
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
                    key: keyRaw,
                    data,
                    creator: creatorRaw,
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

    private selfIsWithinRedundancyFactor(dataKey: DhtAddress): boolean {
        const closestNeighbors = this.config.getClosestNeighborsTo(dataKey, this.config.redundancyFactor)
        if (closestNeighbors.length < this.config.redundancyFactor) {
            return true
        } else {
            const furthestCloseNeighbor = closestNeighbors[closestNeighbors.length - 1]
            const dataKeyRaw = getRawFromDhtAddress(dataKey)
            return getDistance(dataKeyRaw, this.config.localPeerDescriptor.nodeId) < getDistance(dataKeyRaw, furthestCloseNeighbor.nodeId)
        }
    }

    private async replicateDataToClosestNodes(): Promise<void> {
        const dataEntries = Array.from(this.config.localDataStore.values())
        await Promise.all(dataEntries.map(async (dataEntry) => {
            const neighbors = this.config.getClosestNeighborsTo(getDhtAddressFromRaw(dataEntry.key), this.config.redundancyFactor)
            await Promise.all(neighbors.map(async (neighbor) => {
                const rpcRemote = this.config.createRpcRemote(neighbor)
                try {
                    await rpcRemote.replicateData({ entry: dataEntry })
                } catch (err) {
                    logger.trace('Failed to replicate data in replicateDataToClosestNodes', { err })
                }
            }))
        }))
    }

    private replicateDataToNeighbors(incomingPeer: PeerDescriptor, dataEntry: DataEntry): void {
        // sort own contact list according to data id
        const localNodeId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        const incomingNodeId = getNodeIdFromPeerDescriptor(incomingPeer)
        const key = getDhtAddressFromRaw(dataEntry.key)
        // TODO use config option or named constant?
        const closestToData = this.config.getClosestNeighborsTo(key, 10)
        const sortedList = new SortedContactList<Contact>({
            referenceId: key, 
            maxSize: this.config.redundancyFactor, 
            allowToContainReferenceId: true, 
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.config.localPeerDescriptor))
        closestToData.forEach((neighbor) => {
            sortedList.addContact(new Contact(neighbor))
        })
        const selfIsPrimaryStorer = (sortedList.getClosestContactId() === localNodeId)
        const targetLimit = selfIsPrimaryStorer
            // if we are the closest to the data, replicate to all storageRedundancyFactor nearest
            ? undefined
            // if we are not the closest node to the data, replicate only to the closest one to the data
            : 1
        const targets = sortedList.getClosestContacts(targetLimit)
        targets.forEach((contact) => {
            const contactNodeId = contact.getNodeId()
            if ((incomingNodeId !== contactNodeId) && (localNodeId !== contactNodeId)) {
                setImmediate(() => {
                    executeSafePromise(async () => {
                        await this.replicateDataToContact(dataEntry, contact.getPeerDescriptor())
                        logger.trace('replicateDataToContact() returned', { 
                            node: contactNodeId,
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
