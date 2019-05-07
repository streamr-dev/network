// From: https://stackoverflow.com/questions/10726909/random-alpha-numeric-string-in-javascript
function randomString(length, chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    let result = ''
    for (let i = length; i > 0; --i) {
        result += chars[Math.floor(Math.random() * chars.length)]
    }
    return result
}

function genArray(size, elementFn) {
    const arr = []
    for (let i=0; i < size; ++i) {
        arr.push(elementFn())
    }
    return arr
}

module.exports = (rate) => {
    setInterval(() => {
        console.info(JSON.stringify({
            someText: randomString(64),
            aNumber: Math.random() * 10000,
            bNumber: Math.random(),
            yesOrNo: Math.random() > 0.5,
            arrayOfStrings: genArray(Math.floor(Math.random() * 20), () => randomString(8)),
            arrayOfIntegers: genArray(Math.floor(Math.random() * 10), () => Math.floor(Math.random() * 100))

        }))
    }, rate)
}
