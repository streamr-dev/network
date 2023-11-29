import { ConnectionManager, DhtNode, DhtNodeOptions, areEqualPeerDescriptors } from '@streamr/dht'
import { DeliveryLayer, DeliveryLayerConfig } from './logic/DeliveryLayer'
import { Logger, MetricsContext, waitForCondition } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { StreamID, StreamPartID, toStreamPartID } from '@streamr/protocol'
import { ProxyDirection, StreamMessage, StreamMessageType } from './proto/packages/trackerless-network/protos/NetworkRpc'
import { Layer0Node } from './logic/Layer0Node'
import { getNodeIdFromPeerDescriptor } from './identifiers'

export interface NetworkOptions {
    layer0?: DhtNodeOptions
    networkNode?: DeliveryLayerConfig
    metricsContext?: MetricsContext
}

export interface NetworkStackEvents {
    stopped: () => void
}

const logger = new Logger(module)

export class NetworkStack extends EventEmitter<NetworkStackEvents> {

    private layer0Node?: Layer0Node
    private deliveryLayer?: DeliveryLayer
    private readonly metricsContext: MetricsContext
    private readonly options: NetworkOptions

    constructor(options: NetworkOptions) {
        super()
        this.options = options
        this.metricsContext = options.metricsContext ?? new MetricsContext()
        this.layer0Node = new DhtNode({
            ...options.layer0,
            metricsContext: this.metricsContext
        })
        this.deliveryLayer = new DeliveryLayer({
            ...options.networkNode,
            metricsContext: this.metricsContext
        })
    }

    async joinStreamPart(streamPartId: StreamPartID, neighborRequirement?: { minCount: number, timeout: number }): Promise<void> {
        if (this.getDeliveryLayer().isProxiedStreamPart(streamPartId)) {
            throw new Error(`Cannot join to ${streamPartId} as proxy connections have been set`)
        }
        await this.ensureConnectedToControlLayer()
        this.getDeliveryLayer().joinStreamPart(streamPartId)
        if (neighborRequirement !== undefined) {
            await waitForCondition(() => {
                return this.getDeliveryLayer().getNeighbors(streamPartId).length >= neighborRequirement.minCount
            }, neighborRequirement.timeout)
        }
    }

    async broadcast(msg: StreamMessage): Promise<void> {
        const streamPartId = toStreamPartID(msg.messageId!.streamId as StreamID, msg.messageId!.streamPartition)
        if (this.getDeliveryLayer().isProxiedStreamPart(streamPartId, ProxyDirection.SUBSCRIBE) && (msg.messageType === StreamMessageType.MESSAGE)) {
            throw new Error(`Cannot broadcast to ${streamPartId} as proxy subscribe connections have been set`)
        }
        // TODO could combine these two calls to isProxiedStreamPart?
        if (!this.deliveryLayer!.isProxiedStreamPart(streamPartId)) {
            await this.ensureConnectedToControlLayer()
        }
        this.getDeliveryLayer().broadcast(msg)
    }

    async start(doJoin = true): Promise<void> {
        await this.layer0Node!.start()
        logger.info(`Starting node with id ${getNodeIdFromPeerDescriptor(this.layer0Node!.getLocalPeerDescriptor())}`)
        const connectionManager = this.layer0Node!.getTransport() as ConnectionManager
        if ((this.options.layer0?.entryPoints !== undefined) && (this.options.layer0.entryPoints.some((entryPoint) => 
            areEqualPeerDescriptors(entryPoint, this.layer0Node!.getLocalPeerDescriptor())
        ))) {
            await this.layer0Node?.joinDht(this.options.layer0.entryPoints)
        } else {
            if (doJoin) {
                // in practice there aren't be existing connections and therefore this always connects
                await this.ensureConnectedToControlLayer()
            }
        }
        await this.deliveryLayer?.start(this.layer0Node!, connectionManager, connectionManager)
    }

    private async ensureConnectedToControlLayer(): Promise<void> {
        // TODO we could wrap joinDht with pOnce and call it here (no else-if needed in that case)
        if (!this.layer0Node!.hasJoined()) {
            setImmediate(async () => {
                if (this.options.layer0?.entryPoints !== undefined) {
                    // TODO should catch possible rejection?
                    // the question mark is there to avoid problems when stop() is called before start()
                    // -> TODO change to exlamation mark if we don't support that (and remove NetworkStackStoppedDuringStart.test)
                    await this.layer0Node?.joinDht(this.options.layer0.entryPoints)
                }
            })
        }
        await this.layer0Node!.waitForNetworkConnectivity()
    }

    getDeliveryLayer(): DeliveryLayer {
        return this.deliveryLayer!
    }

    getLayer0Node(): Layer0Node {
        return this.layer0Node!
    }

    getMetricsContext(): MetricsContext {
        return this.metricsContext
    }

    async stop(): Promise<void> {
        await this.deliveryLayer!.destroy()
        await this.layer0Node!.stop()
        this.deliveryLayer = undefined
        this.layer0Node = undefined
        this.emit('stopped')
    }

}
