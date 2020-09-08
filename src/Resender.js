import once from 'once'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'

import HistoricalSubscription from './HistoricalSubscription'
import Subscription from './Subscription'
import ResendUtil from './ResendUtil'

const { ResendLastRequest, ResendFromRequest, ResendRangeRequest, ControlMessage } = ControlLayer

const { MessageRef } = MessageLayer

export default class Resender {
    constructor(client) {
        this.client = client
        this.debug = client.debug.extend('Resends')

        this.resendUtil = new ResendUtil({
            debug: this.debug,
        })

        this.onResendUtilError = this.onResendUtilError.bind(this)
        this.resendUtil.on('error', this.onResendUtilError)

        // Unicast messages to a specific subscription only
        this.onUnicastMessage = this.onUnicastMessage.bind(this)
        this.client.connection.on(ControlMessage.TYPES.UnicastMessage, this.onUnicastMessage)

        // Route resending state messages to corresponding Subscriptions
        this.onResendResponseResending = this.onResendResponseResending.bind(this)
        this.client.connection.on(ControlMessage.TYPES.ResendResponseResending, this.onResendResponseResending)

        this.onResendResponseNoResend = this.onResendResponseNoResend.bind(this)
        this.client.connection.on(ControlMessage.TYPES.ResendResponseNoResend, this.onResendResponseNoResend)

        this.onResendResponseResent = this.onResendResponseResent.bind(this)
        this.client.connection.on(ControlMessage.TYPES.ResendResponseResent, this.onResendResponseResent)
    }

    onResendUtilError(err) {
        this.client.emit('error', err)
    }

    onResendResponseResent(response) {
        // eslint-disable-next-line no-underscore-dangle
        const stream = this.client.subscriber._getSubscribedStreamPartition(response.streamId, response.streamPartition)
        const sub = this.resendUtil.getSubFromResendResponse(response)
        this.resendUtil.deleteDoneSubsByResponse(response)

        if (!stream || !sub || !stream.getSubscription(sub.id)) {
            this.debug('resent: Subscription %s is gone already', response.requestId)
            return
        }
        stream.getSubscription(sub.id).handleResent(response)
    }

    onResendResponseNoResend(response) {
        // eslint-disable-next-line no-underscore-dangle
        const stream = this.client.subscriber._getSubscribedStreamPartition(response.streamId, response.streamPartition)
        const sub = this.resendUtil.getSubFromResendResponse(response)
        this.resendUtil.deleteDoneSubsByResponse(response)

        if (!stream || !sub || !stream.getSubscription(sub.id)) {
            this.debug('resent: Subscription %s is gone already', response.requestId)
            return
        }

        stream.getSubscription(sub.id).handleNoResend(response)
    }

    onResendResponseResending(response) {
        // eslint-disable-next-line no-underscore-dangle
        const stream = this.client.subscriber._getSubscribedStreamPartition(response.streamId, response.streamPartition)
        const sub = this.resendUtil.getSubFromResendResponse(response)

        if (!stream || !sub || !stream.getSubscription(sub.id)) {
            this.debug('resent: Subscription %s is gone already', response.requestId)
            return
        }
        stream.getSubscription(sub.id).handleResending(response)
    }

    async onUnicastMessage(msg) {
        // eslint-disable-next-line no-underscore-dangle
        const stream = this.client.subscriber._getSubscribedStreamPartition(
            msg.streamMessage.getStreamId(),
            msg.streamMessage.getStreamPartition()
        )

        if (!stream) {
            this.debug('WARN: message received for stream with no subscriptions: %s', msg.streamMessage.getStreamId())
            return
        }

        const sub = this.resendUtil.getSubFromResendResponse(msg)

        if (!sub || !stream.getSubscription(sub.id)) {
            this.debug('WARN: request id not found for stream: %s, sub: %s', msg.streamMessage.getStreamId(), msg.requestId)
            return
        }
        // sub.handleResentMessage never rejects: on any error it emits an 'error' event on the Subscription
        sub.handleResentMessage(
            msg.streamMessage, msg.requestId,
            once(() => stream.verifyStreamMessage(msg.streamMessage)), // ensure verification occurs only once
        )
    }

    async resend(optionsOrStreamId, callback) {
        // eslint-disable-next-line no-underscore-dangle
        const options = this.client.subscriber._validateParameters(optionsOrStreamId, callback)

        if (!options.stream) {
            throw new Error('resend: Invalid arguments: options.stream is not given')
        }

        if (!options.resend) {
            throw new Error('resend: Invalid arguments: options.resend is not given')
        }

        const sub = new HistoricalSubscription({
            streamId: options.stream,
            streamPartition: options.partition || 0,
            callback,
            options: options.resend,
            propagationTimeout: this.client.options.gapFillTimeout,
            resendTimeout: this.client.options.retryResendAfter,
            orderMessages: this.client.orderMessages,
            debug: this.debug,
        })

        // eslint-disable-next-line no-underscore-dangle
        this.client.subscriber._addSubscription(sub)
        // TODO remove _addSubscription after uncoupling Subscription and Resend
        sub.setState(Subscription.State.subscribed)
        // eslint-disable-next-line no-underscore-dangle
        sub.once('initial_resend_done', () => this.client.subscriber._removeSubscription(sub))
        await this._requestResend(sub)
        return sub
    }

    async _requestResend(sub, resendOptions) {
        sub.setResending(true)
        const requestId = this.resendUtil.registerResendRequestForSub(sub)
        const options = resendOptions || sub.getResendOptions()
        const sessionToken = await this.client.session.getSessionToken()
        let request
        if (options.last > 0) {
            request = new ResendLastRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
                numberLast: options.last,
                sessionToken,
            })
        } else if (options.from && !options.to) {
            request = new ResendFromRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
                fromMsgRef: new MessageRef(options.from.timestamp, options.from.sequenceNumber),
                publisherId: options.publisherId,
                msgChainId: options.msgChainId,
                sessionToken,
            })
        } else if (options.from && options.to) {
            request = new ResendRangeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
                fromMsgRef: new MessageRef(options.from.timestamp, options.from.sequenceNumber),
                toMsgRef: new MessageRef(options.to.timestamp, options.to.sequenceNumber),
                publisherId: options.publisherId,
                msgChainId: options.msgChainId,
                sessionToken,
            })
        }

        if (!request) {
            this.client.handleError("Can't _requestResend without resendOptions")
            return
        }

        this.debug('_requestResend: %o', request)
        await this.client.send(request).catch((err) => {
            this.client.handleError(`Failed to send resend request: ${err}`)
        })
    }
}
