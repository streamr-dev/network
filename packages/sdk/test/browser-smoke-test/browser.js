/* eslint-disable no-undef */

const TARGET_SUBSCRIBE_MSG_COUNT = 50
const RESEND_SUBSCRIBE_MSG_COUNT = TARGET_SUBSCRIBE_MSG_COUNT - 10 // some may not have landed in storage yet

describe('StreamrClient', () => {
    before((browser) => {
        const browserUrl = 'http://localhost:8880'
        return browser.url(browserUrl)
    })

    test('Smoke test StreamrClient in Chrome Browser', async (browser) => {
        await browser
            .waitForElementVisible('body')
            .assert.titleContains('Smoke Test')
            .waitUntil(async () => {
                const counter = await browser.execute(() => {
                    return subscribeMsgCounter
                })
                return counter >= TARGET_SUBSCRIBE_MSG_COUNT
            })
            .click('#executeResend')
            .waitUntil(async () => {
                const counter = await browser.execute(() => {
                    return resendMsgCounter
                })
                return counter >= RESEND_SUBSCRIBE_MSG_COUNT
            })
    })

    after(async (browser) => {
        await browser.getLog('browser', (logs) => {
            logs.forEach((l) => {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                console.info(`[${l.level}]: ${l.message}`)
            })
        })
        await new Promise((resolve) => setTimeout(resolve, 500))
        return browser.end()
    })
})
