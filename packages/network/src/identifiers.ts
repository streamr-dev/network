import { SmartContractRecord, SPIDKey, TrackerLayer } from 'streamr-client-protocol'
import { NodeId } from './logic/node/Node'

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
    spidKey: SPIDKey
    neighbors: NodeId[]
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
