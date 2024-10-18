import { runCommand } from './utils'

describe('env command line option', () => {

    it('invalid value', async () => {
        const outputLines = await runCommand('stream show foobar --env invalid-environment', {
            devEnvironment: false
        })
        expect(outputLines).toHaveLength(1)
        expect(outputLines[0]).toEqual('env must be one of: "polygon", "polygonAmoy", "dev2"')
    }, 60 * 1000)
})
