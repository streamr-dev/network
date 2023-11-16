import LeakDetector from 'jest-leak-detector'
import { binaryToHex, waitForCondition } from '@streamr/utils'
import { randomBytes } from 'crypto'
import { DhtNode } from '../../src/dht/DhtNode'
import { Message, MessageType, NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'

const MESSAGE_ID = 'mock-message-id'

describe('memory leak', () => {

    it('send message', async () => {
        const entryPointDescriptor = {
            kademliaId: randomBytes(10),
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 11224,
                tls: false
            }
        }
        let entryPoint: DhtNode | undefined = new DhtNode({
            peerId: binaryToHex(entryPointDescriptor.kademliaId),
            websocketHost: entryPointDescriptor.websocket!.host,
            websocketPortRange: {
                min: entryPointDescriptor.websocket.port,
                max: entryPointDescriptor.websocket.port
            },
            entryPoints: [entryPointDescriptor],
            websocketServerEnableTls: false
        })
        await entryPoint.start()
        await entryPoint.joinDht([entryPointDescriptor])
        let sender: DhtNode | undefined = new DhtNode({})
        let receiver: DhtNode | undefined = new DhtNode({})
        /*TODO should this work? await Promise.all([
            async () => {
                await sender.start()
                await sender.joinDht([entryPointDescriptor])
            },
            async () => {
                await receiver.start()
                await receiver.joinDht([entryPointDescriptor])
            }
        ])*/
        await sender.start()
        await sender.joinDht([entryPointDescriptor])
        await receiver.start()
        await receiver.joinDht([entryPointDescriptor])

        let receivedMessage: Message | undefined = undefined
        receiver.on('message', (msg: Message) => receivedMessage = msg)
        const msg: Message = {
            serviceId: 'mock-service-id',
            targetDescriptor: receiver.getLocalPeerDescriptor(),
            messageType: MessageType.RPC,
            messageId: 'mock-message-id',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }
        await sender.send(msg)
        await waitForCondition(() => receivedMessage !== undefined)
        expect(receivedMessage!.messageId).toEqual(MESSAGE_ID)

        await Promise.all([
            entryPoint.stop(),
            sender.stop(),
            receiver.stop()
        ])

        const detector1 = new LeakDetector(entryPoint)
        entryPoint = undefined
        expect(await detector1.isLeaking()).toBe(false)

        const detector2 = new LeakDetector(sender)
        sender = undefined
        expect(await detector2.isLeaking()).toBe(false)

        const detector3 = new LeakDetector(receiver)
        receiver = undefined
        expect(await detector3.isLeaking()).toBe(false)
    })
})
