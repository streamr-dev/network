import { v4 as uuidv4 } from 'uuid'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import { Location } from '../identifiers'

export enum PeerType {
    Tracker = 'tracker',
    Node = 'node',
    Storage = 'storage',
    Unknown = 'unknown'
}

interface ObjectRepresentation {
    peerId: string
    peerType: string
    controlLayerVersions: number[] | null
    messageLayerVersions: number[] | null
    peerName?: string | null | undefined
    location?: Location | null | undefined
}

const defaultControlLayerVersions = ControlLayer.ControlMessage.getSupportedVersions()
const defaultMessageLayerVersions = MessageLayer.StreamMessage.getSupportedVersions()

export class PeerInfo {
    static newTracker(
        peerId: string,
        peerName?: string | null | undefined,
        controlLayerVersions?: number[],
        messageLayerVersions?: number[],
        location?: Location | null | undefined
    ): PeerInfo {
        return new PeerInfo(
            peerId,
            PeerType.Tracker,
            controlLayerVersions || defaultControlLayerVersions,
            messageLayerVersions || defaultMessageLayerVersions,
            peerName,
            location
        )
    }

    static newNode(
        peerId: string,
        peerName?: string | null | undefined,
        controlLayerVersions?: number[] | undefined,
        messageLayerVersions?: number[] | undefined,
        location?: Location | null | undefined
    ): PeerInfo  {
        return new PeerInfo(
            peerId,
            PeerType.Node,
            controlLayerVersions || defaultControlLayerVersions,
            messageLayerVersions || defaultMessageLayerVersions,
            peerName,
            location
        )
    }

    static newStorage(
        peerId: string,
        peerName?: string | null | undefined,
        controlLayerVersions?: number[] | undefined,
        messageLayerVersions?: number[] | undefined,
        location?: Location | null | undefined
    ): PeerInfo  {
        return new PeerInfo(
            peerId,
            PeerType.Storage,
            controlLayerVersions || defaultControlLayerVersions,
            messageLayerVersions || defaultMessageLayerVersions,
            peerName,
            location
        )
    }

    static newUnknown(peerId: string): PeerInfo  {
        return new PeerInfo(peerId, PeerType.Unknown, defaultControlLayerVersions, defaultMessageLayerVersions)
    }

    static fromObject({ peerId, peerType, peerName, location, controlLayerVersions, messageLayerVersions }: ObjectRepresentation): PeerInfo  {
        return new PeerInfo(
            peerId,
            peerType as PeerType,
            controlLayerVersions || defaultControlLayerVersions,
            messageLayerVersions || defaultMessageLayerVersions,
            peerName,
            location
        )
    }

    readonly peerId: string
    readonly peerType: PeerType
    readonly controlLayerVersions: number[]
    readonly messageLayerVersions: number[]
    readonly peerName: string | null
    readonly location: Location

    constructor(
        peerId: string,
        peerType: PeerType,
        controlLayerVersions?: number[],
        messageLayerVersions?: number[],
        peerName?: string | null | undefined,
        location?: Location | null | undefined
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

        this.peerType = peerType
        this.controlLayerVersions = controlLayerVersions
        this.messageLayerVersions = messageLayerVersions
        this.peerName = peerName ? peerName : null
        this.location = location || {
            latitude: null,
            longitude: null,
            country: null,
            city: null
        } 

        if (peerType === PeerType.Tracker){
            this.peerId = peerId
            return
        }

        if (peerId.indexOf('#') >= 0){
            this.peerId = peerId
        } else {
            this.peerId = `${peerId}#${uuidv4()}`
        }

    }

    isTracker(): boolean {
        return this.peerType === PeerType.Tracker
    }

    isNode(): boolean {
        return this.peerType === PeerType.Node || this.isStorage()
    }

    isStorage(): boolean {
        return this.peerType === PeerType.Storage
    }

    toString(): string {
        return (this.peerName ? `${this.peerName}` : '') + `<${this.peerId.slice(0, 8)}>`
    }
}
