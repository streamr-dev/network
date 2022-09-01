export interface WebRtcConnectionEvent {
    LOCAL_DESCRIPTION: (description: string, type: string) => void
    LOCAL_CANDIDATE: (candidate: string, mid: string) => void
}

export enum RtcDescription {
    OFFER = 'offer',
    ANSWER = 'answer'
}

export interface IWebRtcConnection {
    start(isOffering: boolean): void

    on(event: 'LOCAL_DESCRIPTION', listener: (description: string, type: string) => void): this
    on(event: 'LOCAL_CANDIDATE', listener: (candidate: string, mid: string) => void): this
    once(event: 'LOCAL_CANDIDATE', listener: (candidate: string, mid: string) => void): this
    once(event: 'LOCAL_DESCRIPTION', listener: (description: string, type: string) => void): this
    off(event: 'LOCAL_CANDIDATE', listener: (candidate: string, mid: string) => void): this
    off(event: 'LOCAL_DESCRIPTION', listener: (description: string, type: string) => void): this

    setRemoteDescription(description: string, type: string): Promise<void>
    addRemoteCandidate(candidate: string, mid: string): void
    isOpen(): boolean
}
