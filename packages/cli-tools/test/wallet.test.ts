import { runCommand } from './utils'

describe('wallet', () => {
    it('whoami', async () => {
        const outputLines = await runCommand('wallet whoami')
        expect(outputLines.length).toBe(1)
        expect(outputLines[0]).toMatch(/^0x[0-9a-f]{40}$/)
    })
})
