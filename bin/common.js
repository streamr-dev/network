function envOptions(program) {
    return program
        .option('--dev', 'use pre-defined development environment')
        .option('--stg', 'use pre-defined staging environment')
        .option('--ws-url <url>', 'alternative websocket url to use')
        .option('--http-url <url>', 'alternative http url to use')
}

function authOptions(program) {
    return program
        .option('--private-key <key>', 'use an Ethereum private key to authenticate')
        .option('--api-key <key>', 'use an API key to authenticate (deprecated)')
}

function exitWithHelpIfArgsNotBetween(program, min, max) {
    if (program.args.length < min || program.args.length > max) {
        program.help()
    }
}

function formStreamrOptionsWithEnv({ dev, stg, wsUrl, httpUrl, privateKey, apiKey }) {
    const options = {}

    if (dev && stg) {
        console.error('flags --dev and --stg cannot be enabled at the same time')
        process.exit(1)
    }

    if (dev) {
        options.url = 'ws://localhost/api/v1/ws'
        options.restUrl = 'http://localhost/api/v1'
    } else if (stg) {
        options.url = 'wss://staging.streamr.com/api/v1/ws'
        options.restUrl = 'https://staging.streamr.com/api/v1/'
    }

    if (wsUrl) {
        options.url = wsUrl
    }
    if (httpUrl) {
        options.restUrl = httpUrl
    }

    if (privateKey && apiKey) {
        console.error('flags --privateKey and --apiKey cannot be used at the same time')
        process.exit(1)
    }

    if (privateKey) {
        options.auth = {
            privateKey
        }
    } else if (apiKey) {
        options.auth = {
            apiKey
        }
    }

    return options
}

function createFnParseInt(name) {
    return (str) => {
        const n = parseInt(str, 10)
        if (isNaN(n)) {
            console.error(`${name} must be an integer (was "${str}")`)
            process.exit(1)
        }
        return n
    }
}

module.exports = {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
    createFnParseInt
}
