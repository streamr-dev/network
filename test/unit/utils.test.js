const { networkMessageToStreamrMessage } = require('../../src/utils')

describe('networkMessageToStreamrMessage', () => {
    test('converts minimal message', () => {
        const actual = networkMessageToStreamrMessage({
            streamId: 'streamId',
            streamPartition: 1,
            timestamp: 123456789,
            sequenceNo: 5005,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            data: {
                hello: 'world'
            }
        })
        expect(actual.serialize(undefined, {
            stringify: false
        })).toEqual([
            30,
            [
                'streamId',
                1,
                123456789,
                5005,
                'publisherId',
                'msgChainId'
            ],
            null,
            27,
            JSON.stringify({
                hello: 'world'
            }),
            undefined,
            undefined
        ])
    })

    test('converts message with previousMessageRef', () => {
        const actual = networkMessageToStreamrMessage({
            streamId: 'streamId',
            streamPartition: 1,
            timestamp: 123456789,
            sequenceNo: 5005,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            data: {
                hello: 'world'
            },
            previousTimestamp: 100000000,
            previousSequenceNo: 6006,
        })
        expect(actual.serialize(undefined, {
            stringify: false
        })).toEqual([
            30,
            [
                'streamId',
                1,
                123456789,
                5005,
                'publisherId',
                'msgChainId'
            ],
            [
                100000000,
                6006
            ],
            27,
            JSON.stringify({
                hello: 'world'
            }),
            undefined,
            undefined
        ])
    })

    test('converts full message', () => {
        const actual = networkMessageToStreamrMessage({
            streamId: 'streamId',
            streamPartition: 1,
            timestamp: 123456789,
            sequenceNo: 5005,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            data: {
                hello: 'world'
            },
            previousTimestamp: 100000000,
            previousSequenceNo: 6006,
            signatureType: 2,
            signature: 'signed'
        })
        expect(actual.serialize(undefined, {
            stringify: false
        })).toEqual([
            30,
            [
                'streamId',
                1,
                123456789,
                5005,
                'publisherId',
                'msgChainId'
            ],
            [
                100000000,
                6006
            ],
            27,
            JSON.stringify({
                hello: 'world'
            }),
            2,
            'signed'
        ])
    })
})
