const puppeteer = require("puppeteer")

describe('foo', () => {
    let page
    beforeEach(async () => {
        const browser = await puppeteer.launch()
        page = await browser.newPage()
        await page.goto('http://localhost:4444')
    })
    test('should return bar', async () => {
        const foo = await page.evaluate(() => {
            console.log('foo')
            return foo()
        })
        expect(foo).toBe('bar')
    })
})
