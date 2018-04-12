const CONTENT_TYPE_JSON = 27
const FIELDS_BY_PROTOCOL_VERSION = {
    '28': ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content'],
}
const MESSAGE_TYPES = ['b', 'u', 'subscribed', 'unsubscribed', 'resending', 'resent', 'no_resend']
const BYE_KEY = '_bye'

module.exports = {
    decodeBrowserWrapper(rawMsg) {
        const jsonMsg = JSON.parse(rawMsg)
        const version = jsonMsg[0]
        if (version !== 0) {
            throw new Error(`Unknown message version: ${version}`)
        }

        return {
            type: MESSAGE_TYPES[jsonMsg[1]],
            subId: jsonMsg[2],
            msg: jsonMsg[3],
        }
    },

    decodeMessage(type, message) {
        if (type === 'b' || type === 'u') {
            if (FIELDS_BY_PROTOCOL_VERSION[message[0]] === undefined) {
                throw new Error(`Unsupported version: ${message[0]}`)
            }
            const result = {}
            const fields = FIELDS_BY_PROTOCOL_VERSION[message[0]]

            for (let i = 0; i < message.length; i++) {
                // Parse content if necessary
                if (fields[i] === 'content') {
                    if (result.contentType === CONTENT_TYPE_JSON) {
                        result[fields[i]] = JSON.parse(message[i])
                    } else {
                        throw new Error(`Unknown content type: ${result.contentType}`)
                    }
                } else {
                    result[fields[i]] = message[i]
                }
            }
            return result
        }
        return message
    },

    createSubscribeRequest(stream, resendOptions) {
        const req = {
            stream,
        }
        Object.keys(resendOptions).forEach((key) => {
            req[key] = resendOptions[key]
        })
        return req
    },

    isByeMessage(message) {
        return !!message[BYE_KEY]
    },
}
