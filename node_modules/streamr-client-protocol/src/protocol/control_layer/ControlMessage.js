import ValidationError from '../../errors/ValidationError'
import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import UnsupportedTypeError from '../../errors/UnsupportedTypeError'

const classByVersionAndType = {}
const LATEST_VERSION = 1

export default class ControlMessage {
    constructor(version, type) {
        if (new.target === ControlMessage) {
            throw new TypeError('ControlMessage is abstract.')
        }
        this.version = version
        if (type === undefined) {
            throw new ValidationError('No message type given!')
        }
        this.type = type
    }

    toArray() {
        return [
            this.version,
            this.type,
        ]
    }

    toOtherVersion() {
        throw new Error(`Class ${this.constructor.name} must override ControlMessage.toOtherVersion(version) or ControlMessage.serialize(version)`)
    }

    serialize(version = this.version) {
        if (version === this.version) {
            return JSON.stringify(this.toArray())
        }
        return this.toOtherVersion(version).serialize()
    }

    static getConstructorArgs(array) {
        return array
    }

    static registerClass(version, type, clazz) {
        if (classByVersionAndType[version] === undefined) {
            classByVersionAndType[version] = {}
        }
        classByVersionAndType[version][type] = clazz
    }

    static getClass(version, type) {
        const classesByVersion = classByVersionAndType[version]
        if (!classesByVersion) {
            throw new UnsupportedVersionError(version, `Supported versions: [${Object.keys(classByVersionAndType)}]`)
        }
        const clazz = classesByVersion[type]
        if (!clazz) {
            throw new UnsupportedTypeError(type, `Supported types: [${Object.keys(classesByVersion)}]`)
        }
        return classByVersionAndType[version][type]
    }

    static deserialize(msg, parseContent = true) {
        const messageArray = (typeof msg === 'string' ? JSON.parse(msg) : msg)
        let messageVersion
        let messageType

        // Version 0 (deprecated) uses objects instead of arrays for request types. In this case, messageArray is not an array but an object.
        if (!Array.isArray(messageArray)) {
            messageVersion = messageArray.version || 0
            messageType = messageArray.type
        } else {
            /* eslint-disable prefer-destructuring */
            messageVersion = messageArray[0]
            messageType = messageArray[1]
            /* eslint-enable prefer-destructuring */
            messageArray.splice(0, 2)
        }
        const C = ControlMessage.getClass(messageVersion, messageType)
        return new C(...C.getConstructorArgs(messageArray, parseContent))
    }
}

/* static */
ControlMessage.LATEST_VERSION = LATEST_VERSION
