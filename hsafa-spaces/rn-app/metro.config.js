const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.unstable_enableSymlinks = true;

// Force single copies of react and react-native — prevents duplicate module errors
// in pnpm workspaces where linked packages have their own node_modules/react
const DEDUPE = ['react', 'react-native', 'react/jsx-runtime', 'react/jsx-dev-runtime'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (DEDUPE.includes(moduleName)) {
    return { type: 'sourceFile', filePath: require.resolve(moduleName, { paths: [projectRoot] }) };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
