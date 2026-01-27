import { execSync } from 'child_process'
import pkg from './package.json'

const execGitCommand = (command: string): string => {
    try {
        return execSync(command, { encoding: 'utf8' }).trim()
    } catch {
        return ''
    }
}

export default async function setup(): Promise<void> {
    if (process.env.GIT_VERSION) {
        return
    }

    const GIT_VERSION = execGitCommand('git describe --always --tags')
    const GIT_COMMITHASH = execGitCommand('git rev-parse HEAD')
    const GIT_BRANCH = execGitCommand('git rev-parse --abbrev-ref HEAD')

    Object.assign(process.env, {
        version: pkg.version,
        GIT_VERSION,
        GIT_COMMITHASH,
        GIT_BRANCH,
    }, process.env) // don't override whatever is in process.env
}
