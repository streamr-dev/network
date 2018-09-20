const assert = require('assert')
const { getTestEndpoints, DEFAULT_TIMEOUT } = require('../util')
const endpointEvents = require('../../src/connection/Libp2pEndpoint').events
const Node = require('../../src/logic/Node')
const Publisher = require('../../src/logic/Publisher')
const TrackerNode = require('../../src/protocol/TrackerNode')
const NodeToNode = require('../../src/protocol/NodeToNode')

const { version } = require('../../package.json')

jest.setTimeout(DEFAULT_TIMEOUT)

describe('publisher and node connection', () => {
    it('should be able to start publisher and node, send message, receive and then stop successfully', async (done) => {
        const MAX = 2

        // create MAX endpoints
        const endpoints = await getTestEndpoints(MAX, 30990)
        const endpoint1 = endpoints[0]
        const endpoint2 = endpoints[1]

        const node = new Node(new TrackerNode(endpoint1), new NodeToNode(endpoint1))
        const publisher = new Publisher(new NodeToNode(endpoint2), endpoint1.node.peerInfo)
        const streamId = 'streamd-id'

        assert(!node.isOwnStream(streamId))

        publisher.publish(streamId, 'Hello world, from Publisher ' + endpoint2.node.peerInfo.id.toB58String(), () => {})

        endpoint1.on(endpointEvents.MESSAGE_RECEIVED, ({ sender, message }) => {
            assert.equal(message, `{"version":"${version}","code":2,"data":["${streamId}","Hello world, from Publisher ${endpoint2.node.peerInfo.id.toB58String()}"]}`)
            assert(!node.isOwnStream(streamId))

            endpoint1.node.stop(() => {
                endpoint2.node.stop(() => done())
            })
        })
    })
})
