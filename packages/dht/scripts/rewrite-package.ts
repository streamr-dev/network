import pkg from '../package.json' assert { type: 'json' }
import * as fs from 'node:fs'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'url'

function fixPathname(pathname: string): string {
    return pathname.startsWith('./dist')
        ? `./${path.relative('./dist', pathname)}`
        : pathname
}

const { main, types, browser, scripts: _scripts, ...rest } = pkg

const newPkg = {
    ...rest,
    main: fixPathname(main),
    types: fixPathname(types),
    browser: Object.entries(browser).reduce(
        (memo, [fromPathname, toPathname]) => ({
            ...memo,
            [fixPathname(fromPathname)]:
                typeof toPathname === 'string'
                    ? fixPathname(toPathname)
                    : toPathname,
        }),
        {}
    ),
}

const dist = path.resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/package.json'
)

fs.writeFileSync(dist, JSON.stringify(newPkg, null, 2))
