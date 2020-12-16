import {PeerInfo, PeerType} from './PeerInfo'

export class NotFoundInPeerBookError extends Error {
    constructor(msg: string) {
        super(msg)
        Error.captureStackTrace(this, NotFoundInPeerBookError)
    }
}

export class PeerBook {
    private readonly idToAddress: { [key: string]: string } = {}
    private readonly addressToId: { [key: string]: string } = {}
    private readonly addressToType: { [key: string]: PeerType } = {}
    private readonly addressToName: { [key: string]: string } = {}

    add(peerAddress: string, peerInfo: PeerInfo) {
        const { peerId, peerType, peerName } = peerInfo
        this.idToAddress[peerId] = peerAddress
        this.addressToId[peerAddress] = peerId
        this.addressToType[peerAddress] = peerType
        this.addressToName[peerAddress] = peerName
    }

    getPeerInfo(peerAddress: string): PeerInfo | null | never {
        if (this.hasAddress(peerAddress)) {
            return new PeerInfo(
                this.addressToId[peerAddress],
                this.addressToType[peerAddress],
                this.addressToName[peerAddress]
            )
        }
        return null
    }

    remove(peerAddress: string): void {
        const peerId = this.addressToId[peerAddress]
        delete this.idToAddress[peerId]
        delete this.addressToId[peerAddress]
        delete this.addressToType[peerAddress]
        delete this.addressToName[peerAddress]
    }

    getAddress(peerId: string): string | never {
        if (!this.hasPeerId(peerId)) {
            throw new NotFoundInPeerBookError(`Id ${peerId} not found in peer book`)
        }
        return this.idToAddress[peerId]
    }

    getPeerId(address: string): string | never {
        if (!this.hasAddress(address)) {
            throw new NotFoundInPeerBookError(`Address ${address} not found in peer book`)
        }
        return this.addressToId[address]
    }

    hasAddress(address: string): boolean {
        return this.addressToId[address] != null
    }

    hasPeerId(peerId: string): boolean {
        return this.idToAddress[peerId] != null
    }
}
