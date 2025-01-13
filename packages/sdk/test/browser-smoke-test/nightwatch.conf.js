// eslint-disable-next-line @typescript-eslint/no-require-imports
const chromedriver = require('chromedriver')
module.exports = {
    live_output: true,
    webdriver: {
        start_process: true,
        server_path: chromedriver.path,
        cli_args: ['--verbose'],
        port: 9515
    },
    globals: {
        untilTimeout: 15000
    },
    test_settings: {
        default: {
            desiredCapabilities: {
                browserName: 'chrome',
                loggingPrefs: { browser: 'DEBUG' },
                chromeOptions: {
                    args: ['--no-sandbox', '--headless', '--disable-dev-shm-usage']
                }
            }
        }
    }
}
