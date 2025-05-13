import { ConnectionStatistics, RpcRemote } from '@streamr/dht'
import { Logger, StreamPartID } from '@streamr/utils'
import {
    LeaveStreamPartNotice,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { EventEmitter } from 'eventemitter3'
const logger = new Logger(module)

export interface ContentDeliveryRpcRemoteEvents {
    statisticsChanged: (statistics: ConnectionStatistics) => void
}

export class ContentDeliveryRpcRemote extends RpcRemote<ContentDeliveryRpcClient> {

    private rtt?: number
    private statistics: ConnectionStatistics = {
        uploadRateBytesPerSecond: 0,
        downloadRateBytesPerSecond: 0,
        bufferedAmount: 0
    }
    public readonly emitter: EventEmitter<ContentDeliveryRpcRemoteEvents> = new EventEmitter<ContentDeliveryRpcRemoteEvents>()
    
    async sendStreamMessage(msg: StreamMessage, doNotBufferWhileConnecting?: boolean): Promise<void> {
        const options = this.formDhtRpcOptions({
            notification: true,
            doNotBufferWhileConnecting
        })
        this.getClient().sendStreamMessage(msg, options).catch(() => {
            logger.trace('Failed to sendStreamMessage')
        })
    }

    leaveStreamPartNotice(streamPartId: StreamPartID, isLocalNodeEntryPoint: boolean): void {
        const notification: LeaveStreamPartNotice = {
            streamPartId,
            isEntryPoint: isLocalNodeEntryPoint
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().leaveStreamPartNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamPartNotice')
        })
    }

    setRtt(rtt: number): void {
        this.rtt = rtt
    }

    getRtt(): number | undefined {
        return this.rtt
    }

    setStatistics(statistics: ConnectionStatistics): void {
        if (statistics != this.statistics) {
            this.statistics = statistics
            this.emitter.emit('statisticsChanged', statistics)
        }
    }

    getStatistics(): ConnectionStatistics {
        return this.statistics
    }
}
