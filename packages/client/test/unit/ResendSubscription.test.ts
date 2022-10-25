import 'reflect-metadata'
import { StreamPartIDUtils } from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import { DestroySignal } from '../../src/DestroySignal'
import { ResendSubscription } from "../../src/subscribe/ResendSubscription"
import { fromArray } from '../../src/utils/GeneratorUtils'
import { collect } from '../../src/utils/iterators'
import { STREAM_CLIENT_DEFAULTS } from './../../src/Config'
import { StreamrClientError } from './../../src/StreamrClientError'
import { createMockMessage } from './../test-utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('streamId#0')

describe('ResendSubscription', () => {

    it('no storage assigned', async () => {
        const logger = {
            debug: jest.fn(),
            warn: jest.fn()
        }
        const subscription = new ResendSubscription(
            STREAM_PART_ID,
            { last: 1 },
            {
                resend: async () => {
                    throw new StreamrClientError('mock-message', 'NO_STORAGE_NODES')
                }
            } as any,
            new DestroySignal(),
            {
                createLogger: () => logger
            } as any,
            STREAM_CLIENT_DEFAULTS
        )
        const onError = jest.fn()
        subscription.on('error', onError)
        const msg = await createMockMessage({
            streamPartId: STREAM_PART_ID,
            publisher: fastWallet()
        })
        const receivedMessages = await collect(subscription.resendThenRealtime(fromArray([msg])))
        expect(receivedMessages).toHaveLength(1)
        expect(onError).not.toBeCalled()
        expect(logger.warn).toBeCalledWith('no storage assigned: streamId')
    })
})
