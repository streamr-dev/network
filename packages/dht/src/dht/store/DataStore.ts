import { PeerDescriptor, StoreDataRequest, StoreDataResponse } from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../helpers/PeerID'
import { Any } from '../../proto/google/protobuf/any'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { StoreServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { Router } from '../routing/Router'
import { RecursiveFinder } from '../find/RecursiveFinder'
import { isSamePeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger } from '@streamr/utils'
import { LocalDataStore } from './LocalDataStore'
import { IStoreService } from '../../proto/packages/dht/protos/DhtRpc.server'
import { RemoteStore } from './RemoteStore'

interface DataStoreConfig {
    rpcCommunicator: RoutingRpcCommunicator
    router: Router
    recursiveFinder: RecursiveFinder
    ownPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: string
    storeMaxTtl: number
    storeHighestTtl: number
    storeNumberOfCopies: number
}

const logger = new Logger(module)

export class DataStore implements IStoreService {

    private readonly config: DataStoreConfig

    constructor(config: DataStoreConfig) {
        this.config = config
        this.storeData = this.storeData.bind(this)
        this.config.rpcCommunicator!.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', this.storeData)
    }

    public async storeDataToDht(key: Uint8Array, data: Any): Promise<PeerDescriptor[]> {
        logger.info(`Storing data to DHT ${this.config.serviceId} with key ${PeerID.fromValue(key)}`)
        const result = await this.config.recursiveFinder!.startRecursiveFind(key)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.config.storeHighestTtl // ToDo: make TTL decrease according to some nice curve
        for (let i = 0; i < closestNodes.length && successfulNodes.length < 5; i++) {
            if (isSamePeerDescriptor(this.config.ownPeerDescriptor, closestNodes[i])) {
                this.config.localDataStore.storeEntry(closestNodes[i], PeerID.fromValue(key), data, ttl)
                successfulNodes.push(closestNodes[i])
                continue
            }
            const dhtPeer = new RemoteStore(
                this.config.ownPeerDescriptor,
                closestNodes[i],
                toProtoRpcClient(new StoreServiceClient(this.config.rpcCommunicator.getRpcClientTransport())),
                this.config.serviceId
            )
            try {
                const response = await dhtPeer.storeData({ kademliaId: key, data, ttl })
                if (response.error) {
                    logger.debug('dhtPeer.storeData() returned error: ' + response.error)
                    continue
                }
            } catch (e) {
                logger.debug('dhtPeer.storeData() threw an exception ' + e)
                continue
            }
            successfulNodes.push(closestNodes[i])
            logger.trace('dhtPeer.storeData() returned success')
        }
        return successfulNodes
    }

    // RPC service implementation
    async storeData(request: StoreDataRequest, context: ServerCallContext): Promise<StoreDataResponse> {
        let ttl = request.ttl
        if (ttl > this.config.storeMaxTtl) {
            ttl = this.config.storeMaxTtl
        }
        this.config.localDataStore.storeEntry(
            (context as DhtCallContext).incomingSourceDescriptor!,
            PeerID.fromValue(request.kademliaId),
            request.data!,
            ttl
        )
        logger.trace(this.config.ownPeerDescriptor.nodeName + ' storeData()')
        return StoreDataResponse.create()
    }

}
