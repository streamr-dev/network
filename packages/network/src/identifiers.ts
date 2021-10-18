import { SmartContractRecord, TrackerLayer } from 'streamr-client-protocol'
import { NodeId } from './logic/node/Node'
import { MetricsContext } from './helpers/MetricsContext'

/**
 * Uniquely identifies a stream
 */
export class StreamIdAndPartition {
    public readonly id: string
    public readonly partition: number

    constructor(id: string, partition: number) {
        if (typeof id !== 'string') {
            throw new Error(`invalid id: ${id}`)
        }
        if (!Number.isInteger(partition)) {
            throw new Error(`invalid partition: ${partition}`)
        }
        this.id = id
        this.partition = partition
    }

    key(): StreamKey {
        return this.toString()
    }

    toString(): string {
        return `${this.id}::${this.partition}`
    }

    static fromMessage(message: { streamId: string, streamPartition: number }): StreamIdAndPartition {
        return new StreamIdAndPartition(message.streamId, message.streamPartition)
    }

    static fromKey(key: string): StreamIdAndPartition {
        const [id, partition] = key.split('::')
        return new StreamIdAndPartition(id, Number.parseInt(partition, 10))
    }
}

export type StreamKey = string // Represents format streamId::streamPartition

export interface Rtts {
    [key: string]: number
}

export interface Location {
    latitude: number | null
    longitude: number | null
    country: string | null
    city: string | null
}

export interface StreamStatus {
    streamKey: StreamKey
    inboundNodes: NodeId[]
    outboundNodes: NodeId[]
    counter: number // TODO this field could be a field of "Status" interface, not this interface?
}

export interface Status {
    stream: StreamStatus
    rtts: Rtts | null
    location: Location
    started: string
    extra: Record<string, unknown>
}

export enum RtcSubTypes {
    ICE_CANDIDATE = 'iceCandidate',
    RTC_OFFER = 'rtcOffer',
    RTC_ANSWER = 'rtcAnswer',
    RTC_CONNECT = 'rtcConnect',
}

export type RtcIceCandidateMessage = {
    subType: RtcSubTypes.ICE_CANDIDATE
    data: {
        connectionId: string,
        candidate: string
        mid: string
    }
}

export type RtcConnectMessage = {
    subType: RtcSubTypes.RTC_CONNECT
    data: {
        force: boolean
    }
}

export type RtcOfferMessage = {
    subType: RtcSubTypes.RTC_OFFER
    data: {
        connectionId: string,
        description: string,
    }
}

export type RtcAnswerMessage = {
    subType: RtcSubTypes.RTC_ANSWER
    data: {
        connectionId: string,
        description: string
    }
}

export type RelayMessage = (
    RtcOfferMessage
        | RtcAnswerMessage
        | RtcIceCandidateMessage
        | RtcConnectMessage
    ) & TrackerLayer.RelayMessage

export interface RtcErrorMessage {
    targetNode: NodeId
    errorCode: string
}

export type TrackerInfo = SmartContractRecord

export interface AbstractNodeOptions {
    id?: NodeId
    name?: string
    location?: Location | null
    metricsContext?: MetricsContext
    trackerPingInterval?: number
}
