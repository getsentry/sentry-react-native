declare module 'metro/src/DeltaBundler/Serializers/baseJSBundle' {
  type Bundle = {
    modules: ModuleMap,
    post: string,
    pre: string,
  };

  const baseJSBundle: (
    entryPoint: string,
    preModules: ReadonlyArray<Module>,
    graph: ReadOnlyGraph,
    options: SerializerOptions,
  ) => Bundle;
  export = baseJSBundle;
};

declare module 'metro/src/lib/bundleToString' {
  type Bundle = {
    modules: ModuleMap,
    post: string,
    pre: string,
  };

  const baseJSBundle: (bundle: Bundle) => {
    code: string,
    metadata: BundleMetadata,
  };

  export = baseJSBundle;
};

declare module 'metro/src/lib/countLines' {
  const countLines: (code: string) => number;
  export = countLines;
}

declare module 'metro/src/DeltaBundler/Serializers/sourceMapString' {
  import type { MixedOutput, Module } from 'metro';

  const sourceMapString: (bundle: Module<MixedOutput>[], options: {
    excludeSource?: boolean,
    processModuleFilter?: (module: Module<MixedOutput>) => boolean,
    shouldAddToIgnoreList?: (module: Module<MixedOutput>) => boolean,
  }) => string;
  export = sourceMapString;
}
