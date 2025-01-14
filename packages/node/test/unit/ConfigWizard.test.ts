import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { getNodeMnemonic, start } from '../../src/config/ConfigWizard'
import { render } from '@inquirer/testing'
import {
    checkbox as checkboxMock,
    confirm as confirmMock,
    input as inputMock,
    password as passwordMock,
    select as selectMock
} from '@inquirer/prompts'
import chalk from 'chalk'
import { parseEther, Wallet, JsonRpcProvider } from 'ethers'
import { v4 as uuidMock } from 'uuid'

const checkbox = checkboxMock as jest.MockedFunction<any>

const confirm = confirmMock as jest.MockedFunction<any>

const input = inputMock as jest.MockedFunction<any>

const password = passwordMock as jest.MockedFunction<any>

const select = selectMock as jest.MockedFunction<any>

const uuid = uuidMock as jest.MockedFunction<any>

jest.mock('uuid', () => {
    const uuid = jest.requireActual('uuid')

    return {
        ...uuid,
        v4: jest.fn(uuid.v4)
    }
})

jest.mock('@inquirer/prompts', () => {
    const inquirer = jest.requireActual('@inquirer/prompts')

    return {
        ...inquirer,
        checkbox: jest.fn(inquirer.checkbox),
        confirm: jest.fn(inquirer.confirm),
        input: jest.fn(inquirer.input),
        password: jest.fn(inquirer.password),
        select: jest.fn(inquirer.select)
    }
})

const fakeFetchResponseBody: jest.Mock<string | Error> = jest.fn(() => '{"data":{"operator":{"nodes":[]}}}')

interface AnswerMock {
    prompt: jest.MockedFunction<any>
    question: RegExp
    action: (r: Awaited<ReturnType<typeof render>>) => Promise<void>
    validate?: (screen: string) => void
}

const GENERATED_PRIVATE_KEY = '0x9a2f3b058b9b457f9f954e62ea9fd2cefe2978736ffb3ef2c1782ccfad9c411d'

const IMPORTED_PRIVATE_KEY = '0xb269c55ff525eac7633e80c01732d499015d5c22ce952e68272023c1d6c7f92f'

const OPERATOR_ADDRESS = '0x54d68882d5329397928787ec496da3ba8e45c48c'

const extractStoragePath = (summary: string): string | undefined => {
    const match = summary.match(/streamr-node ([^\s]w+)/)
    return match !== null ? match[1] : undefined
}

const expectPathsEqual = (actual: string | undefined, expected: string): void => {
    if (actual !== undefined) {
        const normalizedActual = path.normalize(realpathSync(actual))
        const normaliszedExpected = path.normalize(realpathSync(expected))
        expect(normalizedActual).toEqual(normaliszedExpected)
    } else {
        expect.fail('Path is undefined')
    }
}

describe('Config wizard', () => {
    let tempDir: string

    let storagePath: string

    const fakeBalance = jest.fn(() => '0.0')

    beforeEach(() => {
        jest.clearAllMocks()

        tempDir = mkdtempSync(path.join(os.tmpdir(), 'test-config-wizard'))

        storagePath = path.join(tempDir, 'config.json')

        jest.spyOn(Wallet, 'createRandom').mockImplementation(() => new Wallet(GENERATED_PRIVATE_KEY) as any)

        jest.spyOn(JsonRpcProvider.prototype, 'getBalance').mockImplementation(() =>
            Promise.resolve(parseEther(fakeBalance()))
        )

        fakeFetchResponseBody.mockImplementation(() => '{"data":{"operator":{"nodes":[]}}}')

        jest.spyOn(global, 'fetch').mockImplementation(() => {
            const result = fakeFetchResponseBody()

            return typeof result === 'string' ? Promise.resolve(new Response(result)) : Promise.reject(result)
        })
    })

    afterAll(() => {
        jest.clearAllMocks()
    })

    it('creates a config file with a generates private key', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, false, storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        expect(config.plugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('prints out the generated private key onto the screen if told to', async () => {
        const { answers } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey({ type: 'Y' }, 'enter', {
                find: GENERATED_PRIVATE_KEY
            }),
            Step.network('enter'),
            Step.rewards('abort')
        ])

        expect(answers).toEqual(['Generate', true, 'polygon'])
    })

    it('creates a config file with an imported private key', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource({ keypress: 'down' }, 'enter'),
            Step.providePrivateKey({ type: IMPORTED_PRIVATE_KEY }, 'enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Import', IMPORTED_PRIVATE_KEY, 'polygon', false, false, storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: IMPORTED_PRIVATE_KEY
                }
            }
        })

        expect(config.plugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x58cf5F58A722C544b7c39868c78D571519bB08b0\n`)

        expect(summary).toInclude(`generated name is Flee Kit Stomach\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('validates given private key', async () => {
        const { answers } = await scenario([
            Step.privateKeySource({ keypress: 'down' }, 'enter'),
            Step.providePrivateKey(
                { type: 'zzz' },
                'enter',
                { find: /invalid private key/i },
                { keypress: 'backspace' },
                { keypress: 'backspace' },
                { keypress: 'backspace' },
                { type: IMPORTED_PRIVATE_KEY },
                'enter'
            ),
            Step.network('abort')
        ])

        expect(answers).toEqual(['Import', IMPORTED_PRIVATE_KEY])

        expect(existsSync(storagePath)).toBe(false)
    })

    it('enables rewards (operator plugin)', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', true, OPERATOR_ADDRESS, false, storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { operator, ...otherPlugins } = config.plugins

        expect(operator).toMatchObject({
            operatorContractAddress: OPERATOR_ADDRESS
        })

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('validates the operator address', async () => {
        const { answers } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator(
                { type: 'zzz' },
                'enter',
                { find: /invalid ethereum address/i },
                { keypress: 'backspace' },
                { keypress: 'backspace' },
                { keypress: 'backspace' },
                { type: OPERATOR_ADDRESS },
                'enter'
            ),
            Step.pubsub('abort')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', true, OPERATOR_ADDRESS])

        expect(existsSync(storagePath)).toBe(false)
    })

    it('enables websocket plugin on the default port', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins({ keypress: 'space' }, 'enter'),
            Step.pubsubPort('enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, true, 'websocket', '7170', storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { websocket, ...otherPlugins } = config.plugins

        expect(websocket).toBeEmptyObject()

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('enables websocket plugin on a custom port', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins({ keypress: 'space' }, 'enter'),
            Step.pubsubPort({ type: '2000' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, true, 'websocket', '2000', storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { websocket, ...otherPlugins } = config.plugins

        expect(websocket.port).toEqual(2000)

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('enables mqtt plugin on the default port', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins({ keypress: 'down' }, { keypress: 'space' }, 'enter'),
            Step.pubsubPort('enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, true, 'mqtt', '1883', storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { mqtt, ...otherPlugins } = config.plugins

        expect(mqtt).toBeEmptyObject()

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('enables mqtt plugin on a custom port', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins({ keypress: 'down' }, { keypress: 'space' }, 'enter'),
            Step.pubsubPort({ type: '3000' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, true, 'mqtt', '3000', storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { mqtt, ...otherPlugins } = config.plugins

        expect(mqtt.port).toEqual(3000)

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('enables http plugin on the default port', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins({ keypress: 'down' }, { keypress: 'down' }, { keypress: 'space' }, 'enter'),
            Step.pubsubPort('enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, true, 'http', '7171', storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { http, ...otherPlugins } = config.plugins

        expect(http).toBeEmptyObject()

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('enables http plugin on a custom port', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins({ keypress: 'down' }, { keypress: 'down' }, { keypress: 'space' }, 'enter'),
            Step.pubsubPort({ type: '4000' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, true, 'http', '4000', storagePath])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { http, ...otherPlugins } = config.plugins

        expect(http).toBeEmptyObject()

        expect(otherPlugins).toBeEmptyObject()

        expect(config.httpServer.port).toEqual(4000)

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('enables all pubsub plugins on default ports', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins(
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                'enter'
            ),
            Step.pubsubPort('enter'),
            Step.pubsubPort('enter'),
            Step.pubsubPort('enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual([
            'Generate',
            false,
            'polygon',
            false,
            true,
            'websocket,mqtt,http',
            '7170',
            '1883',
            '7171',
            storagePath
        ])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { websocket, mqtt, http, ...otherPlugins } = config.plugins

        expect(websocket).toBeEmptyObject()

        expect(mqtt).toBeEmptyObject()

        expect(http).toBeEmptyObject()

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('enables all pubsub plugins on custom ports', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins(
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                'enter'
            ),
            Step.pubsubPort({ type: '2000' }, 'enter'),
            Step.pubsubPort({ type: '3000' }, 'enter'),
            Step.pubsubPort({ type: '4000' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual([
            'Generate',
            false,
            'polygon',
            false,
            true,
            'websocket,mqtt,http',
            '2000',
            '3000',
            '4000',
            storagePath
        ])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { websocket, mqtt, http, ...otherPlugins } = config.plugins

        expect(websocket.port).toEqual(2000)

        expect(mqtt.port).toEqual(3000)

        expect(http).toBeEmptyObject()

        expect(otherPlugins).toBeEmptyObject()

        expect(config.httpServer.port).toEqual(4000)

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('validates port number values', async () => {
        const { answers } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins({ keypress: 'space' }, 'enter'),
            Step.pubsubPort(
                { type: '12' },
                'enter',
                { find: /greater than or equal to 1024/i },
                { keypress: 'backspace' },
                { keypress: 'backspace' },
                { type: '128000' },
                'enter',
                { find: /less than or equal to 49151/i },
                'abort'
            )
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, true, 'websocket'])

        expect(existsSync(storagePath)).toBe(false)
    })

    it('disallows duplicated ports', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins(
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                { keypress: 'down' },
                'enter'
            ),
            Step.pubsubPort({ type: '2000' }, 'enter'),
            Step.pubsubPort(
                { type: '2000' },
                'enter',
                {
                    find: /port 2000 is taken by websocket/i
                },
                { keypress: 'backspace' },
                { type: '1' },
                'enter'
            ),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual([
            'Generate',
            false,
            'polygon',
            false,
            true,
            'websocket,mqtt',
            '2000',
            '2001',
            storagePath
        ])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { websocket, mqtt, ...otherPlugins } = config.plugins

        expect(websocket.port).toEqual(2000)

        expect(mqtt.port).toEqual(2001)

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('disallows taking default ports if they are inexplicitly used', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins(
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                { keypress: 'down' },
                'enter'
            ),
            Step.pubsubPort('enter'),
            Step.pubsubPort(
                { type: '7170' },
                'enter',
                {
                    find: /port 7170 is taken by websocket/i
                },
                { keypress: 'backspace' },
                { type: '9' },
                'enter'
            ),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual([
            'Generate',
            false,
            'polygon',
            false,
            true,
            'websocket,mqtt',
            '7170',
            '7179',
            storagePath
        ])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { websocket, mqtt, ...otherPlugins } = config.plugins

        expect(websocket).toBeEmptyObject()

        expect(mqtt.port).toEqual(7179)

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client.environment).toEqual('polygon')

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('allows to uses a custom file path for the config file', async () => {
        storagePath = path.join(tempDir, 'CUSTOMDIR', 'foobar.json')

        expect(existsSync(storagePath)).toBe(false)

        const { answers } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, false, storagePath])

        expect(existsSync(storagePath)).toBe(true)

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })
    })

    it('overwrites the existing config file if told to', async () => {
        writeFileSync(storagePath, '{"FOOBAR":true}')

        let config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            FOOBAR: true
        })

        const { answers } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter'),
            Step.overwriteStorage({ type: 'y' }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, false, storagePath, true])

        expect(existsSync(storagePath)).toBe(true)

        config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })
    })

    it('allows to change the storage location if the one they initially picked is taken', async () => {
        writeFileSync(storagePath, '{"FOOBAR":true}')

        let config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            FOOBAR: true
        })

        const otherStoragePath = path.join(tempDir, 'foobar.json')

        expect(otherStoragePath).not.toEqual(storagePath)

        const { answers } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter'),
            Step.overwriteStorage('enter'),
            Step.storage({ type: otherStoragePath }, 'enter')
        ])

        expect(answers).toEqual(['Generate', false, 'polygon', false, false, storagePath, false, otherStoragePath])

        config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            FOOBAR: true
        })

        config = JSON.parse(readFileSync(otherStoragePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })
    })

    it('creates an Amoy-flavoured config file', async () => {
        const { answers, logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network({ keypress: 'down' }, 'enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub('enter'),
            Step.pubsubPlugins(
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                { keypress: 'down' },
                { keypress: 'space' },
                'enter'
            ),
            Step.pubsubPort('enter'),
            Step.pubsubPort('enter'),
            Step.pubsubPort('enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        expect(answers).toEqual([
            'Generate',
            false,
            'polygonAmoy',
            true,
            OPERATOR_ADDRESS,
            true,
            'websocket,mqtt,http',
            '7170',
            '1883',
            '7171',
            storagePath
        ])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config).toMatchObject({
            client: {
                auth: {
                    privateKey: GENERATED_PRIVATE_KEY
                }
            }
        })

        const { websocket, mqtt, http, operator, ...otherPlugins } = config.plugins

        expect(websocket).toBeEmptyObject()

        expect(mqtt).toBeEmptyObject()

        expect(http).toBeEmptyObject()

        expect(operator).toMatchObject({
            operatorContractAddress: OPERATOR_ADDRESS
        })

        expect(otherPlugins).toBeEmptyObject()

        expect(config).not.toContainAnyKeys(['httpServer'])

        expect(config.client).not.toContainAnyKeys(['contracts', 'network'])

        expect(config.client.environment).toEqual('polygonAmoy')

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toInclude(`node address is 0x909DC59FF7A3b23126bc6F86ad44dD808fd424Dc\n`)

        expect(summary).toInclude(`generated name is Mountain Until Gun\n`)

        expectPathsEqual(extractStoragePath(summary), storagePath)
    })

    it('tells the user to fund their node address if the balance is too low', async () => {
        fakeBalance.mockImplementation(() => '0.091')

        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).toMatch(/has 0\.09 matic/i)

        expect(summary).toMatch(/you'll need to fund it with/i)
    })

    it('just tells the user their node address balance if the balance is high enough', async () => {
        fakeBalance.mockImplementation(() => '0.113')

        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).toMatch(/has 0\.11 matic/i)

        expect(summary).not.toMatch(/you'll need to fund it with/i)
    })

    it('reports balance check failures', async () => {
        jest.spyOn(JsonRpcProvider.prototype, 'getBalance').mockRejectedValue(new Error('whatever'))

        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).toMatch(/failed to fetch node's balance/i)

        expect(summary).not.toMatch(/has \d+.\d+ matic/i)

        expect(summary).not.toMatch(/you'll need to fund it with/i)
    })

    it('tells the user if their node and the operator are paired', async () => {
        fakeFetchResponseBody.mockImplementation(
            () => '{"data":{"operator":{"nodes":["0x909dc59ff7a3b23126bc6f86ad44dd808fd424dc"]}}}'
        )

        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).not.toMatch(/you will need to pair/i)

        expect(summary).toMatch(/node has been paired with your operator/i)

        expect(summary).not.toMatch(/operator could not be found on the polygon network/i)

        expect(summary).not.toMatch(/failed to fetch operator nodes/i)
    })

    it('tells the user if their node and the operator are NOT paired', async () => {
        fakeFetchResponseBody.mockImplementation(() => '{"data":{"operator":{"nodes":[]}}}')

        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).toMatch(/you will need to pair/i)

        expect(summary).not.toMatch(/node has been paired with your operator/i)

        expect(summary).not.toMatch(/operator could not be found on the polygon network/i)

        expect(summary).not.toMatch(/failed to fetch operator nodes/i)
    })

    it('tells the user that their operator could not be found in the selected network', async () => {
        fakeFetchResponseBody.mockImplementation(() => '{"data":{"operator":null}}')

        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).not.toMatch(/you will need to pair/i)

        expect(summary).not.toMatch(/node has been paired with your operator/i)

        expect(summary).toMatch(/operator could not be found on the polygon network/i)

        expect(summary).not.toMatch(/failed to fetch operator nodes/i)
    })

    it('reports pairing check failures', async () => {
        fakeFetchResponseBody.mockImplementation(() => new Error('whatever'))

        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).not.toMatch(/you will need to pair/i)

        expect(summary).not.toMatch(/node has been paired with your operator/i)

        expect(summary).not.toMatch(/operator could not be found on the polygon network/i)

        expect(summary).toMatch(/failed to fetch operator nodes/i)
    })

    it('displays proper mainnet operator url', async () => {
        const { logs } = await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards('enter'),
            Step.operator({ type: OPERATOR_ADDRESS }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const summary = logs.join('\n')

        expect(summary).toInclude(`https://streamr.network/hub/network/operators/${OPERATOR_ADDRESS.toLowerCase()}`)
    })

    it('generates an api key', async () => {
        uuid.mockImplementation(() => '5ebecbcf-5adf-4fc6-9e99-631e8e64cc9b')

        await scenario([
            Step.privateKeySource('enter'),
            Step.revealPrivateKey('enter'),
            Step.network('enter'),
            Step.rewards({ type: 'n' }, 'enter'),
            Step.pubsub({ type: 'n' }, 'enter'),
            Step.storage({ type: storagePath }, 'enter')
        ])

        const config = JSON.parse(readFileSync(storagePath).toString())

        expect(config.apiAuthentication.keys).toEqual(['NWViZWNiY2Y1YWRmNGZjNjllOTk2MzFlOGU2NGNjOWI'])
    })
})

describe('getNodeMnemonic', () => {
    it('gives a mnemonic for a private key', () => {
        expect(getNodeMnemonic('0x9a2f3b058b9b457f9f954e62ea9fd2cefe2978736ffb3ef2c1782ccfad9c411d')).toEqual(
            'Mountain Until Gun'
        )
    })
})

function act(...actions: ('abort' | 'enter' | { type: string } | { keypress: string } | { find: RegExp | string })[]) {
    return async ({ events, getScreen }: Awaited<ReturnType<typeof render>>) => {
        for (const action of actions) {
            await (async () => {
                if (action === 'abort') {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error
                    throw 'abort'
                }

                if (action === 'enter') {
                    events.keypress('enter')
                    return
                }

                if ('find' in action) {
                    await Promise.resolve()

                    const screen = getScreen()

                    const { find } = action

                    const found = find instanceof RegExp ? find.test(screen) : screen.includes(find)

                    if (!found) {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error
                        throw `Failed to find ${find} in\n${screen}`
                    }

                    return
                }

                if ('type' in action) {
                    events.type(action.type)
                    return
                }

                events.keypress(action.keypress)
            })()
        }
    }
}

const Step: Record<
    | 'privateKeySource'
    | 'revealPrivateKey'
    | 'providePrivateKey'
    | 'network'
    | 'rewards'
    | 'pubsub'
    | 'storage'
    | 'operator'
    | 'pubsubPlugins'
    | 'pubsubPort'
    | 'overwriteStorage',
    (...actions: Parameters<typeof act>) => AnswerMock
> = {
    privateKeySource: (...actions) => ({
        prompt: select,
        question: /want to generate/i,
        action: act(...actions)
    }),
    revealPrivateKey: (...actions) => ({
        prompt: confirm,
        question: /sensitive information on screen/i,
        action: act(...actions)
    }),
    providePrivateKey: (...actions) => ({
        prompt: password,
        question: /provide the private key/i,
        action: act(...actions)
    }),
    network: (...actions) => ({
        prompt: select,
        question: /which network/i,
        action: act(...actions)
    }),
    rewards: (...actions) => ({
        prompt: confirm,
        question: /participate in earning rewards/i,
        action: act(...actions)
    }),
    pubsub: (...actions) => ({
        prompt: confirm,
        question: /node for data publishing/i,
        action: act(...actions)
    }),
    storage: (...actions) => ({
        prompt: input,
        question: /path to store/i,
        action: act(...actions)
    }),
    operator: (...actions) => ({
        prompt: input,
        question: /operator address/i,
        action: act(...actions)
    }),
    pubsubPlugins: (...actions) => ({
        prompt: checkbox,
        question: /plugins to enable/i,
        action: act(...actions)
    }),
    pubsubPort: (...actions) => ({
        prompt: input,
        question: /provide a port/i,
        action: act(...actions)
    }),
    overwriteStorage: (...actions) => ({
        prompt: confirm,
        question: /do you want to overwrite/i,
        action: act(...actions)
    })
}

interface Scenario {
    answers: (string | boolean)[]
    logs: string[]
}

async function scenario(mocks: AnswerMock[]): Promise<Scenario> {
    let mocksCopy = [...mocks]

    function getActualPrompt(promptMock: jest.MockedFunction<any>) {
        const inquirer = jest.requireActual('@inquirer/prompts')

        switch (promptMock) {
            case checkbox:
                return inquirer.checkbox
            case confirm:
                return inquirer.confirm
            case input:
                return inquirer.input
            case password:
                return inquirer.password
            case select:
                return inquirer.select
            default:
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw 'Unknown prompt mock'
        }
    }

    const { answers, logs }: Scenario = {
        answers: [],
        logs: []
    }

    jest.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
        const log = args
            .join('')
            // eslint-disable-next-line no-control-regex
            .replace(/\x1B\[\d+m/g, '') // Remove colors.
            .trim()

        if (log) {
            logs.push(log)
        }
    })

    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)

    /**
     * `isTTY` is false in CI which also means `clearLine` and
     * `cursorTo` are not functions.
     */
    if (process.stdout.isTTY) {
        jest.spyOn(process.stdout, 'cursorTo').mockImplementation(() => true)

        jest.spyOn(process.stdout, 'clearLine').mockImplementation(() => true)
    }

    ;[checkbox, confirm, input, password, select].forEach((prompt) => {
        prompt.mockImplementation(async (config: any) => {
            const inq = mocksCopy.find((inq) => inq.prompt === prompt && inq.question.test(config.message))

            if (!inq) {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw `Missing mock for ${chalk.whiteBright(
                    `"${config.message}"` // eslint-disable-line @typescript-eslint/restrict-template-expressions
                )}`
            }

            mocksCopy = mocksCopy.filter((i) => i !== inq)

            const r = await render(getActualPrompt(prompt), config)

            await inq.action(r)

            const answer = await r.answer

            answers.push(Array.isArray(answer) ? answer.join() : (answer as any)) // TODO why casting?

            return answer
        })
    })

    try {
        await start()
    } catch (e) {
        if (e !== 'abort') {
            throw e
        }
    }

    return {
        answers,
        logs
    }
}
