import LeakDetector from 'jest-leak-detector'
import { waitForCondition } from '@streamr/utils'
import { DhtNode } from '../../src/dht/DhtNode'
import { Message, MessageType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { createMockPeerDescriptor } from '../utils/utils'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'

const MESSAGE_ID = 'mock-message-id'

describe('memory leak', () => {

    it('send message', async () => {
        const entryPointDescriptor = createMockPeerDescriptor({
            websocket: {
                host: '127.0.0.1',
                port: 11224,
                tls: false
            }
        })
        let entryPoint: DhtNode | undefined = new DhtNode({
            nodeId: getNodeIdFromPeerDescriptor(entryPointDescriptor),
            websocketHost: entryPointDescriptor.details?.websocket!.host,
            websocketPortRange: {
                min: entryPointDescriptor.details!.websocket!.port,
                max: entryPointDescriptor.details!.websocket!.port
            },
            entryPoints: [entryPointDescriptor],
            websocketServerEnableTls: false
        })
        await entryPoint.start()
        await entryPoint.joinDht([entryPointDescriptor])
        let sender: DhtNode | undefined = new DhtNode({})
        let receiver: DhtNode | undefined = new DhtNode({})
        await Promise.all([
            (async () => {
                await sender.start()
                await sender.joinDht([entryPointDescriptor])
            })(),
            (async () => {
                await receiver.start()
                await receiver.joinDht([entryPointDescriptor])
            })()
        ])

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
        await detector1.isLeaking()
        expect(await detector1.isLeaking()).toBe(false)

        const detector2 = new LeakDetector(sender)
        sender = undefined
        expect(await detector2.isLeaking()).toBe(false)

        const detector3 = new LeakDetector(receiver)
        receiver = undefined
        expect(await detector3.isLeaking()).toBe(false)
    })
})
