import ValidationError from '../errors/ValidationError'
import WebsocketRequest from './WebsocketRequest'

const TYPE = 'resend'

class ResendRequest extends WebsocketRequest {
    constructor(streamId, streamPartition = 0, subId, resendOptions, apiKey, sessionToken) {
        super(TYPE, streamId, apiKey, sessionToken)

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
            ...super.toObject(),
            partition: this.streamPartition,
            sub: this.subId,
            ...this.resendOptions,
        }
    }

    static getConstructorArguments(msg) {
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

WebsocketRequest.registerMessageClass(ResendRequest, TYPE)
module.exports = ResendRequest
