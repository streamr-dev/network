/**
 * This script moves the package.json file into the dist folder while adjusting
 * relative pathnames for exports. Since the compiled output is inside "dist",
 * but the original package.json references paths as if it's in the root, we
 * need to strip "dist" from all export fields (main, types, …).
 *
 * This ensures that consumers of the package import the correct files
 * without referencing "dist" in their paths, maintaining proper module resolution.
 */

import pkg from '../package.json'
import * as fs from 'node:fs'
import path from 'node:path'

function fixPathname(pathname: string): string {
    return pathname.startsWith('./dist')
        ? `./${path.relative('./dist', pathname)}`
        : pathname.replace(/(\.m?)ts$/, '$1js')
}

const {
    main,
    types,
    module: module_,
    browser,
    script,
    scripts: _scripts,
    private: _private,
    ...rest
} = pkg

const newPkg = {
    ...rest,
    main: fixPathname(main),
    module: fixPathname(module_),
    types: fixPathname(types),
    browser: Object.entries(browser).reduce(
        (memo, [fromPathname, toPathname]) => ({
            ...memo,
            [fixPathname(fromPathname)]:
                toPathname != null ? fixPathname(toPathname) : toPathname,
        }),
        {}
    ),
    script: fixPathname(script),
}

const dist = path.resolve(__dirname, '../dist/package.json')

fs.writeFileSync(dist, JSON.stringify(newPkg, null, 2))
