import {
    DataEntry, ReplicateDataRequest, PeerDescriptor,
    StoreDataRequest, StoreDataResponse, RecursiveOperation
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../helpers/PeerID'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StoreRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { IRecursiveOperationManager } from '../recursive-operation/RecursiveOperationManager'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, executeSafePromise } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { StoreRpcRemote } from './StoreRpcRemote'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import { SortedContactList } from '../contact/SortedContactList'
import { Contact } from '../contact/Contact'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { ServiceID } from '../../types/ServiceID'
import { findIndex } from 'lodash'
import { StoreRpcLocal } from './StoreRpcLocal'

interface StoreManagerConfig {
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

export class StoreManager {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly recursiveOperationManager: IRecursiveOperationManager
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly localDataStore: LocalDataStore
    private readonly serviceId: ServiceID
    private readonly highestTtl: number
    private readonly redundancyFactor: number
    private readonly rpcRequestTimeout?: number
    private readonly getClosestNeighborsTo: (id: Uint8Array, n?: number) => DhtNodeRpcRemote[]

    constructor(config: StoreManagerConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.recursiveOperationManager = config.recursiveOperationManager
        this.localPeerDescriptor = config.localPeerDescriptor
        this.localDataStore = config.localDataStore
        this.serviceId = config.serviceId
        this.highestTtl = config.highestTtl
        this.redundancyFactor = config.redundancyFactor
        this.rpcRequestTimeout = config.rpcRequestTimeout
        this.getClosestNeighborsTo = config.getClosestNeighborsTo
        this.registerLocalRpcMethods(config)
    }

    private registerLocalRpcMethods(config: StoreManagerConfig) {
        const rpcLocal = new StoreRpcLocal({
            localDataStore: config.localDataStore,
            replicateDataToNeighbors: (incomingPeer: PeerDescriptor, dataEntry: DataEntry) => this.replicateDataToNeighbors(incomingPeer, dataEntry),
            selfIsOneOfClosestPeers: (key: Uint8Array): boolean => this.selfIsOneOfClosestPeers(key)
        })
        this.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest) => rpcLocal.storeData(request))
        this.rpcCommunicator.registerRpcNotification(ReplicateDataRequest, 'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => rpcLocal.replicateData(request, context))
    }

    onNewContact(peerDescriptor: PeerDescriptor): void {
        for (const dataEntry of this.localDataStore.values()) {
            this.replicateAndUpdateStaleState(dataEntry, peerDescriptor)
        }
    }

    private async replicateAndUpdateStaleState(dataEntry: DataEntry, newNode: PeerDescriptor): Promise<void> {
        const newNodeId = PeerID.fromValue(newNode.nodeId)
        // TODO use config option or named constant?
        const closestToData = this.getClosestNeighborsTo(dataEntry.key, 10)
        const sortedList = new SortedContactList<Contact>({
            referenceId: PeerID.fromValue(dataEntry.key), 
            maxSize: 20,  // TODO use config option or named constant?
            allowToContainReferenceId: true,
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.localPeerDescriptor))
        closestToData.forEach((con) => {
            if (!newNodeId.equals(PeerID.fromValue(con.getPeerDescriptor().nodeId))) {
                sortedList.addContact(new Contact(con.getPeerDescriptor()))
            }
        })
        const selfIsPrimaryStorer = sortedList.getAllContacts()[0].getPeerId().equals(PeerID.fromValue(this.localPeerDescriptor.nodeId))
        if (selfIsPrimaryStorer) {
            sortedList.addContact(new Contact(newNode))
            const sorted = sortedList.getAllContacts()
            // findIndex should never return -1 here because we just added the new node to the list
            const index = findIndex(sorted, (contact) => contact.getPeerId().equals(newNodeId))
            // if new node is within the storageRedundancyFactor closest nodes to the data
            // do replicate data to it
            if (index < this.redundancyFactor) {
                setImmediate(async () => {
                    await this.replicateDataToContact(dataEntry, newNode)
                })
            }
        } else if (!this.selfIsOneOfClosestPeers(dataEntry.key)) {
            this.localDataStore.setStale(dataEntry.key, peerIdFromPeerDescriptor(dataEntry.creator!), true)
        }
    }

    private async replicateDataToContact(dataEntry: DataEntry, contact: PeerDescriptor, doNotConnect: boolean = false): Promise<void> {
        const rpcRemote = this.createRpcRemote(contact)
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
            const rpcRemote = this.createRpcRemote(closestNodes[i])
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
        const closestPeers = this.getClosestNeighborsTo(dataId, this.redundancyFactor)
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

    private async replicateDataToClosestNodes(): Promise<void> {
        const dataEntries = Array.from(this.localDataStore.values())
        await Promise.all(dataEntries.map(async (dataEntry) => {
            const dhtNodeRemotes = this.getClosestNeighborsTo(dataEntry.key, this.redundancyFactor)
            await Promise.all(dhtNodeRemotes.map(async (remoteDhtNode) => {
                const rpcRemote = this.createRpcRemote(remoteDhtNode.getPeerDescriptor())
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
        const localPeerId = PeerID.fromValue(this.localPeerDescriptor.nodeId)
        const dataId = PeerID.fromValue(dataEntry.key)
        const incomingPeerId = PeerID.fromValue(incomingPeer.nodeId)
        // TODO use config option or named constant?
        const closestToData = this.getClosestNeighborsTo(dataEntry.key, 10)
        const sortedList = new SortedContactList<Contact>({
            referenceId: dataId, 
            maxSize: this.redundancyFactor, 
            allowToContainReferenceId: true, 
            emitEvents: false
        })
        sortedList.addContact(new Contact(this.localPeerDescriptor))
        closestToData.forEach((con) => {
            sortedList.addContact(new Contact(con.getPeerDescriptor()))
        })
        const selfIsPrimaryStorer = (!sortedList.getAllContacts()[0].getPeerId().equals(localPeerId))
        const targets = selfIsPrimaryStorer
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
                            replicateOnlyToClosest: selfIsPrimaryStorer
                        })
                    })
                })
            }
        })
    }

    private createRpcRemote(contact: PeerDescriptor): StoreRpcRemote {
        return new StoreRpcRemote(
            this.localPeerDescriptor,
            contact,
            this.serviceId,
            toProtoRpcClient(new StoreRpcClient(this.rpcCommunicator.getRpcClientTransport())),
            this.rpcRequestTimeout
        )
    }

    async destroy(): Promise<void> {
        await this.replicateDataToClosestNodes()
    }
}
