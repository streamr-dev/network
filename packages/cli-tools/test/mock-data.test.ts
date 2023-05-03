import 'jest-extended'
import { collect, startCommand } from './utils'

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

})
