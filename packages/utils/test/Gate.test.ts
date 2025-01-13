import { Gate } from '../src/Gate'
import { wait } from '../src/wait'
import { withTimeout } from '../src/withTimeout'

describe('Gate', () => {
    it('happy path', async () => {
        const gate = new Gate(false)
        expect(gate.isOpen()).toBe(false)
        await expect(() => withTimeout(gate.waitUntilOpen(), 100)).rejects.toThrow('timed out')
        await Promise.all([
            (async () => {
                await wait(50)
                gate.open()
            })(),
            withTimeout(gate.waitUntilOpen(), 100)
        ])
        expect(gate.isOpen()).toBe(true)
        gate.close()
        expect(gate.isOpen()).toBe(false)
    })
})
