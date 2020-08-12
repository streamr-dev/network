import once from 'once'
import { ControlLayer } from 'streamr-client-protocol'

import Signer from './Signer'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'
import MessageCreationUtil from './MessageCreationUtil'

function getStreamId(streamObjectOrId) {
    if (streamObjectOrId instanceof Stream) {
        return streamObjectOrId.id
    }

    if (typeof streamObjectOrId === 'string') {
        return streamObjectOrId
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${streamObjectOrId}`)
}

export default class Publisher {
    constructor(client) {
        this.client = client
        this.publishQueue = []
        this.signer = Signer.createSigner({
            ...client.options.auth,
            debug: client.debug,
        }, client.options.publishWithSignature)

        this.debug = client.debug.extend('Publisher')

        if (client.session.isUnauthenticated()) {
            this.msgCreationUtil = null
        } else {
            this.msgCreationUtil = new MessageCreationUtil(
                client.options.auth, this.signer, once(() => client.getUserInfo()),
                (streamId) => client.getStream(streamId)
                    .catch((err) => client.emit('error', err))
            )
        }

        // On connect/reconnect, send pending subscription requests
        this.onConnected = this.onConnected.bind(this)
        client.on('connected', this.onConnected)
    }

    async onConnected() {
        if (!this.client.isConnected()) { return }
        try {
            // Check pending publish requests
            const publishQueueCopy = this.publishQueue.slice(0)
            this.publishQueue = []
            publishQueueCopy.forEach((publishFn) => publishFn())
        } catch (err) {
            this.client.emit('error', err)
        }
    }

    async publish(streamObjectOrId, data, timestamp = new Date(), partitionKey = null) {
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }
        // Validate streamObjectOrId
        const streamId = getStreamId(streamObjectOrId)

        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
        const [sessionToken, streamMessage] = await Promise.all([
            this.client.session.getSessionToken(),
            this.msgCreationUtil.createStreamMessage(streamObjectOrId, data, timestampAsNumber, partitionKey),
        ])

        if (this.client.isConnected()) {
            // If connected, emit a publish request
            return this._requestPublish(streamMessage, sessionToken)
        }

        if (this.client.options.autoConnect) {
            if (this.publishQueue.length >= this.client.options.maxPublishQueueSize) {
                throw new FailedToPublishError(
                    streamId,
                    data,
                    `publishQueue exceeded maxPublishQueueSize=${this.options.maxPublishQueueSize}`,
                )
            }

            const published = new Promise((resolve, reject) => {
                this.publishQueue.push(async () => {
                    let publishRequest
                    try {
                        publishRequest = await this._requestPublish(streamMessage, sessionToken)
                    } catch (err) {
                        reject(err)
                        this.client.emit('error', err)
                        return
                    }
                    resolve(publishRequest)
                })
            })
            // be sure to trigger connection *after* queueing publish
            await this.client.ensureConnected() // await to ensure connection error fails publish
            return published
        }

        throw new FailedToPublishError(
            streamId,
            data,
            'Wait for the "connected" event before calling publish, or set autoConnect to true!',
        )
    }

    _requestPublish(streamMessage, sessionToken) {
        const requestId = this.client.resender.resendUtil.generateRequestId()
        const request = new ControlLayer.PublishRequest({
            streamMessage,
            requestId,
            sessionToken,
        })
        this.debug('_requestPublish: %o', request)
        return this.client.connection.send(request)
    }

    getPublisherId() {
        return this.msgCreationUtil.getPublisherId()
    }

    stop() {
        if (this.msgCreationUtil) {
            this.msgCreationUtil.stop()
        }
    }
}
