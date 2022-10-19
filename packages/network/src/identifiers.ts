import { StreamID } from 'streamr-client-protocol'
import { MetricsContext } from '@streamr/utils'

export type NodeId = string
export type TrackerId = string

export type Rtts = Record<string, number>

export interface Location {
    latitude?: number
    longitude?: number
    country?: string
    city?: string
}

export interface StreamPartStatus {
    id: StreamID
    partition: number
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

export interface AbstractNodeOptions {
    id?: NodeId
    location?: Location
    metricsContext?: MetricsContext
    trackerPingInterval?: number
}
