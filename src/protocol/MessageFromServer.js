import UnsupportedVersionError from '../errors/UnsupportedVersionError'
import BroadcastMessage from './BroadcastMessage'
import UnicastMessage from './UnicastMessage'
import SubscribeResponse from './SubscribeResponse'
import UnsubscribeResponse from './UnsubscribeResponse'
import ResendResponseResending from './ResendResponseResending'
import ResendResponseResent from './ResendResponseResent'
import ResendResponseNoResend from './ResendResponseNoResend'
import ErrorResponse from './ErrorResponse'

const payloadClassByMessageType = [
    BroadcastMessage, // 0: broadcast
    UnicastMessage, // 1: unicast
    SubscribeResponse, // 2: subscribed
    UnsubscribeResponse, // 3: unsubscribed
    ResendResponseResending, // 4: resending
    ResendResponseResent, // 5: resent
    ResendResponseNoResend, // 6: no_resend
    ErrorResponse, // 7: error
]

class MessageFromServer {
    constructor(payload, subId) {
        this.messageType = payload.constructor.getMessageType() // call static method
        this.payload = payload
        this.subId = subId
    }

    toObject(version = 0) {
        if (version === 0) {
            return [version, this.messageType, this.subId, this.payload.toObject()]
        }
        throw UnsupportedVersionError(version, 'Supported versions: [0]')
    }

    serialize(version = 0) {
        return JSON.stringify(this.toObject(version))
    }

    static deserialize(stringOrArray) {
        const message = (typeof stringOrArray === 'string' ? JSON.parse(stringOrArray) : stringOrArray)

        if (message[0] === 0) {
            const payload = payloadClassByMessageType[message[1]].deserialize(message[3])
            return new MessageFromServer(payload, message[2])
        }
        throw UnsupportedVersionError(message[0], 'Supported versions: [0]')
    }
}

module.exports = MessageFromServer
