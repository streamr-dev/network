/*
 * This file injects custom matcher types into Jest.
 *
 * The actual type declarations are in "./dist/src/customMatchers.d.ts", and this file serves
 * as an alias. In a dependent library the type information is typically injected by adding
 * an import statement to test/types/global.d.ts. Since this file is listed in package.json's
 * "files" section, we can import the types like this:
 * import '@streamr/test-utils/customMatchers'
 */

/// <reference path="./dist/src/customMatchers.d.ts" />
