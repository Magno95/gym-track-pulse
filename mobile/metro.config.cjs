const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
// Shared domain modules contain no React UI. Keep normal resolution for Expo's
// nested packages, and use the native app's node_modules as the explicit fallback.
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
