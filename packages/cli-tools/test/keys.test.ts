import { runCommand } from './utils'

describe('keys', () => {

    describe('whoami', () => {
        it('prints out an address', async () => {
            const outputLines = await runCommand('keys whoami')
            expect(outputLines.length).toBe(1)
            expect(outputLines[0]).toMatch(/^0x[0-9a-f]{40}$/)
        })
    })

    describe('generate', () => {
        it('prints out an address and a private key', async () => {
            const outputLines = await runCommand('keys generate --key-type evm_secp256k1', {
                // prevents --env from being passed to the command
                devEnvironment: false 
            })
            expect(outputLines.length).toBe(3)
            expect(outputLines[0]).toMatch(/0x[0-9a-f]{40}$/)
            expect(outputLines[2]).toMatch(/[0-9a-f]{64}$/)
        })
    })

})
