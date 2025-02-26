/**
 * This script moves the package.json file into the dist folder while adjusting
 * relative pathnames for exports. Since the compiled output is inside "dist",
 * but the original package.json references paths as if it's in the root, we
 * need to strip "dist" from all export fields (main, types, …).
 *
 * This ensures that consumers of the package import the correct files
 * without referencing "dist" in their paths, maintaining proper module resolution.
 */

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
