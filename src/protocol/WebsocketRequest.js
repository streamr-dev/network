import ValidationError from '../errors/ValidationError'
import ParseUtil from '../utils/ParseUtil'
import UnsupportedVersionError from '../errors/UnsupportedVersionError'

const messageClassByMessageType = {}

export default class WebsocketRequest {
    constructor(type, streamId, apiKey, sessionToken) {
        if (!streamId) {
            throw new ValidationError('No stream ID given!')
        }
        if (!type) {
            throw new ValidationError('No message type given!')
        }

        this.type = type
        this.streamId = streamId
        this.apiKey = apiKey
        this.sessionToken = sessionToken
    }

    toObject() {
        return {
            type: this.type,
            stream: this.streamId,
            authKey: this.apiKey,
            sessionToken: this.sessionToken,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }

    static checkVersion(message) {
        const version = message.version || 0
        if (version !== 0) {
            throw UnsupportedVersionError(version, 'Supported versions: [0]')
        }
    }

    static deserialize(stringOrObject) {
        const message = ParseUtil.ensureParsed(stringOrObject)
        this.checkVersion(message)
        const constructorArgs = messageClassByMessageType[message.type].getConstructorArguments(message)
        return new messageClassByMessageType[message.type](...constructorArgs)
    }

    // Need to register subclasses like this to avoid circular dependencies
    static registerMessageClass(clazz, messageType) {
        messageClassByMessageType[messageType] = clazz
    }
}
