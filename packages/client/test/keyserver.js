const express = require('express')
const cors = require('cors')
const Debug = require('debug')

const log = Debug('keyserver')
const app = express()

app.use(cors())

// try avoid sequential tests starting from same address
let c = (Math.round((Math.random() * 1000)) % 1000)
app.get('/key', (req, res) => {
    c = ((c + 1) % 1000)
    const hexString = c.toString(16)
    const privkey = '0x' + hexString.padStart(64, '0')
    log('key endpoint called, returning key ' + privkey)
    res.send(privkey)
})
module.exports = app.listen(45454)
