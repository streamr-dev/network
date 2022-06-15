import { SmartContractRecord, StreamID } from 'streamr-client-protocol'
import { MetricsContext } from './helpers/Metric'

export type NodeId = string
export type TrackerId = string

export interface Rtts {
    [key: string]: number
}

export interface Location {
    latitude?: number
    longitude?: number
    country?: string
    city?: string
}

export interface StreamPartStatus {
    id: StreamID
    partition: number,
    neighbors: NodeId[]
    counter: number
}

export interface Status {
    streamPart: StreamPartStatus
    rtts: Rtts | null
    location?: Location
    started: string
    version?: string
    extra: Record<string, unknown>
}

export interface RtcErrorMessage {
    targetNode: NodeId
    errorCode: string
}

export type TrackerInfo = SmartContractRecord

export interface AbstractNodeOptions {
    id?: NodeId
    location?: Location
    metricsContext?: MetricsContext
    trackerPingInterval?: number
}
