import assert from 'assert'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import UnsupportedVersionError from '../../../../src/errors/UnsupportedVersionError'
import UnsupportedTypeError from '../../../../src/errors/UnsupportedTypeError'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import PublishRequestV0 from '../../../../src/protocol/control_layer/publish_request/PublishRequestV0'
import PublishRequestV1 from '../../../../src/protocol/control_layer/publish_request/PublishRequestV1'
import SubscribeRequestV0 from '../../../../src/protocol/control_layer/subscribe_request/SubscribeRequestV0'
import SubscribeRequestV1 from '../../../../src/protocol/control_layer/subscribe_request/SubscribeRequestV1'
import UnsubscribeRequestV0 from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequestV0'
import UnsubscribeRequestV1 from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequestV1'
import BroadcastMessageV0 from '../../../../src/protocol/control_layer/broadcast_message/BroadcastMessageV0'
import BroadcastMessageV1 from '../../../../src/protocol/control_layer/broadcast_message/BroadcastMessageV1'
import UnicastMessageV0 from '../../../../src/protocol/control_layer/unicast_message/UnicastMessageV0'
import UnicastMessageV1 from '../../../../src/protocol/control_layer/unicast_message/UnicastMessageV1'
import SubscribeResponseV0 from '../../../../src/protocol/control_layer/subscribe_response/SubscribeResponseV0'
import SubscribeResponseV1 from '../../../../src/protocol/control_layer/subscribe_response/SubscribeResponseV1'
import UnsubscribeResponseV0 from '../../../../src/protocol/control_layer/unsubscribe_response/UnsubscribeResponseV0'
import UnsubscribeResponseV1 from '../../../../src/protocol/control_layer/unsubscribe_response/UnsubscribeResponseV1'
import ResendResponseResendingV0 from '../../../../src/protocol/control_layer/resend_response_resending/ResendResponseResendingV0'
import ResendResponseResendingV1 from '../../../../src/protocol/control_layer/resend_response_resending/ResendResponseResendingV1'
import ResendResponseResentV0 from '../../../../src/protocol/control_layer/resend_response_resent/ResendResponseResentV0'
import ResendResponseResentV1 from '../../../../src/protocol/control_layer/resend_response_resent/ResendResponseResentV1'
import ResendResponseNoResendV0 from '../../../../src/protocol/control_layer/resend_response_no_resend/ResendResponseNoResendV0'
import ResendResponseNoResendV1 from '../../../../src/protocol/control_layer/resend_response_no_resend/ResendResponseNoResendV1'
import ResendLastRequestV1 from '../../../../src/protocol/control_layer/resend_request/ResendLastRequestV1'
import ResendFromRequestV1 from '../../../../src/protocol/control_layer/resend_request/ResendFromRequestV1'
import ResendRangeRequestV1 from '../../../../src/protocol/control_layer/resend_request/ResendRangeRequestV1'
import ErrorResponseV0 from '../../../../src/protocol/control_layer/error_response/ErrorResponseV0'
import ErrorResponseV1 from '../../../../src/protocol/control_layer/error_response/ErrorResponseV1'
import ResendRequestV0 from '../../../../src/protocol/control_layer/resend_request/ResendRequestV0'

const examplesByTypeV0 = {
    '0': [0, 0, null, [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
        941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}']],
    '1': [0, 1, 'subId', [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
        941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}']],
    '2': [0, 2, null, {
        stream: 'id',
        partition: 0,
    }],
    '3': [0, 3, null, {
        stream: 'id',
        partition: 0,
    }],
    '4': [0, 4, null, {
        stream: 'id',
        partition: 0,
        sub: 'subId',
    }],
    '5': [0, 5, null, {
        stream: 'id',
        partition: 0,
        sub: 'subId',
    }],
    '6': [0, 6, null, {
        stream: 'id',
        partition: 0,
        sub: 'subId',
    }],
    '7': [0, 7, null, {
        error: 'foo',
    }],
    publish: {
        type: 'publish',
        stream: 'streamId',
        authKey: 'authKey',
        sessionToken: 'sessionToken',
        msg: JSON.stringify({
            foo: 'bar',
        }),
        ts: 1533924184016,
        pkey: 'deviceId',
        addr: 'publisherAddress',
        sigtype: StreamMessage.SIGNATURE_TYPES.ETH,
        sig: 'signature',
    },
    subscribe: {
        type: 'subscribe',
        stream: 'streamId',
        partition: 0,
        authKey: 'authKey',
        sessionToken: 'sessionToken',
    },
    unsubscribe: {
        type: 'unsubscribe',
        stream: 'id',
        partition: 0,
    },
    resend: {
        type: 'resend',
        stream: 'id',
        partition: 0,
        sub: 'subId',
        resend_all: true,
    },
}

const examplesByTypeV1 = {
    '0': [1, 0, [30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
        [1529549961000, 0], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']],
    '1': [1, 1, 'requestId', [30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
        [1529549961000, 0], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']],
    '2': [1, 2, 'streamId', 0],
    '3': [1, 3, 'streamId', 0],
    '4': [1, 4, 'streamId', 0, 'requestId'],
    '5': [1, 5, 'streamId', 0, 'requestId'],
    '6': [1, 6, 'streamId', 0, 'requestId'],
    '7': [1, 7, 'errorMessage'],
    '8': [1, 8, [30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'], [1529549961000, 0],
        StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature'], 'sessionToken'],
    '9': [1, 9, 'streamId', 0, 'sessionToken'],
    '10': [1, 10, 'streamId', 0],
    '11': [1, 11, 'streamId', 0, 'requestId', 100, 'sessionToken'],
    '12': [1, 12, 'streamId', 0, 'requestId', [132846894, 0], 'publisherId', 'msgChainId', 'sessionToken'],
    '13': [1, 13, 'streamId', 0, 'requestId', [132846894, 0], [132847000, 0], 'publisherId', 'msgChainId', 'sessionToken'],
}

describe('ControlMessage', () => {
    it('should throw when unsupported version', () => {
        const arr = [123, 1]
        assert.throws(() => ControlMessage.deserialize(arr), (err) => {
            assert(err instanceof UnsupportedVersionError)
            assert.equal(err.version, 123)
            return true
        })
    })
    it('should throw when unsupported type', () => {
        const arr = [1, 180]
        assert.throws(() => ControlMessage.deserialize(arr), (err) => {
            assert(err instanceof UnsupportedTypeError)
            assert.equal(err.type, 180)
            return true
        })
    })
    describe('version 0', () => {
        describe('deserialize', () => {
            let clazz
            let array
            let result
            beforeEach(() => {
                array = null
                clazz = null
            })
            afterEach(() => {
                result = ControlMessage.deserialize(JSON.stringify(array))
                assert(result instanceof clazz)
            })
            /* eslint-disable prefer-destructuring */
            it('BroadcastMessageV0', () => {
                clazz = BroadcastMessageV0
                array = examplesByTypeV0[0]
            })
            it('UnicastMessageV0', () => {
                clazz = UnicastMessageV0
                array = examplesByTypeV0[1]
            })
            it('SubscribeResponseV0', () => {
                clazz = SubscribeResponseV0
                array = examplesByTypeV0[2]
            })
            it('UnsubscribeResponseV0', () => {
                clazz = UnsubscribeResponseV0
                array = examplesByTypeV0[3]
            })
            it('ResendResponseResendingV0', () => {
                clazz = ResendResponseResendingV0
                array = examplesByTypeV0[4]
            })
            it('ResendResponseResentV0', () => {
                clazz = ResendResponseResentV0
                array = examplesByTypeV0[5]
            })
            it('ResendResponseNoResendV0', () => {
                clazz = ResendResponseNoResendV0
                array = examplesByTypeV0[6]
            })
            it('ErrorResponseV0', () => {
                clazz = ErrorResponseV0
                array = examplesByTypeV0[7]
            })
            it('PublishRequestV0', () => {
                clazz = PublishRequestV0
                array = examplesByTypeV0.publish
            })
            it('SubscribeRequestV0', () => {
                clazz = SubscribeRequestV0
                array = examplesByTypeV0.subscribe
            })
            it('UnsubscribeRequestV0', () => {
                clazz = UnsubscribeRequestV0
                array = examplesByTypeV0.unsubscribe
            })
            it('ResendRequestV0', () => {
                clazz = ResendRequestV0
                array = examplesByTypeV0.resend
            })
            /* eslint-enable prefer-destructuring */
        })
        describe('serialize', () => {
            let array
            let serialized
            beforeEach(() => {
                array = null
                serialized = null
            })
            afterEach(() => {
                const clone = {
                    ...array,
                }
                serialized = ControlMessage.deserialize(array).serialize()
                assert(typeof serialized === 'string')
                assert.deepEqual(clone, JSON.parse(serialized))
            })
            /* eslint-disable prefer-destructuring */
            it('BroadcastMessageV0', () => {
                array = examplesByTypeV0[0]
            })
            it('UnicastMessageV0', () => {
                array = examplesByTypeV0[1]
            })
            it('SubscribeResponseV0', () => {
                array = examplesByTypeV0[2]
            })
            it('UnsubscribeResponseV0', () => {
                array = examplesByTypeV0[3]
            })
            it('ResendResponseResendingV0', () => {
                array = examplesByTypeV0[4]
            })
            it('ResendResponseResentV0', () => {
                array = examplesByTypeV0[5]
            })
            it('ResendResponseNoResendV0', () => {
                array = examplesByTypeV0[6]
            })
            it('ErrorResponseV0', () => {
                array = examplesByTypeV0[7]
            })
            it('PublishRequestV0', () => {
                array = examplesByTypeV0.publish
            })
            it('SubscribeRequestV0', () => {
                array = examplesByTypeV0.subscribe
            })
            it('UnsubscribeRequestV0', () => {
                array = examplesByTypeV0.unsubscribe
            })
            it('ResendRequestV0', () => {
                array = examplesByTypeV0.resend
            })
            /* eslint-enable prefer-destructuring */
        })
    })
    describe('version 1', () => {
        describe('deserialize', () => {
            let clazz
            let array
            let result
            beforeEach(() => {
                array = null
                clazz = null
            })
            afterEach(() => {
                result = ControlMessage.deserialize(JSON.stringify(array))
                assert(result instanceof clazz)
            })
            /* eslint-disable prefer-destructuring */
            it('BroadcastMessageV1', () => {
                clazz = BroadcastMessageV1
                array = examplesByTypeV1[0]
            })
            it('UnicastMessageV1', () => {
                clazz = UnicastMessageV1
                array = examplesByTypeV1[1]
            })
            it('SubscribeResponseV1', () => {
                clazz = SubscribeResponseV1
                array = examplesByTypeV1[2]
            })
            it('UnsubscribeResponseV1', () => {
                clazz = UnsubscribeResponseV1
                array = examplesByTypeV1[3]
            })
            it('ResendResponseResendingV1', () => {
                clazz = ResendResponseResendingV1
                array = examplesByTypeV1[4]
            })
            it('ResendResponseResentV1', () => {
                clazz = ResendResponseResentV1
                array = examplesByTypeV1[5]
            })
            it('ResendResponseNoResendV1', () => {
                clazz = ResendResponseNoResendV1
                array = examplesByTypeV1[6]
            })
            it('ErrorResponseV1', () => {
                clazz = ErrorResponseV1
                array = examplesByTypeV1[7]
            })
            it('PublishRequestV1', () => {
                clazz = PublishRequestV1
                array = examplesByTypeV1[8]
            })
            it('SubscribeRequestV1', () => {
                clazz = SubscribeRequestV1
                array = examplesByTypeV1[9]
            })
            it('UnsubscribeRequestV1', () => {
                clazz = UnsubscribeRequestV1
                array = examplesByTypeV1[10]
            })
            it('ResendLastRequestV1', () => {
                clazz = ResendLastRequestV1
                array = examplesByTypeV1[11]
            })
            it('ResendFromRequestV1', () => {
                clazz = ResendFromRequestV1
                array = examplesByTypeV1[12]
            })
            it('ResendRangeRequestV1', () => {
                clazz = ResendRangeRequestV1
                array = examplesByTypeV1[13]
            })
            /* eslint-enable prefer-destructuring */
        })
        describe('serialize', () => {
            let array
            let serialized
            beforeEach(() => {
                array = null
                serialized = null
            })
            afterEach(() => {
                const clone = {
                    ...array,
                }
                serialized = ControlMessage.deserialize(array).serialize()
                assert(typeof serialized === 'string')
                assert.deepEqual(clone, JSON.parse(serialized))
            })
            /* eslint-disable prefer-destructuring */
            it('BroadcastMessageV1', () => {
                array = examplesByTypeV1[0]
            })
            it('UnicastMessageV1', () => {
                array = examplesByTypeV1[1]
            })
            it('SubscribeResponseV1', () => {
                array = examplesByTypeV1[2]
            })
            it('UnsubscribeResponseV1', () => {
                array = examplesByTypeV1[3]
            })
            it('ResendResponseResendingV1', () => {
                array = examplesByTypeV1[4]
            })
            it('ResendResponseResentV1', () => {
                array = examplesByTypeV1[5]
            })
            it('ResendResponseNoResendV1', () => {
                array = examplesByTypeV1[6]
            })
            it('ErrorResponseV1', () => {
                array = examplesByTypeV1[7]
            })
            it('PublishRequestV1', () => {
                array = examplesByTypeV1[8]
            })
            it('SubscribeRequestV1', () => {
                array = examplesByTypeV1[9]
            })
            it('UnsubscribeRequestV1', () => {
                array = examplesByTypeV1[10]
            })
            it('ResendLastRequestV1', () => {
                array = examplesByTypeV1[11]
            })
            it('ResendFromRequestV1', () => {
                array = examplesByTypeV1[12]
            })
            it('ResendRangeRequestV1', () => {
                array = examplesByTypeV1[13]
            })
            /* eslint-enable prefer-destructuring */
        })
    })
})
