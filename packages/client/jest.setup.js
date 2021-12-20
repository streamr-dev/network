import 'reflect-metadata'
import { GitRevisionPlugin } from 'git-revision-webpack-plugin'
import express from 'express'
import { Debug } from './src/utils/log'

const log = Debug('jest global setup')

const pkg = require('./package.json')

export default async () => {
    const app = express()
    let c = 0
    app.get('/key', (_req, res) => {
        c += 1
        if (c === 1000) { c = 1 }
        const hexString = c.toString(16)
        const privkey = '0x' + hexString.padStart(64, '0')
        log('key endpoint called, returning key ' + privkey)
        res.send(privkey)
    })
    app.listen(45454)

    // eslint-disable-next-line
    require('reflect-metadata')
    if (!process.env.GIT_VERSION) {
        const gitRevisionPlugin = new GitRevisionPlugin()
        const [GIT_VERSION, GIT_COMMITHASH, GIT_BRANCH] = await Promise.all([
            gitRevisionPlugin.version(),
            gitRevisionPlugin.commithash(),
            gitRevisionPlugin.branch(),
        ])
        Object.assign(process.env, {
            version: pkg.version,
            GIT_VERSION,
            GIT_COMMITHASH,
            GIT_BRANCH,
        }, process.env) // don't override whatever is in process.env
    }
}
