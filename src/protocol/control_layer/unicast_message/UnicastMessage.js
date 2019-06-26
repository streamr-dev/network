import ControlMessage from '../ControlMessage'

const TYPE = 1

export default class UnicastMessage extends ControlMessage {
    constructor(version, subId) {
        if (new.target === UnicastMessage) {
            throw new TypeError('UnicastMessage is abstract.')
        }
        super(version, TYPE)
        this.subId = subId
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            this.subId,
        ])
        return array
    }

    serialize(version = this.version, messageLayerVersion) {
        if (version === this.version) {
            return JSON.stringify(this.toArray(messageLayerVersion))
        }
        return this.toOtherVersion(version, messageLayerVersion).serialize()
    }

    static create(subId, streamMessage) {
        const C = ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE)
        return new C(subId, streamMessage)
    }
}

/* static */
UnicastMessage.TYPE = TYPE
