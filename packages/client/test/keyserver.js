const express = require('express')
const cors = require('cors')
const Debug = require('debug')

const log = Debug('keyserver')
const app = express()

app.use(cors())

let c = 0
app.get('/key', (req, res) => {
    c += 1
    if (c === 1000) { c = 1 }
    const hexString = c.toString(16)
    const privkey = '0x' + hexString.padStart(64, '0')
    log('key endpoint called, returning key ' + privkey)
    res.send(privkey)
})
module.exports = app.listen(45454)
