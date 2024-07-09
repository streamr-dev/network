import 'reflect-metadata'

import { formEvmContractConditions, LitProtocolFacade } from '../../src/encryption/LitProtocolFacade'
import { LitNodeClient } from '@lit-protocol/lit-node-client'
import { mock, mockDeep, MockProxy } from 'jest-mock-extended'
import { randomEthereumAddress } from '@streamr/test-utils'
import { LoggerFactory } from '../../src/utils/LoggerFactory'
import { Logger, toStreamID } from '@streamr/utils'
import { randomBytes } from 'crypto'
import { createRandomAuthentication } from '../test-utils/utils'

const KEY = randomBytes(32)
const STREAM_ID = toStreamID('foo.ens/bar')
const ADDRESS = randomEthereumAddress()
const evmContractConditions = formEvmContractConditions(ADDRESS, STREAM_ID)

describe('LitProtocolFacade', () => {
    let client: MockProxy<LitNodeClient>
    let facade: LitProtocolFacade

    beforeEach(() => {
        client = mock<LitNodeClient>()
        const authentication = createRandomAuthentication()
        const loggerFactory = mockDeep<LoggerFactory>()
        loggerFactory.createLogger.mockReturnValue(mock<Logger>())
        facade = new LitProtocolFacade({
            contracts: {
                streamRegistryChainAddress: ADDRESS
            }
        } as any, authentication, loggerFactory)
    })

    describe('client not set', () => {
        it('isLitProtocolEnabled returns false', () => {
            expect(facade.isLitProtocolEnabled()).toBe(false)
        })

        it('store does nothing', async () => {
            const result = await facade.store(STREAM_ID, KEY)
            expect(client.encrypt).toHaveBeenCalledTimes(0)
            expect(result).toBeUndefined()
        })

        it('get does nothing', async () => {
            const result = await facade.get(STREAM_ID, 'groupKeyId')
            expect(client.decrypt).toHaveBeenCalledTimes(0)
            expect(result).toBeUndefined()
        })
    })

    describe('client set', () => {
        beforeEach(() => {
            facade.setLitNodeClient(client)
        })

        it('isLitProtocolEnabled returns true', () => {
            expect(facade.isLitProtocolEnabled()).toBe(true)
        })

        describe('store', () => {
            it('calls encrypt and returns groupKey', async () => {
                client.encrypt.mockResolvedValue({
                    ciphertext: 'ciphertext',
                    dataToEncryptHash: 'dataToEncryptHash'
                })
                const result = await facade.store(STREAM_ID, KEY)
                expect(result).toEqual({
                    id: 'ciphertext::dataToEncryptHash',
                    data: KEY
                })
                expect(client.encrypt).toHaveBeenCalledWith({
                    dataToEncrypt: KEY,
                    evmContractConditions
                })
            })

            it('returns undefined if encrypt rejects', async () => {
                client.encrypt.mockRejectedValueOnce(new Error('failed to encrypt'))
                const result = await facade.store(STREAM_ID, KEY)
                expect(result).toBeUndefined()
            })
        })

        describe('get', () => {
            it('calls decrypt and returns groupKey', async () => {
                client.decrypt.mockResolvedValue({
                    decryptedData: KEY
                })
                const result = await facade.get(STREAM_ID, 'ciphertext::dataToEncryptHash')
                expect(result).toEqual({
                    id: 'ciphertext::dataToEncryptHash',
                    data: KEY
                })
                expect(client.decrypt).toHaveBeenCalledWith({
                    evmContractConditions,
                    chain: 'polygon',
                    ciphertext: 'ciphertext',
                    dataToEncryptHash: 'dataToEncryptHash',
                    authSig: expect.anything()
                })
            })

            it('returns undefined if decrypt rejects', async () => {
                client.decrypt.mockRejectedValueOnce(new Error('failed to decrypt'))
                const result = await facade.get(STREAM_ID, 'ciphertext::dataToEncryptHash')
                expect(result).toBeUndefined()
            })

            it('returns undefined if groupKeyId not splittable', async () => {
                client.decrypt.mockResolvedValue({
                    decryptedData: KEY
                })
                const result = await facade.get(STREAM_ID, 'ciphertext')
                expect(result).toBeUndefined()
            })
        })
    })
})
