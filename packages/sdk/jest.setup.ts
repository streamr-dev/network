// eslint-disable-next-line import/no-extraneous-dependencies
import { GitRevisionPlugin } from 'git-revision-webpack-plugin'
import 'reflect-metadata'
import pkg from './package.json'

export default async function setup(): Promise<void> {
    if (process.env.GIT_VERSION) {
        return
    }

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
