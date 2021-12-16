/* eslint-disable no-undef */
const { v4: uuidv4 } = require('uuid')

describe('StreamrClient Realtime', () => {
    const streamName = uuidv4()

    before((browser) => {
        // optionally forward url env vars as query params
        const url = process.env.WEBSOCKET_URL ? `&WEBSOCKET_URL=${encodeURIComponent(process.env.WEBSOCKET_URL)}` : ''
        const restUrl = process.env.REST_URL ? `&REST_URL=${encodeURIComponent(process.env.REST_URL)}` : ''
        const browserUrl = `http://localhost:8880?streamName=${streamName}${url}${restUrl}`
        // eslint-disable-next-line no-console
        console.info(browserUrl)
        return browser.url(browserUrl)
    })

    test('Test StreamrClient in Chrome Browser', (browser) => {
        browser
            .waitForElementVisible('body')
            .assert.titleContains('Test StreamrClient in Chrome Browser')
            .click('button[id=connect]')
            .waitForElementPresent('.connectResult')
            .assert.containsText('#result', 'Connected')
            .click('button[id=create]')
            .waitForElementPresent('.createResult')
            .assert.containsText('#result', streamName)
            .assert.not.elementPresent('.error')
            .click('button[id=permissions]')
            .waitForElementPresent('.permissionsResult')
            .assert.containsText('#result', '"canSubscribe":true')
            .assert.not.elementPresent('.error')
            .click('button[id=subscribe]')
            .waitForElementPresent('.subscribeResult')
            .assert.containsText('#result', 'Subscribed')
            .assert.not.elementPresent('.error')
            .click('button[id=publish]')
            .waitForElementPresent('.publishResult', 20000)
            .assert.not.elementPresent('.error')
            .waitForElementPresent('.messagesResult', 20000)
            .verify.containsText('#result', '{"msg":0}')
            .assert.not.elementPresent('.error')
            .verify.containsText('#result', '{"msg":1}')
            .verify.containsText('#result', '{"msg":2}')
            .verify.containsText('#result', '{"msg":3}')
            .verify.containsText('#result', '{"msg":4}')
            .verify.containsText('#result', '{"msg":5}')
            .verify.containsText('#result', '{"msg":6}')
            .verify.containsText('#result', '{"msg":7}')
            .verify.containsText('#result', '{"msg":8}')
            .verify.containsText('#result', '{"msg":9}')
            .assert.containsText('#result', '[{"msg":0},{"msg":1},{"msg":2},{"msg":3},{"msg":4},{"msg":5},{"msg":6},{"msg":7},{"msg":8},{"msg":9}]')
            .assert.not.elementPresent('.error')
            .click('button[id=disconnect]')
            .assert.containsText('#result', 'Disconnected')
    })

    after(async (browser) => {
        browser.getLog('browser', (logs) => {
            logs.forEach((log) => {
                // eslint-disable-next-line no-console
                const logger = console[String(log.level).toLowerCase()] || console.log
                logger('[%s]: ', log.timestamp, log.message)
            })
        })
        return browser.end()
    })
})
