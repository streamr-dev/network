const Debug = require('debug')
const GitRevisionPlugin = require('git-revision-webpack-plugin')

if (process.env.DEBUG_CONSOLE) {
    // Use debug as console log
    // This prevents jest messing with console output
    // Ensuring debug messages are printed alongside console messages, in the correct order
    console.log = Debug('Streamr::CONSOLE') // eslint-disable-line no-console
}

console.log(process.env)
module.exports = async () => {
    if (!process.env.GIT_VERSION) {
        const gitRevisionPlugin = new GitRevisionPlugin()
        Object.assign(process.env, {
            GIT_VERSION: await gitRevisionPlugin.version(),
            GIT_COMMITHASH: await gitRevisionPlugin.commithash(),
            GIT_BRANCH: await gitRevisionPlugin.branch(),
        }, process.env)
    }
}
