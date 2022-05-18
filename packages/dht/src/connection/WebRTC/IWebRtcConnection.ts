import { PeerId } from 'streamr-network'
import crypto from "crypto"

export enum Event {
    LOCAL_DESCRIPTION = 'streamr:dht:webrtcconnection:localdescription',
    LOCAL_CANDIDATE = 'streamr:dht:webrtcconnection:localcandidate',
}

export function isOffering(myId: PeerId, theirId: PeerId): boolean {
    return offeringHash(myId + theirId) < offeringHash(theirId + myId)
}

function offeringHash(idPair: string): number {
    const buffer = crypto.createHash('md5').update(idPair).digest()
    return buffer.readInt32LE(0)
}

export interface IWebRtcConnection {
    start(isOffering: boolean): void

    on(event: Event.LOCAL_DESCRIPTION, listener: (description: string, type: string) => void): this
    on(event: Event.LOCAL_CANDIDATE, listener: (candidate: string, mid: string) => void): this
    once(event: Event.LOCAL_CANDIDATE, listener: (candidate: string, mid: string) => void): this
    once(event: Event.LOCAL_DESCRIPTION, listener: (description: string, type: string) => void): this

    setRemoteDescription(description: string, type: string): Promise<void>
    addRemoteCandidate(candidate: string, mid: string): void
}