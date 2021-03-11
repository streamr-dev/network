const fs = require('fs')
// eslint-disable-next-line
const pkg = Object.assign({}, require('./package.json'))

delete pkg.scripts

try {
    fs.mkdirSync('./dist/')
} catch (err) {
    if (err.code !== 'EEXIST') {
        throw err
    }
}

fs.writeFileSync('./dist/package.json', JSON.stringify(pkg, null, 2))
