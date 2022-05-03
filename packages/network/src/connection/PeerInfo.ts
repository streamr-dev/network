import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { Location, NodeId, TrackerId } from '../identifiers'

export type PeerId = NodeId | TrackerId | string

export enum PeerType {
    Tracker = 'tracker',
    Node = 'node',
    Unknown = 'unknown'
}

interface ObjectRepresentation {
    peerId: PeerId
    peerType: string
    controlLayerVersions: number[] | null
    messageLayerVersions: number[] | null
    location?: Location | null | undefined
}

const defaultControlLayerVersions = ControlLayer.ControlMessage.getSupportedVersions()
const defaultMessageLayerVersions = MessageLayer.StreamMessage.getSupportedVersions()

export class PeerInfo {
    static newTracker(
        peerId: TrackerId,
        controlLayerVersions?: number[],
        messageLayerVersions?: number[],
        location?: Location
    ): PeerInfo {
        return new PeerInfo(
            peerId,
            PeerType.Tracker,
            controlLayerVersions || defaultControlLayerVersions,
            messageLayerVersions || defaultMessageLayerVersions,
            location
        )
    }

    static newNode(
        peerId: NodeId,
        controlLayerVersions?: number[] | undefined,
        messageLayerVersions?: number[] | undefined,
        location?: Location
    ): PeerInfo  {
        return new PeerInfo(
            peerId,
            PeerType.Node,
            controlLayerVersions || defaultControlLayerVersions,
            messageLayerVersions || defaultMessageLayerVersions,
            location
        )
    }

    static newUnknown(peerId: PeerId): PeerInfo  {
        return new PeerInfo(peerId, PeerType.Unknown, defaultControlLayerVersions, defaultMessageLayerVersions)
    }

    static fromObject({ peerId, peerType, location, controlLayerVersions, messageLayerVersions }: ObjectRepresentation): PeerInfo  {
        return new PeerInfo(
            peerId,
            peerType as PeerType,
            controlLayerVersions || defaultControlLayerVersions,
            messageLayerVersions || defaultMessageLayerVersions,
            location ?? undefined
        )
    }

    readonly peerId: PeerId
    readonly peerType: PeerType
    readonly controlLayerVersions: number[]
    readonly messageLayerVersions: number[]
    readonly location: Location | undefined

    constructor(
        peerId: PeerId,
        peerType: PeerType,
        controlLayerVersions?: number[],
        messageLayerVersions?: number[],
        location?: Location
    ) {
        if (!peerId) {
            throw new Error('peerId not given')
        }
        if (!peerType) {
            throw new Error('peerType not given')
        }
        if (!Object.values(PeerType).includes(peerType)) {
            throw new Error(`peerType ${peerType} not in peerTypes list`)
        }
        if (!controlLayerVersions || controlLayerVersions.length === 0) {
            throw new Error('controlLayerVersions not given')
        }
        if (!messageLayerVersions || messageLayerVersions.length === 0) {
            throw new Error('messageLayerVersions not given')
        }

        this.peerId = peerId
        this.peerType = peerType
        this.controlLayerVersions = controlLayerVersions
        this.messageLayerVersions = messageLayerVersions
        this.location = location
    }

    isTracker(): boolean {
        return this.peerType === PeerType.Tracker
    }

    isNode(): boolean {
        return this.peerType === PeerType.Node
    }

    toString(): string {
        return `<${this.peerId.slice(0, 8)}>`
    }
}
