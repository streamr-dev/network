export interface Originator {
    peerId: string
    peerType: string
    controlLayerVersions: number[]
    messageLayerVersions: number[]
    location: any
}
