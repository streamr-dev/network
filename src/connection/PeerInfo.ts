import { Location } from "../identifiers"

export enum PeerType {
    Tracker = 'tracker',
    Node = 'node',
    Storage = 'storage',
    Unknown = 'unknown'
}

interface ObjectRepresentation {
    peerId: string
    peerType: string
    peerName?: string | null | undefined
    location?: Location | null | undefined
}

export class PeerInfo {
    static newTracker(peerId: string, peerName: string | null | undefined, location: Location | null | undefined) {
        return new PeerInfo(peerId, PeerType.Tracker, peerName, location)
    }

    static newNode(peerId: string, peerName: string | null | undefined, location: Location | null | undefined) {
        return new PeerInfo(peerId, PeerType.Node, peerName, location)
    }

    static newStorage(peerId: string, peerName: string | null | undefined, location: Location | null | undefined) {
        return new PeerInfo(peerId, PeerType.Storage, peerName, location)
    }

    static newUnknown(peerId: string) {
        return new PeerInfo(peerId, PeerType.Unknown)
    }

    static fromObject({ peerId, peerType, peerName, location }: ObjectRepresentation) {
        return new PeerInfo(peerId, peerType as PeerType, peerName, location)
    }

    readonly peerId: string
    readonly peerType: PeerType
    readonly peerName: string
    readonly location: Location

    constructor(
        peerId: string,
        peerType: PeerType,
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

        this.peerId = peerId
        this.peerType = peerType
        this.peerName = peerName || peerId
        this.location = location || {
            latitude: null,
            longitude: null,
            country: null,
            city: null
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
        return `${this.peerName} ${this.peerId} (${this.peerType})`
    }
}
