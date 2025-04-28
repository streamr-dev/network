import { runCommand } from './utils'

describe('identity', () => {

    describe('whoami', () => {
        it('prints out an address', async () => {
            const outputLines = await runCommand('identity whoami')
            expect(outputLines.length).toBe(1)
            expect(outputLines[0]).toMatch(/^0x[0-9a-f]{40}$/)
        })
    })

    describe('generate', () => {
        it('prints out an address and a private key', async () => {
            const outputLines = await runCommand('identity generate --key-type ECDSA_SECP256K1_EVM', {
                // prevents --env from being passed to the command
                devEnvironment: false 
            })
            // JSON output
            expect(outputLines.length).toBe(4)
            // outputLines[0] is {
            expect(outputLines[1]).toMatch(/0x[0-9a-f]{40}/) // address
            expect(outputLines[2]).toMatch(/[0-9a-f]{64}/)   // private key
            // outputLines[3] is }
        })
    })

})
