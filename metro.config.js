// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Web app: sql.js contains a Node-only code path that requires these modules.
// They are never used in the browser, so resolve them to an empty module there.
const NODE_ONLY = new Set(['fs', 'node:fs', 'path', 'node:path', 'crypto', 'node:crypto']);
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && NODE_ONLY.has(moduleName)) return { type: 'empty' };
  return defaultResolve ? defaultResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
