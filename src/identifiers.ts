import { ControlLayer, TrackerLayer } from 'streamr-client-protocol'
import { RtcSubTypes } from './logic/RtcMessage'

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

export interface StatusStreams {
    [key: string]: { // StreamKey
        inboundNodes: string[]
        outboundNodes: string[]
        counter: number
    }
}

export interface Status {
    streams: StatusStreams
    rtts: Rtts
    location: Location
    started: string
}

export type ResendRequest = ControlLayer.ResendLastRequest
    | ControlLayer.ResendFromRequest
    | ControlLayer.ResendRangeRequest

export type ResendResponse = ControlLayer.ResendResponseNoResend
    | ControlLayer.ResendResponseResending
    | ControlLayer.ResendResponseResent

export type OfferMessage = {
    subType: RtcSubTypes.RTC_OFFER
    data: {
        description: string
    }
}

export type AnswerMessage = {
    subType: RtcSubTypes.RTC_ANSWER
    data: {
        description: string
    }
}

export type RemoteCandidateMessage = {
    subType: RtcSubTypes.REMOTE_CANDIDATE
    data: {
        candidate: string
        mid: string
    }
}

export type RtcConnectMessage = {
    subType: RtcSubTypes.RTC_CONNECT
    data: {
        candidate: string
        mid: string
    }
}

export type LocalDescriptionMessage = {
    subType: RtcSubTypes.LOCAL_DESCRIPTION
    data: {
        type: "answer" | "offer"
        description: string
    }
}

export type LocalCandidateMessage = {
    subType: RtcSubTypes.LOCAL_CANDIDATE
    data: {
        candidate: string
        mid: string
    }
}

export type RelayMessage = (
    OfferMessage
        | AnswerMessage
        | RemoteCandidateMessage
        | RtcConnectMessage
        | LocalDescriptionMessage
        | LocalCandidateMessage
    ) & TrackerLayer.RelayMessage

export interface RtcErrorMessage {
    targetNode: string
    errorCode: string
}