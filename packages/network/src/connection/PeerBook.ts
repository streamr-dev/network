import { PeerInfo } from './PeerInfo'

export class NotFoundInPeerBookError extends Error {
    constructor(msg: string) {
        super(msg)
        Error.captureStackTrace(this, NotFoundInPeerBookError)
    }
}

export class PeerBook {
    private readonly peerInfos: { [key: string]: PeerInfo }
    constructor() {
        this.peerInfos = {}
    }

    add(peerAddress: string, peerInfo: PeerInfo): void {
        this.peerInfos[peerAddress] = peerInfo
    }

    getPeerInfo(peerAddress: string): PeerInfo | null | never {
        return this.peerInfos[peerAddress] || null
    }

    remove(peerAddress: string): void {
        delete this.peerInfos[peerAddress]
    }

    getAddress(peerId: string): string | never {
        const address = Object.keys(this.peerInfos).find((p) => this.peerInfos[p].peerId === peerId)
        if (!address) {
            throw new NotFoundInPeerBookError(`PeerId ${peerId} not found in peer book`)
        }
        return address
    }

    getPeerId(address: string): string | never {
        const peerInfo = this.peerInfos[address]
        if (!peerInfo) {
            throw new NotFoundInPeerBookError(`Address ${address} not found in peer book`)
        }
        return peerInfo.peerId
    }
}
