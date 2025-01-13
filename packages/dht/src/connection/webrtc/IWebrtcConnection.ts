export interface WebrtcConnectionEvents {
    localDescription: (description: string, type: string) => void
    localCandidate: (candidate: string, mid: string) => void
}

export enum RtcDescription {
    OFFER = 'offer',
    ANSWER = 'answer'
}

export interface IWebrtcConnection {
    start(isOffering: boolean): void

    on(event: 'localDescription', listener: (description: string, type: string) => void): this
    on(event: 'localCandidate', listener: (candidate: string, mid: string) => void): this
    once(event: 'localDescription', listener: (description: string, type: string) => void): this
    once(event: 'localCandidate', listener: (candidate: string, mid: string) => void): this
    off(event: 'localDescription', listener: (description: string, type: string) => void): this
    off(event: 'localCandidate', listener: (candidate: string, mid: string) => void): this

    setRemoteDescription(description: string, type: string): Promise<void>
    addRemoteCandidate(candidate: string, mid: string): void
    isOpen(): boolean
}
