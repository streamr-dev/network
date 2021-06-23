module.exports = {
    preset: "./jest-puppeteer-ts.preset.js",
    globals: {
        PATH: "http://localhost:4444"
    },
    testMatch: [
        "**/test/**/*.test.js"
    ]
}