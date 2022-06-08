import { CallContext } from './ServerTransport'

export enum Event {
    OUTGOING_MESSAGE = 'proto-rpc:outgoing-message'
}
export interface IRpcIo {
    handleIncomingMessage(message: Uint8Array, callContext?: CallContext): Promise<void> 
    on(event: Event.OUTGOING_MESSAGE, listener: (message: Uint8Array, callContext?: CallContext) => void): this
}