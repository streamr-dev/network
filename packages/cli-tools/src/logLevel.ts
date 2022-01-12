/*
 * Minimal logging for NetworkNode and other users of Logger.ts in the network package.
 * This file needs to be imported before any of the network package classes
 * so that the environment variable is updated before any Logger instances are created.
 * The import is needed for the files where network packages are used (typically
 * the files which call createClientCommand()).
 */

process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error'