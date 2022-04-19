// import { AbstractTransport } from './AbstractTransport'
// import { RouteMessage } from '../../src/rpc-protocol/RouteMessage'
// import { PeerID } from '../types'
//
// export class Layer0 implements AbstractTransport {
//     private readonly routeMessage: RouteMessage
//     constructor(routeMessage: RouteMessage) {
//         this.routeMessage = routeMessage
//     }
//
//     // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
//     send(targetPeerId: PeerID, message: any): boolean {
//         this.routeMessage.routeMessage(targetPeerId, message)
//         return true
//     }
// }