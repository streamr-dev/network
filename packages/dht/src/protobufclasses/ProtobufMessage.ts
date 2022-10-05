import { Message } from '../proto/DhtRpc'

export class ProtobufMessage {

    constructor(private message: Message) {}
    
    static fromBinary(data: Uint8Array): ProtobufMessage {
        const msg = Message.fromBinary(data)
        const obj = new ProtobufMessage(msg)
        return obj
    }
    
    toString(): string {
        return Message.toJsonString(this.message!)
    } 
    
}
