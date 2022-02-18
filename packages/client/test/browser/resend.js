/* eslint-disable no-undef */
const { v4: uuidv4 } = require('uuid')
const { wait } = require('streamr-test-utils')

describe('StreamrClient Resend', () => {
    const streamName = uuidv4()

    before(async (browser) => {
        // optionally forward url env vars as query params
        const url = process.env.WEBSOCKET_URL ? `&WEBSOCKET_URL=${encodeURIComponent(process.env.WEBSOCKET_URL)}` : ''
        const restUrl = process.env.REST_URL ? `&REST_URL=${encodeURIComponent(process.env.REST_URL)}` : ''
        const browserUrl = `http://localhost:8880?streamName=${streamName}${url}${restUrl}`
        console.info(browserUrl)
        await browser.maximizeWindow()
        return browser.url(browserUrl)
    })

    test('Test StreamrClient in Chrome Browser', async (browser) => {
        browser.resizeWindow(10000, 10000)
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
            .click('button[id=store]')
            .waitForElementPresent('.storeResult')
            // TODO remove hardcoded address
            .assert.containsText('#result', '0xde1112f631486CfC759A50196853011528bC5FA0'.toLowerCase())
            .assert.not.elementPresent('.error')
            .click('button[id=subscribe]')
            .waitForElementPresent('.subscribeResult')
            .assert.containsText('#result', 'Subscribed')
            .assert.not.elementPresent('.error')

        await wait(2000)
        browser
            .waitForElementVisible('body')
            .click('button[id=publish]')
            .waitForElementPresent('.publishResult', 20000)
            .assert.not.elementPresent('.error')
            .click('button[id=resend]')
            .waitForElementPresent('.resendMessagesResult')
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
            .assert.containsText(
                '#result',
                'Resend: [{"msg":0},{"msg":1},{"msg":2},{"msg":3},{"msg":4},{"msg":5},{"msg":6},{"msg":7},{"msg":8},{"msg":9}]',
            )
    })

    after(async (browser) => {
        await browser.getLog('browser', (logs) => {
            logs.forEach((l) => {
                console.info(`[${l.level}]: ${l.message}`)
            })
        })
        await new Promise((resolve) => setTimeout(resolve, 500))
        return browser.end()
    })
})
