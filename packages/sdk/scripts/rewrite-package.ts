import pkg from "../package.json" assert { type: "json" }
import * as fs from "node:fs"
import path, { dirname } from "node:path"
import { fileURLToPath } from "url"

function fixPathname(pathname: string): string {
    return pathname.startsWith("./dist")
        ? `./${path.relative("./dist", pathname)}`
        : pathname.replace(/(\.m?)ts$/, '$1js')
}

const {
    main,
    types,
    module,
    browser,
    script,
    scripts: _scripts,
    private: _private,
    ...rest
} = pkg

const newPkg = {
    ...rest,
    main: fixPathname(main),
    module: fixPathname(module),
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

const dist = path.resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../dist/package.json"
)

fs.writeFileSync(dist, JSON.stringify(newPkg, null, 2))
