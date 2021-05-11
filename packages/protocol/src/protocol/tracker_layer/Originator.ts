export interface Originator {
    peerId: string
    peerType: string
    controlLayerVersions: number[]
    messageLayerVersions: number[]
    peerName: string | null
    location: any
}
