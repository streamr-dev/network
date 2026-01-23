import {
    Operator as OperatorContract,
    Sponsorship as SponsorshipContract
} from '@streamr/network-contracts'
import { _operatorContractUtils, type DeployOperatorContractOpts, type DeploySponsorshipContractOpts, type Stream, StreamrClient } from '@streamr/sdk'
import { collect, until } from '@streamr/utils'
import { spawn } from 'child_process'
import merge2 from 'merge2'
import { Readable } from 'stream'

export const DOCKER_DEV_STORAGE_NODE = '0xde1112f631486CfC759A50196853011528bC5FA0'

export interface StartCommandOptions {
    privateKey?: string
    devEnvironment?: boolean
    inputLines?: string[]
    inputBinary?: Uint8Array
    abortSignal?: AbortSignal
}

export const runCommand = async (commandLine: string, opts?: StartCommandOptions): Promise<string[]> => {
    const output = startCommand(commandLine, opts)
    return await collect(output.asLines())
}

class CommandOutput {

    stdout: Readable
    stderr: Readable

    constructor(stdout: Readable, stderr: Readable) {
        this.stdout = stdout
        this.stderr = stderr
    }

    async* asLines(): AsyncGenerator<string> {
        const outputs = merge2(this.stdout, this.stderr)
        yield* lines(outputs[Symbol.asyncIterator]())
    }
}

export function startCommand(commandLine: string, opts?: StartCommandOptions): CommandOutput {
    // TODO: --no-deprecation needed to get around deprecation warning for "punycode" in Node.js 22, remove when warning has gone away (NET-1409)
    const args: string[] = ['--no-deprecation', 'dist/bin/streamr.js']
    args.push(...commandLine.split(' '))
    if (opts?.privateKey !== undefined) {
        args.push('--private-key', opts.privateKey)
    }
    if (opts?.devEnvironment !== false) {
        args.push('--env', 'dev2')
    }
    const executable = spawn(`node`, args, {
        signal: opts?.abortSignal,
        env: {
            PATH: process.env.PATH,
            STREAMR_DOCKER_DEV_HOST: process.env.STREAMR_DOCKER_DEV_HOST
        }
    })
    executable.on('error', (err: any) => {
        // expected error when AbortSignal#abort is called
        if (err.code !== 'ABORT_ERR') {
            console.error(err)
        }
    })
    if (opts?.inputLines !== undefined) {
        setImmediate(() => {
            executable.stdin.write(opts.inputLines!.join('\n') + '\n')
        })
    }
    if (opts?.inputBinary !== undefined) {
        setImmediate(() => {
            executable.stdin.write(opts.inputBinary)
        })
    }
    return new CommandOutput(executable.stdout, executable.stderr)
}

async function* lines(src: AsyncIterable<Buffer>): AsyncGenerator<string, any, any> {
    let buffer = ''
    for await (const chunk of src) {
        buffer += chunk.toString()
        while (true) {
            const delimeterPos = buffer.indexOf('\n')
            if (delimeterPos === -1) {
                break
            }
            const line = buffer.substring(0, delimeterPos)
            yield line
            buffer = buffer.substring(delimeterPos + 1)
        }
    }
    if (buffer !== '') {
        yield buffer
    }
}

export const createTestClient = (privateKey?: string): StreamrClient => {
    return new StreamrClient({
        environment: 'dev2',
        auth: (privateKey !== undefined) ? { privateKey } : undefined
    })
}

export const waitForTheGraphToHaveIndexed = async (stream: Stream, client: StreamrClient): Promise<void> => {
    await until(async () => {
        // eslint-disable-next-line no-underscore-dangle
        for await (const _msg of client.searchStreams(stream.id, undefined)) {
            return true
        }
        return false
    }, 15 * 1000, 600)
}

export const deployTestOperatorContract = async (opts: Omit<DeployOperatorContractOpts, 'environmentId'>): Promise<OperatorContract> => {
    return _operatorContractUtils.deployOperatorContract({ ...opts, 'environmentId': 'dev2' })
}

export const deployTestSponsorshipContract = async (opts: Omit<DeploySponsorshipContractOpts, 'environmentId'>): Promise<SponsorshipContract> => {
    return _operatorContractUtils.deploySponsorshipContract({ ...opts, 'environmentId': 'dev2' })
}

export const nextValue = async <T>(source: AsyncIterator<T>): Promise<T | undefined> => {
    const item = source.next()
    return (await item).value
}
