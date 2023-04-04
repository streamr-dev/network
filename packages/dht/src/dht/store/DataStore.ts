import {
    DataEntry, MigrateDataRequest, MigrateDataResponse, PeerDescriptor,
    StoreDataRequest, StoreDataResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../helpers/PeerID'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StoreServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { IRouter } from '../routing/Router'
import { IRecursiveFinder } from '../find/RecursiveFinder'
import { isSamePeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { IStoreService } from '../../proto/packages/dht/protos/DhtRpc.server'
import { RemoteStore } from './RemoteStore'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import EventEmitter from 'eventemitter3'
import { Events } from '../DhtNode'
import { SortedContactList } from '../contact/SortedContactList'
import { Contact } from '../contact/Contact'
import { DhtPeer } from '../DhtPeer'

interface DataStoreConfig {
    rpcCommunicator: RoutingRpcCommunicator
    router: IRouter
    recursiveFinder: IRecursiveFinder
    ownPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: string
    storeMaxTtl: number
    storeHighestTtl: number
    storeNumberOfCopies: number
    dhtNodeEmitter: EventEmitter<Events>
    getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => DhtPeer[]
}

const logger = new Logger(module)

export class DataStore implements IStoreService {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly router: IRouter
    private readonly recursiveFinder: IRecursiveFinder
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly localDataStore: LocalDataStore
    private readonly serviceId: string
    private readonly storeMaxTtl: number
    private readonly storeHighestTtl: number
    private readonly storeNumberOfCopies: number
    private readonly dhtNodeEmitter: EventEmitter<Events>
    private readonly getNodesClosestToIdFromBucket: (id: Uint8Array, n?: number) => DhtPeer[]

    constructor(config: DataStoreConfig) {
        this.storeData = this.storeData.bind(this)
        this.migrateData = this.migrateData.bind(this)
        this.rpcCommunicator = config.rpcCommunicator
        this.router = config.router
        this.recursiveFinder = config.recursiveFinder
        this.ownPeerDescriptor = config.ownPeerDescriptor
        this.localDataStore = config.localDataStore
        this.serviceId = config.serviceId
        this.storeMaxTtl = config.storeMaxTtl
        this.storeHighestTtl = config.storeHighestTtl
        this.storeNumberOfCopies = config.storeNumberOfCopies
        this.dhtNodeEmitter = config.dhtNodeEmitter
        this.getNodesClosestToIdFromBucket = config.getNodesClosestToIdFromBucket
        this.rpcCommunicator!.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', this.storeData)
        this.rpcCommunicator!.registerRpcMethod(MigrateDataRequest, MigrateDataResponse, 'migrateData', this.migrateData)

        this.dhtNodeEmitter.on('newContact', (peerDescriptor: PeerDescriptor, _closestPeers: PeerDescriptor[]) => {

            this.localDataStore.store.forEach((dataMap, _dataKey) => {
                dataMap.forEach((dataEntry) => {
                    //if (this.isFurtherFromDataThan(dataEntry, contact) &&
                    //    this.isFurtherstStorerOf(dataEntry)) 
                    if (this.shouldMigrateDataToNewNode(dataEntry, peerDescriptor)) {

                        this.migrateDataToContact(dataEntry, peerDescriptor)

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
        sortedList.addContact(new Contact(this.ownPeerDescriptor!))

        closestToData.forEach((con) => {
            if (!newNodeId.equals(PeerID.fromValue(con.getPeerDescriptor().kademliaId))) {
                sortedList.addContact(new Contact(con.getPeerDescriptor()))
            }
        })

        //const closestToDat = sortedList.getAllContacts()
        if (!sortedList.getAllContacts()[0].getPeerId().equals(ownPeerId!)) {
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

        // if new node is within the 5 closest nodes to the data
        // do migrate data to it

        if (index < 5) {
            return true
        } else {
            return false
        }
    }

    private async migrateDataToContact(dataEntry: DataEntry, contact: PeerDescriptor, doNotConnect: boolean = false): Promise<void> {
        const remoteStore = new RemoteStore(
            this.ownPeerDescriptor,
            contact,
            toProtoRpcClient(new StoreServiceClient(this.rpcCommunicator.getRpcClientTransport())),
            this.serviceId
        )
        try {
            const response = await remoteStore.migrateData({ dataEntry }, doNotConnect)
            if (response.error) {
                logger.error('RemoteStore::migrateData() returned error: ' + response.error)
            }
        } catch (e) {
            logger.error('RemoteStore::migrateData() threw an exception ' + e)
        }
    }

    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        logger.info(`Storing data to DHT ${this.serviceId} with key ${PeerID.fromValue(key)}`)
        const result = await this.recursiveFinder!.startRecursiveFind(key)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.storeHighestTtl // ToDo: make TTL decrease according to some nice curve
        for (let i = 0; i < closestNodes.length && successfulNodes.length < 5; i++) {
            if (isSamePeerDescriptor(this.ownPeerDescriptor, closestNodes[i])) {
                this.localDataStore.storeEntry({
                    kademliaId: key, storer: this.ownPeerDescriptor,
                    ttl, storedAt: Timestamp.now(), data
                })
                successfulNodes.push(closestNodes[i])
                continue
            }
            const remoteStore = new RemoteStore(
                this.ownPeerDescriptor,
                closestNodes[i],
                toProtoRpcClient(new StoreServiceClient(this.rpcCommunicator.getRpcClientTransport())),
                this.serviceId
            )
            try {
                const response = await remoteStore.storeData({ kademliaId: key, data, ttl })
                if (!response.error) {
                    successfulNodes.push(closestNodes[i])
                    logger.trace('remoteStore.storeData() returned success')
                } else {
                    logger.debug('remoteStore.storeData() returned error: ' + response.error)
                }
            } catch (e) {
                logger.debug('remoteStore.storeData() threw an exception ' + e)
            }
        }
        return successfulNodes
    }

    // RPC service implementation
    async storeData(request: StoreDataRequest, context: ServerCallContext): Promise<StoreDataResponse> {
        const ttl = Math.min(request.ttl, this.storeMaxTtl)
        const { incomingSourceDescriptor } = context as DhtCallContext
        const { kademliaId, data } = request

        this.localDataStore.storeEntry({ kademliaId: kademliaId, storer: incomingSourceDescriptor!, ttl, storedAt: Timestamp.now(), data })

        logger.trace(this.ownPeerDescriptor.nodeName + ' storeData()')
        return StoreDataResponse.create()
    }

    // RPC service implementation
    public async migrateData(request: MigrateDataRequest, context: ServerCallContext): Promise<MigrateDataResponse> {
        logger.info(this.ownPeerDescriptor.nodeName + ' server-side migrateData()')
        const dataEntry = request.dataEntry!

        this.localDataStore.storeEntry(dataEntry)

        this.migrateDataToNeighborsIfNeeded((context as DhtCallContext).incomingSourceDescriptor!, request.dataEntry!)

        logger.info(this.ownPeerDescriptor.nodeName + ' server-side migrateData() at end')
        return MigrateDataResponse.create()
    }

    private migrateDataToNeighborsIfNeeded(incomingPeer: PeerDescriptor, dataEntry: DataEntry): void {

        // sort own contact list according to data id
        const ownPeerId = PeerID.fromValue(this.ownPeerDescriptor!.kademliaId)
        const dataId = PeerID.fromValue(dataEntry.kademliaId)
        const incomingPeerId = PeerID.fromValue(incomingPeer.kademliaId)
        const closestToData = this.getNodesClosestToIdFromBucket(dataEntry.kademliaId, 10)
        // this.getNeighborList().getAllContacts() // this.bucket!.closest(dataEntry.kademliaId, 10)
        //this.getNeighborList().getAllContacts() // this.bucket!.closest(dataEntry.kademliaId, 10)

        const sortedList = new SortedContactList<Contact>(dataId, 5, undefined, true)
        sortedList.addContact(new Contact(this.ownPeerDescriptor!))

        closestToData.forEach((con) => {
            sortedList.addContact(new Contact(con.getPeerDescriptor()))
        })

        /*
        if (!sortedList.getAllContacts()[0].peerId.equals(this.ownPeerId!)) {
            // If we are not the closest node to the data, do not migrate
            return false
        }
        */

        if (!sortedList.getAllContacts()[0].getPeerId().equals(ownPeerId)) {
            // If we are not the closest node to the data, migrate only to the 
            // closest one to the data

            const contact = sortedList.getAllContacts()[0]
            const contactPeerId = PeerID.fromValue(contact.getPeerDescriptor().kademliaId)
            if (!incomingPeerId.equals(contactPeerId) &&
                !ownPeerId.equals(contactPeerId)) {
                this.migrateDataToContact(dataEntry, contact.getPeerDescriptor()).then(() => {
                    logger.info('migrateDataToContact() returned when migrating to only the closest contact')
                }).catch((e) => {
                    logger.error('migrating data to only the closest contact failed ' + e)
                })
            }
        } else {
            // if we are the closest to the data, migrate to all 5 nearest

            sortedList.getAllContacts().forEach((contact) => {
                const contactPeerId = PeerID.fromValue(contact.getPeerDescriptor().kademliaId)
                if (!incomingPeerId.equals(contactPeerId) &&
                    !ownPeerId.equals(contactPeerId)) {
                    this.migrateDataToContact(dataEntry, contact.getPeerDescriptor()).then(() => {
                        logger.info('migrateDataToContact() returned')
                    }).catch((e) => {
                        logger.error('migrating data to one of the closest contacts failed ' + e)
                    })
                }
            })
        }

        logger.info('migrateDataToNeighborsIfNeeded() sortedContacts')
        sortedList.getAllContacts().forEach((contact) => {
            logger.info('' + contact.getPeerDescriptor().nodeName)
        })

    }
}
