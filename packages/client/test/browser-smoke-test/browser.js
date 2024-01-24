/* eslint-disable no-undef, @typescript-eslint/no-require-imports */

describe('StreamrClient', () => {

    before(async (browser) => {
        const browserUrl = 'http://localhost:8880'
        return browser.url(browserUrl)
    })

    test('Test StreamrClient in Chrome Browser', (browser) => {
        // Make viewport huge to ensure that all buttons are inside it
        browser.resizeWindow(1000, 1000)
        browser
            .waitForElementVisible('body')
            .assert.titleContains('Smoke Test')
            .waitUntil( () => {
                const counter = browser.execute(() => {
                    return publishMsgCounter
                })
                return counter > 30
            })
            .click('#executeResend')
            .waitUntil( () => {
                const counter = browser.execute(() => {
                    return resendMsgCounter
                })
                return counter > 30
            })
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
