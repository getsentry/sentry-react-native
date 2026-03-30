const packageJson: {
  name: string;
  version: string;
} = require('../../package.json');

export const PLUGIN_NAME = `${packageJson.name}/expo`;
export const PLUGIN_VERSION = packageJson.version;
