import { StreamPartIDUtils } from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { SubscriberKeyExchange } from '../../src/encryption/SubscriberKeyExchange'
import { Decrypt } from '../../src/subscribe/Decrypt'
import { Signal } from '../../src/utils/Signal'
import { createMockMessage, mockContext } from '../test-utils/utils'

describe('Decrypt', () => {

    describe.each([
        [true, /Could not get GroupKey.*mock-error/],
        [false, /Could not get GroupKey.*no permission/]
    ])('group key not available', (isError: boolean, expectedErrorMessage: RegExp) => {
        it(`error: ${isError}`, async () => {
            const keyExchange: Partial<SubscriberKeyExchange> = {
                getGroupKey: jest.fn().mockImplementation(async () => {
                    if (isError) {
                        throw new Error('mock-error')
                    } else {
                        return undefined
                    }
                })
            }
            const decrypt = new Decrypt(
                mockContext(),
                {
                    clearStream: jest.fn()
                } as any,
                keyExchange as any,
                {
                    onDestroy: Signal.create()
                } as any
            )
            const msg = createMockMessage({
                streamPartId: StreamPartIDUtils.parse('stream#0'),
                publisher: fastWallet(),
                encryptionKey: GroupKey.generate()
            })
            expect(() => decrypt.decrypt(msg)).rejects.toThrow(expectedErrorMessage)
        })
    })
})
