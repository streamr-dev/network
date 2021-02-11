import GitRevisionPlugin from 'git-revision-webpack-plugin'
import Debug from 'debug'

const pkg = require('./package.json')

export default async () => {
    if (process.env.DEBUG_CONSOLE) {
        // Use debug as console log
        // This prevents jest messing with console output
        // Ensuring debug messages are printed alongside console messages, in the correct order
        console.log = Debug('Streamr::CONSOLE') // eslint-disable-line no-console
    }

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
