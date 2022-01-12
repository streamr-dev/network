import { PeerInfo } from '../connection/PeerInfo'

export interface ISimulatedWsEndpoint {
	handleIncomingConnection(fromAddress: string, fromInfo: PeerInfo): void
	handleIncomingMessage(fromAddress: string, fromInfo: PeerInfo, data: string): Promise<void>
}