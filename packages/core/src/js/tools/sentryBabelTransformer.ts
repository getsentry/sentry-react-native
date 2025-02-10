import { enableLogger } from './enableLogger';
import { createSentryBabelTransformer } from './sentryBabelTransformerUtils';

enableLogger();

const sentryBabelTransformer = createSentryBabelTransformer();
// With TS set to `commonjs` this will be translated to `module.exports = sentryBabelTransformer;`
// which will be correctly picked up by Metro
export = sentryBabelTransformer;
