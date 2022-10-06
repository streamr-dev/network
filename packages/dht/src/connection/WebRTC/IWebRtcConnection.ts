import { Candidate } from '../../proto/DhtRpc'

export interface WebRtcConnectionEvents {
    localDescription: (description: string, type: string) => void
    localCandidate: (iceCandidates: Candidate[]) => void
}

export enum RtcDescription {
    OFFER = 'offer',
    ANSWER = 'answer'
}

export interface IWebRtcConnection {
    start(isOffering: boolean): void

    on(event: 'localDescription', listener: (description: string, type: string) => void): this
    on(event: 'localCandidate', listener: (iceCandidates: Candidate[]) => void): this
    once(event: 'localDescription', listener: (description: string, type: string) => void): this
    once(event: 'localCandidate', listener: (iceCandidates: Candidate[]) => void): this
    off(event: 'localDescription', listener: (description: string, type: string) => void): this 
    off(event: 'localCandidate', listener: (iceCandidates: Candidate[]) => void): this
   
    setRemoteDescription(description: string, type: string): Promise<void>
    addRemoteCandidate(candidate: string, mid: string): void
    isOpen(): boolean
}
