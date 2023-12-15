import { mkdtempSync, existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { getNodeMnemonic, start } from '../../src/config/ConfigWizard'
import { render } from '@inquirer/testing'
import {
    checkbox as checkboxMock,
    confirm as confirmMock,
    input as inputMock,
    password as passwordMock,
    select as selectMock,
} from '@inquirer/prompts'

const checkbox = checkboxMock as jest.MockedFunction<any>

const confirm = confirmMock as jest.MockedFunction<any>

const input = inputMock as jest.MockedFunction<any>

const password = passwordMock as jest.MockedFunction<any>

const select = selectMock as jest.MockedFunction<any>

jest.mock('@inquirer/prompts', () => {
    const inquirer = jest.requireActual('@inquirer/prompts')

    return {
        ...inquirer,
        checkbox: jest.fn(inquirer.checkbox),
        confirm: jest.fn(inquirer.confirm),
        input: jest.fn(inquirer.input),
        password: jest.fn(inquirer.password),
        select: jest.fn(inquirer.select),
    }
})

type AnswerMock = {
    prompt: jest.MockedFunction<any>
    question: RegExp
    action: (r: Awaited<ReturnType<typeof render>>) => void
}

describe('Config wizard', () => {
    let answers: string[] = []

    let logs: string[] = []

    let tempDir = mkdtempSync(path.join(os.tmpdir(), 'test-config-wizard'))

    beforeEach(() => {
        jest.clearAllMocks()

        answers = []

        logs = []

        jest.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
            const log = args
                .join('')
                .replace(/\x1B\[\d+m/g, '')
                .trim()

            if (log) {
                logs.push(log)
            }
        })
    })

    afterAll(() => {
        jest.clearAllMocks()
    })

    const inquirer = jest.requireActual('@inquirer/prompts')

    function getActualPrompt(promptMock: jest.MockedFunction<any>) {
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
                throw 'Unknown prompt mock'
        }
    }

    function mockAnswers(mocks: AnswerMock[]) {
        void [checkbox, confirm, input, password, select].forEach(
            (prompt, i) => {
                prompt.mockImplementation(async (config: any) => {
                    const inc = mocks.find(
                        (inc) =>
                            inc.prompt === prompt &&
                            inc.question.test(config.message)
                    )

                    if (!inc) {
                        throw `Invalid mock for ${config.message}`
                    }

                    const r = await render(getActualPrompt(prompt), config)

                    inc.action(r)

                    const answer = await r.answer

                    answers.push(answer)

                    return answer
                })
            }
        )
    }

    function act(...actions: ({ type: string } | { keypress: string })[]) {
        return ({ events, ...r }: Awaited<ReturnType<typeof render>>) => {
            actions.forEach((action) => {
                if ('type' in action) {
                    return void events.type(action.type)
                }

                events.keypress(action.keypress)
            })
        }
    }

    it('creates a config file', async () => {
        const storagePath = path.join(tempDir, 'config.json')

        mockAnswers([
            {
                prompt: select,
                question: /want to generate/i,
                action: act({ keypress: 'enter' }),
            },
            {
                prompt: confirm,
                question: /sensitive information on screen/i,
                action: act({ keypress: 'enter' }),
            },
            {
                prompt: select,
                question: /which network/i,
                action: act({ keypress: 'enter' }),
            },
            {
                prompt: confirm,
                question: /participate in earning rewards/i,
                action: act({ type: 'n' }, { keypress: 'enter' }),
            },
            {
                prompt: confirm,
                question: /node for data publishing/i,
                action: act({ type: 'n' }, { keypress: 'enter' }),
            },
            {
                prompt: input,
                question: /path to store/i,
                action: act(
                    {
                        type: storagePath,
                    },
                    { keypress: 'enter' }
                ),
            },
        ])

        await start()

        expect(answers.length).toEqual(6)

        const [source, reveal, network, rewards, pubsub, filePath] = answers

        expect(source).toEqual('Generate')

        expect(reveal).toEqual(false)

        expect(network).toEqual('polygon')

        expect(rewards).toEqual(false)

        expect(pubsub).toEqual(false)

        expect(filePath).toEqual(storagePath)

        expect(existsSync(storagePath)).toBe(true)

        const summary = logs.join('\n')

        expect(summary).toMatch(/congratulations/i)

        expect(summary).toMatch(/your node address is 0x[\da-f]{40}\n/i)

        expect(summary).toMatch(/generated name is( \w+){3}\n/i)

        expect(summary).toInclude(`streamr-broker ${storagePath}\n`)
    })
})

describe('getNodeMnemonic', () => {
    it('gives a mnemonic for a private key', () => {
        expect(
            getNodeMnemonic(
                '0x9a2f3b058b9b457f9f954e62ea9fd2cefe2978736ffb3ef2c1782ccfad9c411d'
            )
        ).toEqual('Mountain Until Gun')
    })
})
