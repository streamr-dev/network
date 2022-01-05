import { PeerInfo } from '../connection/PeerInfo'
import { DisconnectionCode } from '../connection/ws/AbstractWsEndpoint'
import { DisconnectionReason } from '../connection/ws/AbstractWsEndpoint'

export interface IWsSimulator {

wsConnect(fromAddress: string, fromInfo: PeerInfo, toAddress: string): Promise<void>
wsDisconnect(fromAddress: string, fromInfo: PeerInfo, toAddress: string, code: DisconnectionCode, 
	reason: DisconnectionReason | string): Promise<void>
wsSend(fromAddress: string, from: PeerInfo, toAddress: string, message: string): Promise<void>

}