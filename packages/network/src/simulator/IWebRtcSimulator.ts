import { PeerInfo } from '../connection/PeerInfo'

export interface IWebRtcSimulator {

webRtcConnect(fromInfo: PeerInfo, toId: string): Promise<PeerInfo>
webRtcDisconnect(fromInfo: PeerInfo, toId: string): Promise<void>
webRtcSend(fromInfo: PeerInfo, toId: string, message: string): Promise<void>

}