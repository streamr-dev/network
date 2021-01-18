/* eslint-disable no-undef */
const { v4: uuidv4 } = require('uuid')

describe('StreamrClient', () => {
    const streamName = uuidv4()

    before((browser) => browser.url(`http://localhost:8880?streamName=${streamName}`))

    test('Test StreamrClient in Chrome Browser', (browser) => {
        browser
            .waitForElementVisible('body')
            .assert.titleContains('Test StreamrClient in Chrome Browser')
            .click('button[id=connect]')
            .assert.containsText('#result', 'connected')
            .click('button[id=create]')
            .assert.containsText('#result', streamName)
            .click('button[id=subscribe]')
            .assert.containsText('#result', 'subscribed')
            .click('button[id=publish]')
            .assert.containsText('#result', '[{"msg":0},{"msg":1},{"msg":2},{"msg":3},{"msg":4},{"msg":5},{"msg":6},{"msg":7},{"msg":8},{"msg":9}]')
            .pause(3000)
            .click('button[id=resend]')
            .pause(6000)
            .assert.containsText('#result', 'Resend: [{"msg":0},{"msg":1},{"msg":2},{"msg":3},{"msg":4},{"msg":5},{"msg":6},{"msg":7},{"msg":8},{"msg":9}]')
            .click('button[id=disconnect]')
            .assert.containsText('#result', 'disconnected')
    })

    after((browser) => browser.end())
})
