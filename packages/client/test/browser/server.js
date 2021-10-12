const path = require('path')

const express = require('express')

const app = express()

// viewed at http://localhost:8880
app.use('/static', express.static(path.join(__dirname, '/../../dist')))

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'browser.html'))
})

const server = app.listen(8880, () => {
    console.info('Listening: ', server.address())
})
