import UnsupportedVersionError from '../errors/UnsupportedVersionError'
import ValidationError from '../errors/ValidationError'
import ParseUtil from '../utils/ParseUtil'

const messageClassByMessageType = {}

module.exports = class MessageFromServer {
    constructor(messageType, payload, subId) {
        this.messageType = messageType
        this.payload = payload
        this.subId = subId

        const messageClass = messageClassByMessageType[messageType]
        if (!(payload instanceof messageClass.getPayloadClass())) {
            throw new ValidationError(`An unexpected payload was passed to ${
                messageClass.getMessageName()
            }! Expected: ${
                messageClass.getPayloadClass().name
            }, was: ${
                payload.constructor.name
            }`)
        }
    }

    static getPayloadClass() {
        throw new Error('Abstract method called - please override in subclass!')
    }

    static getMessageName() {
        throw new Error('Abstract method called - please override in subclass!')
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

    static checkVersion(message) {
        if (message[0] !== 0) {
            throw UnsupportedVersionError(message[0], 'Supported versions: [0]')
        }
    }

    static deserialize(stringOrArray) {
        const message = ParseUtil.ensureParsed(stringOrArray)
        this.checkVersion(message)
        const deserializedPayload = messageClassByMessageType[message[1]].getPayloadClass().deserialize(message[3])
        const constructorArgs = messageClassByMessageType[message[1]].getConstructorArguments(message, deserializedPayload)
        return new messageClassByMessageType[message[1]](...constructorArgs)
    }

    // Need to register subclasses like this to avoid circular dependencies
    static registerMessageClass(clazz, messageType) {
        messageClassByMessageType[messageType] = clazz
    }
}
