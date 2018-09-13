const assert = require('assert')
const { createConnection } = require('../../src/connection/Connection')
const Node = require('../../src/logic/Node')
const Publisher = require('../../src/logic/Publisher')

jest.setTimeout(30000)

describe('publisher and node connection', () => {
    it('should be able to start publisher and node, send message, receive and then stop successfully', (done) => {
        let conn1
        let conn2
        let node
        let publisher

        createConnection('127.0.0.1', 30350, '', true).then((connection) => {
            conn1 = connection
            node = new Node(connection)
        }).then(() => createConnection('127.0.0.1', 30351, '', true).then((connection2) => {
            conn2 = connection2

            connection2.connect(conn1.node.peerInfo)

            publisher = new Publisher(connection2, conn1.node.peerInfo)
            publisher.publish(node.status.streams[0], 'Hello world, from Publisher ' + conn2.node.peerInfo.id.toB58String(), () => {})

            conn1.on('streamr:message-received', ({ sender, message }) => {
                assert.equal(message, `{"version":"1.0.0","code":2,"data":["${node.status.streams[0]}","Hello world, from Publisher ${connection2.node.peerInfo.id.toB58String()}"]}`)
                conn1.node.stop(() => {
                    conn2.node.stop(() => done())
                })
            })

            // assert.equal(conn1.getPeers().length, 0)
            // assert.equal(conn2.getPeers().length, 0)
            //
            // conn1.connect(conn2.node.peerInfo)
            //
            // conn2.on(events.PEER_CONNECTED, () => {
            //     assert.equal(conn1.getPeers().length, 1)
            //     assert.equal(conn2.getPeers().length, 1)
            //
            //     conn1.node.stop(() => {
            //         conn2.node.stop(() => done())
            //     })
            // })
        }))
    })
})

// describe('publisher and node connection', () => {
//     it('should be able to start publisher and node, send message, recieve and then stop successfully', (done) => {
//         // create node
//         const connection = new Connection('127.0.0.1', 30333, '', true)
//         const node = new Node(connection)
//         let connection2 = null
//
//         node.connection.on('node:ready', () => {
//             assert(connection.isStarted())
//
//             connection2 = new Connection('127.0.0.1', 30337, '', true)
//
//             connection2.once('node:ready', () => {
//                 assert(connection2.isStarted())
//
//                 connection2.connect(node.connection.node.peerInfo)
//                 const publisher = new Publisher(connection2, node.connection.node.peerInfo)
//
//                 publisher.publish(node.status.streams[0], 'Hello world, from Publisher ' + connection2.node.peerInfo.id.toB58String(), () => {})
//             })
//         })
//
//         node.connection.on('streamr:message-received', ({ sender, message }) => {
//             assert.equal(message, `{"version":"1.0.0","code":2,"data":["${node.status.streams[0]}","Hello world, from Publisher ${connection2.node.peerInfo.id.toB58String()}"]}`)
//             connection.node.stop(() => {
//                 connection2.node.stop(() => done())
//             })
//         })
//     })
// })
