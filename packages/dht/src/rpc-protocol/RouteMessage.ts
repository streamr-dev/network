// import EventEmitter = require("events");
// import { PeerID } from '../types'
// import { RouteMessageWrapper } from '../proto/RouteMessage'
// import { v4 } from 'uuid'
// import { AbstractTransport } from '../transport/AbstractTransport'
//
// export class RouteMessage extends EventEmitter {
//     private readonly peerId: string
//     private readonly transport: AbstractTransport
//     constructor(peerId: PeerID, transport: AbstractTransport) {
//         super()
//         this.peerId = peerId
//         this.transport = transport
//     }
//
//     routeRTCOffer(destinationId: PeerID, message: any): void {
//         const routedMessage: RouteMessageWrapper = {
//             sourceId: this.peerId,
//             nonce: v4(),
//             destinationId,
//             message: {
//                 oneofKind: "rtcOffer",
//                 rtcOffer: message
//             }
//         }
//         this.route(destinationId, routedMessage)
//     }
//
//     routeRTCAnswer(destinationId: PeerID, message: any) {
//         const routedMessage: RouteMessageWrapper = {
//             sourceId: this.peerId,
//             nonce: v4(),
//             destinationId,
//             message: {
//                 oneofKind: "rtcAnswer",
//                 rtcAnswer: message
//             }
//         }
//         this.route(destinationId, routedMessage)
//     }
//
//     routeIceCandidate(destinationId: PeerID, message: any) {
//         const routedMessage: RouteMessageWrapper = {
//             sourceId: this.peerId,
//             nonce: v4(),
//             destinationId,
//             message: {
//                 oneofKind: "iceCandidate",
//                 iceCandidate: message
//             }
//         }
//         this.route(destinationId, routedMessage)
//     }
//
//     routeIceDescription(destinationId: PeerID, message: any) {
//         const routedMessage: RouteMessageWrapper = {
//             sourceId: this.peerId,
//             nonce: v4(),
//             destinationId,
//             message: {
//                 oneofKind: "iceDescription",
//                 iceDescription: message
//             }
//         }
//         this.route(destinationId, routedMessage)
//     }
//
//     routeClosestPeersRequest(destinationId: PeerID, message: any) {
//         const routedMessage: RouteMessageWrapper = {
//             sourceId: this.peerId,
//             nonce: v4(),
//             destinationId,
//             message: {
//                 oneofKind: "closestPeersRequest",
//                 closestPeersRequest: message
//             }
//         }
//         this.route(destinationId, routedMessage)
//     }
//
//     routeClosestPeersResponse(destinationId: PeerID, message: any) {
//         const routedMessage: RouteMessageWrapper = {
//             sourceId: this.peerId,
//             nonce: v4(),
//             destinationId,
//             message: {
//                 oneofKind: "closestPeersResponse",
//                 closestPeersResponse: message
//             }
//         }
//         this.route(destinationId, routedMessage)
//     }
//
//     private route(destinationId: PeerID, message: RouteMessageWrapper): void {
//         const bytes = RouteMessageWrapper.toBinary(message)
//         this.transport.send(destinationId, bytes)
//     }
// }