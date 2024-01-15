import { areEqualBinaries } from '@streamr/utils'
import { printExpected, printReceived } from 'jest-matcher-utils'
import { isEqual } from 'lodash'
import { ConnectivityMethod, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { getDhtAddressFromRaw } from '../../src/identifiers'

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

const formErrorMessage = (description: string, expected: string | number | undefined, actual: string | number | undefined): string => {
    return `${description}\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
}

const toEqualPeerDescriptor = (
    actual: PeerDescriptor,
    expected: PeerDescriptor
): jest.CustomMatcherResult => {
    const messages: string[] = []
    if (!areEqualBinaries(expected.nodeId, actual.nodeId)) {
        messages.push(formErrorMessage('nodeId', getDhtAddressFromRaw(expected.nodeId), getDhtAddressFromRaw(actual.nodeId)))
    }
    if (!isEqual(expected.details?.type, actual.details?.type)) {
        const typeNames = { [NodeType.NODEJS]: 'NODEJS', [NodeType.BROWSER]: 'BROWSER' }
        messages.push(formErrorMessage('type', typeNames[expected.details!.type], typeNames[actual.details!.type]))
    }
    expectEqualConnectivityMethod('udp', expected.details?.udp, actual.details?.udp, messages)
    expectEqualConnectivityMethod('tpc', expected.details?.tcp, actual.details?.tcp, messages)
    expectEqualConnectivityMethod('websocket', expected.details?.websocket, actual.details?.websocket, messages)
    if (expected.details?.region !== actual.details?.region) {
        messages.push(formErrorMessage('region', expected?.details?.region, actual?.details?.region))
    } 
    if (messages.length > 0) {
        return {
            pass: false,
            message: () => messages.join('\n\n')
        }
    } else {
        return {
            pass: true,
            message: () => `Expected not to throw ${printReceived('StreamrClientError')}`
        }
    }
}

const expectEqualConnectivityMethod = (
    description: string,
    method1: ConnectivityMethod | undefined,
    method2: ConnectivityMethod | undefined,
    messages: string[]
) => {
    const toOutput = (method?: ConnectivityMethod) => {
        return (method !== undefined)
            ? `{port: ${method.port}, host: '${method.host}', tls: ${method.tls}}`
            : undefined
    }
    if (!isEqual(method1, method2)) {
        messages.push(formErrorMessage(description, toOutput(method1), toOutput(method2)))
    }
}

expect.extend({
    toEqualPeerDescriptor
})
