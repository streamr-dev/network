import ValidationError from '../../../errors/ValidationError'
import ControlMessage from '../ControlMessage'

const TYPE = 'resend'
const VERSION = 0

export default class ResendRequestV0 extends ControlMessage {
    constructor(streamId, streamPartition, subId, resendOptions, apiKey, sessionToken) {
        super(VERSION, TYPE)
        this.streamId = streamId
        this.apiKey = apiKey
        this.sessionToken = sessionToken

        if (!resendOptions.resend_all && !resendOptions.resend_last
          && resendOptions.resend_from == null && resendOptions.resend_from_time == null) {
            throw new ValidationError('Invalid resend options!')
        }
        if (!subId) {
            throw new ValidationError('Subscription ID not given!')
        }

        this.streamPartition = streamPartition
        this.subId = subId
        this.resendOptions = resendOptions
    }

    toObject() {
        return {
            type: TYPE,
            stream: this.streamId,
            authKey: this.apiKey,
            sessionToken: this.sessionToken,
            partition: this.streamPartition,
            sub: this.subId,
            ...this.resendOptions,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }

    static deserialize(version, msg) {
        return new ResendRequestV0(...this.getConstructorArgs(msg))
    }

    static getConstructorArgs(msg) {
        // Every property that starts with resend_ is a resend option
        const resendOptions = {}
        Object.keys(msg).forEach((key) => {
            if (key.startsWith('resend_')) {
                resendOptions[key] = msg[key]
            }
        })

        return [
            msg.stream,
            msg.partition,
            msg.sub,
            resendOptions,
            msg.authKey,
            msg.sessionToken,
        ]
    }
}

/* static */
ResendRequestV0.TYPE = TYPE

ControlMessage.registerClass(VERSION, TYPE, ResendRequestV0)
