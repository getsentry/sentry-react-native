const packageJson: {
  name: string;
  version: string;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../../package.json');

export const PLUGIN_NAME = `${packageJson.name}/expo`;
export const PLUGIN_VERSION = packageJson.version;
