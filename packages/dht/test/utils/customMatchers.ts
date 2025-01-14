import { areEqualBinaries } from '@streamr/utils'
import { printExpected, printReceived } from 'jest-matcher-utils'
import { isEqual } from 'lodash'
import { ConnectivityMethod, NodeType, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { toDhtAddress } from '../../src/identifiers'

// we could ES2015 module syntax (https://jestjs.io/docs/expect#expectextendmatchers),
// but the IDE doesn't find custom matchers if we do that
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Matchers<R> {
            toEqualPeerDescriptor(expected: PeerDescriptor): R
        }
    }
}

const formErrorMessage = (
    field: keyof PeerDescriptor,
    expected: string | number | undefined,
    actual: string | number | undefined
): string => {
    return `PeerDescriptor ${field} values don't match:\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
}

const toEqualPeerDescriptor = (actual: PeerDescriptor, expected: PeerDescriptor): jest.CustomMatcherResult => {
    const messages: string[] = []
    if (!areEqualBinaries(expected.nodeId, actual.nodeId)) {
        messages.push(formErrorMessage('nodeId', toDhtAddress(expected.nodeId), toDhtAddress(actual.nodeId)))
    }
    if (!isEqual(expected.type, actual.type)) {
        const typeNames = { [NodeType.NODEJS]: 'NODEJS', [NodeType.BROWSER]: 'BROWSER' }
        messages.push(formErrorMessage('type', typeNames[expected.type], typeNames[actual.type]))
    }
    expectEqualConnectivityMethod('udp', expected.udp, actual.udp, messages)
    expectEqualConnectivityMethod('tcp', expected.tcp, actual.tcp, messages)
    expectEqualConnectivityMethod('websocket', expected.websocket, actual.websocket, messages)
    if (expected.region !== actual.region) {
        messages.push(formErrorMessage('region', expected?.region, actual?.region))
    }
    if (messages.length > 0) {
        return {
            pass: false,
            message: () => messages.join('\n\n')
        }
    } else {
        return {
            pass: true,
            message: () => 'PeerDescriptors are equal'
        }
    }
}

const expectEqualConnectivityMethod = (
    field: keyof PeerDescriptor,
    method1: ConnectivityMethod | undefined,
    method2: ConnectivityMethod | undefined,
    messages: string[]
) => {
    const toOutput = (method?: ConnectivityMethod) => {
        return method !== undefined ? `{port: ${method.port}, host: '${method.host}', tls: ${method.tls}}` : undefined
    }
    if (!isEqual(method1, method2)) {
        messages.push(formErrorMessage(field, toOutput(method1), toOutput(method2)))
    }
}

expect.extend({
    toEqualPeerDescriptor
})
