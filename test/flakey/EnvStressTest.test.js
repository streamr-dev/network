import { pTimeout } from '../../src/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { fakePrivateKey, uid } from '../utils'
import config from '../integration/config'

const TEST_REPEATS = 6
const MAX_CONCURRENCY = 24
const TEST_TIMEOUT = 5000
const INC_FACTOR = 1.5

/* eslint-disable require-atomic-updates, no-loop-func */

describe('EnvStressTest', () => {
    let client

    const createClient = (opts = {}) => new StreamrClient({
        autoConnect: false,
        autoDisconnect: false,
        ...clientOptions,
        ...opts,
    })

    describe('Stream Creation + Deletion', () => {
        const nextConcurrency = (j) => {
            if (j === MAX_CONCURRENCY) {
                return j + 1
            }

            return Math.min(MAX_CONCURRENCY, Math.round(j * INC_FACTOR))
        }

        for (let j = 1; j <= MAX_CONCURRENCY; j = nextConcurrency(j)) {
            describe(`Create ${j} streams`, () => {
                let errors = []
                beforeAll(() => {
                    errors = []
                })

                afterAll(() => {
                    expect(errors).toEqual([])
                })

                for (let i = 0; i < TEST_REPEATS; i++) {
                    test(`Test ${i + 1} of ${TEST_REPEATS}`, async () => {
                        const testDesc = `with concurrency ${j} for test ${i + 1}`
                        client = createClient({
                            auth: {
                                privateKey: fakePrivateKey(),
                            },
                        })

                        await pTimeout(client.session.getSessionToken(), TEST_TIMEOUT, `Timeout getting session token ${testDesc}`)

                        const names = []
                        for (let k = 0; k < j; k++) {
                            names.push(uid(`stream ${k + 1} . `))
                        }

                        const streams = await Promise.all(names.map((name, index) => (
                            pTimeout(client.createStream({
                                name,
                                requireSignedData: true,
                                requireEncryptedData: false,
                            }), TEST_TIMEOUT * j * 0.2, `Timeout creating stream ${index + 1} ${testDesc}`)
                        )))

                        streams.forEach((createdStream, index) => {
                            try {
                                expect(createdStream.id).toBeTruthy()
                                expect(createdStream.name).toBe(names[index])
                                expect(createdStream.requireSignedData).toBe(true)
                            } catch (err) {
                                errors.push(`Error with stream ${index + 1} in ${testDesc}: ${err.message}`)
                                throw err
                            }
                        })

                        await Promise.all(streams.map((s, index) => (
                            pTimeout(s.delete(), TEST_TIMEOUT * j * 0.2, `Timeout deleting stream ${index + 1} ${testDesc}`)
                        )))
                    }, TEST_TIMEOUT * j * 1.2)
                }
            })
        }
    })
})
