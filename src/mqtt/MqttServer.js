const events = require('events')
const debug = require('debug')('streamr:MqttServer')

const uuidv4 = require('uuid/v4')
const mqttCon = require('mqtt-connection')
const mqttPacket = require('mqtt-packet')

const { ControlLayer, MessageLayer } = require('streamr-client-protocol')
const HttpError = require('../errors/HttpError')
const VolumeLogger = require('../VolumeLogger')
const partition = require('../partition')
const { networkMessageToStreamrMessage } = require('../utils')

const Connection = require('./Connection')
const FieldDetector = require('./FieldDetector')
const StreamStateManager = require('./StreamStateManager')

module.exports = class MqttServer extends events.EventEmitter {
    constructor(
        mqttServer,
        streamsTimeout,
        networkNode,
        streamFetcher,
        publisher,
        volumeLogger = new VolumeLogger(0),
        partitionFn = partition,
    ) {
        super()
        this.mqttServer = mqttServer
        this.streamsTimeout = streamsTimeout
        this.networkNode = networkNode
        this.streamFetcher = streamFetcher
        this.publisher = publisher
        this.partitionFn = partitionFn
        this.volumeLogger = volumeLogger

        this._clients = new Map()

        this.streams = new StreamStateManager()
        this.fieldDetector = new FieldDetector(streamFetcher)

        // this.requestHandlersByMessageType = {
        //     [ControlLayer.SubscribeRequest.TYPE]: this.handleSubscribeRequest,
        //     [ControlLayer.UnsubscribeRequest.TYPE]: this.handleUnsubscribeRequest,
        //     [ControlLayer.ResendRequestV0.TYPE]: this.handleResendRequestV0,
        //     [ControlLayer.ResendLastRequestV1.TYPE]: this.handleResendLastRequest,
        //     [ControlLayer.ResendFromRequestV1.TYPE]: this.handleResendFromRequest,
        //     [ControlLayer.ResendRangeRequestV1.TYPE]: this.handleResendRangeRequest,
        //     [ControlLayer.PublishRequest.TYPE]: this.handlePublishRequest,
        // }
        //
        this.networkNode.addMessageListener(this.broadcastMessage.bind(this))
        this.mqttServer.on('connection', this.onNewClientConnection.bind(this))
    }

    close() {
        this.streams.close()
        this.mqttServer.close()
    }

    onNewClientConnection(stream) {
        const client = mqttCon(stream)
        let connection

        client.on('connect', (packet) => {
            debug('connect request %o', packet)

            const { username, password } = packet
            const apiKey = password.toString('utf8')

            this.streamFetcher.getToken(apiKey)
                .then((res) => {
                    if (res.code) {
                        client.connack({
                            returnCode: 4
                        })
                    }

                    if (res.token) {
                        client.connack({
                            returnCode: 0
                        })

                        connection = new Connection(client, packet.clientId)
                        this.volumeLogger.connectionCount += 1
                        debug('onNewClientConnection: mqtt "%s" connected', connection.id)

                        client.id = connection.id
                        client.token = res.token
                        client.apiKey = apiKey

                        // timeout idle streams after X minutes
                        stream.setTimeout(this.streamsTimeout)

                        // connection error handling
                        client.on('close', () => {
                            debug('closing client')
                            this._closeClient(connection)
                        })
                        client.on('error', () => {
                            debug('error in client')
                            this._closeClient(connection)
                        })
                        client.on('disconnect', () => {
                            debug('client disconnected')
                            // this._closeClient(connection)
                        })

                        // stream timeout
                        stream.on('timeout', () => {
                            debug('client timeout')
                            this._closeClient(connection)
                        })
                    }
                })
        })

        // client published
        client.on('publish', (packet) => {
            debug('publish request %o', packet)

            const { topic, payload } = packet

            let i = 0

            this.streamFetcher.getStream(topic, client.token)
                .then((streamObj) => {
                    this.streamFetcher.authenticate(streamObj.id, client.apiKey, client.token, 'write')
                        .then((json) => {
                            console.log(streamObj)
                            const streamId = streamObj.id
                            const msgChainId = 'test-chain'
                            const streamPartition = this.partitionFn(streamObj.partitions, 0)
                            const streamMessage = this.createStreamMessage(streamId, payload, i, Date.now(), uuidv4())
                            i += 1
                            //     MessageLayer.StreamMessage.create(
                            //     [
                            //         streamId,
                            //         streamPartition,
                            //         Date.now(),
                            //         0, // sequenceNumber
                            //         '0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963',
                            //         msgChainId
                            //     ],
                            //     [0, 0],
                            //     MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                            //     payload,
                            //     MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE,
                            //     null,
                            // )

                            // this.fieldDetector.detectAndSetFields(stream, streamMessage,
                            // request.apiKey, request.sessionToken)
                            this.publisher.publish(json, streamMessage)
                            // send a puback with messageId (for QoS > 0)
                            client.puback({
                                messageId: packet.messageId
                            })
                        })
                        .catch((err) => {
                            console.log(err)
                        })
                })
        })

        // client pinged
        client.on('pingreq', () => {
            // send a pingresp
            client.pingresp()
        })

        // client subscribed
        client.on('subscribe', (packet) => {
            debug('subscribe request %o', packet)

            const { topic } = packet.subscriptions[0]

            this.streamFetcher.getStream(topic, client.token)
                .then((streamObj) => {
                    this.streamFetcher.authenticate(streamObj.id, client.apiKey, client.sessionToken)
                        .then((/* streamJson */) => {
                            const newOrExistingStream = this.streams.getOrCreate(streamObj.name, streamObj.id, 0)

                            // Subscribe now if the stream is not already subscribed or subscribing
                            if (!newOrExistingStream.isSubscribed() && !newOrExistingStream.isSubscribing()) {
                                newOrExistingStream.setSubscribing()
                                this.networkNode.subscribe(streamObj.id, 0)
                                newOrExistingStream.setSubscribed()

                                newOrExistingStream.addConnection(connection)
                                connection.addStream(newOrExistingStream)
                                debug(
                                    'handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"',
                                    connection.id, connection.streamsAsString()
                                )

                                client.suback({
                                    granted: [packet.qos], messageId: packet.messageId
                                })
                            }
                        })
                        .catch((response) => {
                            console.log(response)
                            // debug(
                            //     'handleSubscribeRequest: socket "%s" failed to
                            //     subscribe to stream %s:%d because of "%o"',
                            //     connection.id, request.streamId, request.streamPartition, response
                            // )
                            // connection.sendError(`Not authorized to subscribe to stream ${
                            //     request.streamId
                            //     } and partition ${
                            //     request.streamPartition
                            //     }`)
                        })
                })

            // const { topic, username, password } = packet
            // const apiKey = password.toString('utf8')
            //
            // console.log('%s ===== > %s', topic, password)
            // // const { apiKey } = JSON.parse(packet.payload.toString('utf8'))

            // if (topic && password) {

            // this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken)
            //     .then((/* streamJson */) => {
            //         const stream = this.streams.getOrCreate(request.streamId, request.streamPartition)
            //
            //         // Subscribe now if the stream is not already subscribed or subscribing
            //         if (!stream.isSubscribed() && !stream.isSubscribing()) {
            //             stream.setSubscribing()
            //             this.networkNode.subscribe(request.streamId, request.streamPartition)
            //             stream.setSubscribed()
            //
            //             stream.addConnection(connection)
            //             connection.addStream(stream)
            //             debug(
            //                 'handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"',
            //                 connection.id, connection.streamsAsString()
            //             )
            //             connection.send(ControlLayer.SubscribeResponse.create(request.streamId, request.streamPartition))
            //         }
            //     })
            //     .catch((response) => {
            //         debug(
            //             'handleSubscribeRequest: socket "%s" failed to subscribe to stream %s:%d because of "%o"',
            //             connection.id, request.streamId, request.streamPartition, response
            //         )
            //         connection.sendError(`Not authorized to subscribe to stream ${
            //             request.streamId
            //             } and partition ${
            //             request.streamPartition
            //             }`)
            //     })

            // this.streamFetcher.authenticate(request.streamId, request.apiKey, request.sessionToken)
            //     .then((/* streamJson */) => {
            //         const stream = this.streams.getOrCreate(request.streamId, request.streamPartition)
            //
            //         // Subscribe now if the stream is not already subscribed or subscribing
            //         if (!stream.isSubscribed() && !stream.isSubscribing()) {
            //             stream.setSubscribing()
            //             this.networkNode.subscribe(request.streamId, request.streamPartition)
            //             stream.setSubscribed()
            //
            //             stream.addConnection(connection)
            //             connection.addStream(stream)
            //             debug(
            //                 'handleSubscribeRequest: socket "%s" is now subscribed to streams "%o"',
            //                 connection.id, connection.streamsAsString()
            //             )
            //             connection.send(ControlLayer.SubscribeResponse.create(request.streamId, request.streamPartition))
            //         }
            //     })
            //     .catch((response) => {
            //         debug(
            //             'handleSubscribeRequest: socket "%s" failed to subscribe to stream %s:%d because of "%o"',
            //             connection.id, request.streamId, request.streamPartition, response
            //         )
            //         connection.sendError(`Not authorized to subscribe to stream ${
            //             request.streamId
            //             } and partition ${
            //             request.streamPartition
            //             }`)
            //     })
            //
            // client.suback({
            //     granted: [packet.qos], messageId: packet.messageId
            // })
            //
            // packet.subscriptions.forEach((subscription) => {
            //     this.emit('subscribe', {
            //         streamId: subscription.topic,
            //         streamPartition: 0
            //     })
            //
            //     this._clients.get(client.id).topics.push(subscription.topic)
            // })
        })
    }

    _closeClient(connection) {
        this.volumeLogger.connectionCount -= 1
        debug('closing socket "%s" on streams "%o"', connection.id, connection.streamsAsString())

        // Unsubscribe from all streams
        connection.forEachStream((stream) => {
            // this.handleUnsubscribeRequest(
            //     connection,
            //     ControlLayer.UnsubscribeRequest.create(stream.id, stream.partition),
            //     true,
            // )
        })

        connection.client.destroy()
    }

    broadcastMessage({
        streamId,
        streamPartition,
        timestamp,
        sequenceNo,
        publisherId,
        msgChainId,
        previousTimestamp,
        previousSequenceNo,
        data,
        signatureType,
        signature,
    }) {
        const stream = this.streams.get(streamId, streamPartition)

        if (stream) {
            stream.forEachConnection((connection) => {
                // TODO: performance fix, no need to re-create on every loop iteration
                const payload = JSON.stringify(data)

                const object = {
                    cmd: 'publish',
                    topic: stream.name,
                    payload
                }

                connection.client.publish(object, () => {})
            })

            // this.volumeLogger.logOutput(streamMessage.getSerializedContent().length * stream.getConnections().length)
        } else {
            debug('broadcastMessage: stream "%s:%d" not found', streamId, streamPartition)
        }
    }

    // createStreamMessage(streamId, data, sequenceNumber, timestamp = Date.now(), messageChaindId = null) {
    //     return MessageLayer.StreamMessage.create(
    //         [streamId, 0, Date.now(), sequenceNumber, '0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963', messageChaindId], 0,
    //         MessageLayer.StreamMessage.CONTENT_TYPES.JSON, data, MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE, null,
    //     )
    // }
}

