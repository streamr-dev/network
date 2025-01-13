import { collect } from '@streamr/utils'
import 'jest-extended'
import { startCommand } from './utils'

describe('mock-data', () => {
    it('generate', async () => {
        const abortController = new AbortController()
        const outputIterable = startCommand('mock-data generate', {
            abortSignal: abortController.signal,
            devEnvironment: false
        })
        const firstLine = (await collect(outputIterable, 1))[0]
        abortController.abort()
        const json = JSON.parse(firstLine)
        expect(json).toBeObject()
    })

    it('generate binary', async () => {
        const abortController = new AbortController()
        const outputIterable = startCommand('mock-data generate --binary --min-length 32 --max-length 64', {
            abortSignal: abortController.signal,
            devEnvironment: false
        })
        const firstLine = (await collect(outputIterable, 1))[0]
        abortController.abort()
        expect(firstLine).toMatch(/^[0-9a-f]+$/)
        const lengthInBytes = firstLine.length / 2
        expect(lengthInBytes).toBeGreaterThanOrEqual(32)
        expect(lengthInBytes).toBeLessThanOrEqual(64)
    })
})
