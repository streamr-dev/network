const assert = require('assert')
const { getTestConnections, DEFAULT_TIMEOUT } = require('../util')
const connectionEvents = require('../../src/connection/Connection').events
const Node = require('../../src/logic/Node')
const Publisher = require('../../src/logic/Publisher')
const TrackerNode = require('../../src/protocol/TrackerNode')
const NodeToNode = require('../../src/protocol/NodeToNode')

const { version } = require('../../package.json')

jest.setTimeout(DEFAULT_TIMEOUT)

describe('publisher and node connection', () => {
    it('should be able to start publisher and node, send message, receive and then stop successfully', async (done) => {
        const MAX = 2

        // create MAX connections
        const connections = await getTestConnections(MAX, 30990)
        const conn1 = connections[0]
        const conn2 = connections[1]

        const node = new Node(new TrackerNode(conn1), new NodeToNode(conn1))
        const publisher = new Publisher(new NodeToNode(conn2), conn1.node.peerInfo)
        const streamId = 'streamd-id'

        assert(!node.isOwnStream(streamId))

        publisher.publish(streamId, 'Hello world, from Publisher ' + conn2.node.peerInfo.id.toB58String(), () => {})

        conn1.on(connectionEvents.MESSAGE_RECEIVED, ({ sender, message }) => {
            assert.equal(message, `{"version":"${version}","code":2,"data":["${streamId}","Hello world, from Publisher ${conn2.node.peerInfo.id.toB58String()}"]}`)
            assert(!node.isOwnStream(streamId))

            conn1.node.stop(() => {
                conn2.node.stop(() => done())
            })
        })
    })
})
