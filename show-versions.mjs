#!/usr/bin/env npx zx

import { join } from 'path'
import semver from 'semver'
import Table from 'cli-table'
$.verbose = false

const packages = JSON.parse(await $`lerna list --all --json --loglevel=silent --toposort`)
const pkgNames = new Set(packages.map(({ name }) => name))
const pkgJSONs = packages.reduce((obj, info) => {
    const pkgJSONPath = join(info.location, 'package.json')
    obj[info.name] = require(pkgJSONPath)
    return obj
}, {})

const legend = `${chalk.green('✓')}${chalk.white(' = Symlink')}`

// package names are column names
const table = new Table({ head: [legend, 'Local Version', ...pkgNames].map((s) => chalk.white(s)) });


const warnings = []
packages.forEach((pkg) => {
    const pkgJSON = pkgJSONs[pkg.name]
    // all dependencies of pkg
    const deps = Object.entries({ ...pkgJSON.dependencies, ...pkgJSON.devDependencies })
        .filter(([name]) => pkgNames.has(name))

    // create output for each column
    const depsOutput = [...pkgNames].map((colName) => {
        // find deps for this column
        const dep = deps.find(([name]) => name === colName)
        if (!dep) {
            // pkg.name does not use pkg matching this column
            return ''
        }

        const [ name, semverRange ] = dep
        const { version } = pkgJSONs[name]
        const shouldLink = semver.satisfies(version, semverRange)
        if (!shouldLink) {
            warnings.push(`${chalk.white(pkg.name)} depends on non-linked ${chalk.white(name)}: ${chalk.yellow(semverRange)}`)
        }
        return `${shouldLink ? `${chalk.green('✓')} ${semverRange}`: chalk.yellow(semverRange)}`
    })

    table.push({
        [chalk.white(pkg.name)]: [chalk.grey(pkg.version), ...depsOutput]
    })
})

console.log(table.toString())
if (warnings.length) {
    console.log(`\n${chalk.yellow('Warnings: ')}\n`)
    console.log(warnings.join('\n'))
}
