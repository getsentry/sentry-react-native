declare module 'metro/src/DeltaBundler/Serializers/baseJSBundle' {
  const baseJSBundle: (
    entryPoint: string,
    preModules: ReadonlyArray<Module>,
    graph: ReadOnlyGraph,
    options: SerializerOptions,
  ) => {
    modules: [number, string][],
    post: string,
    pre: string,
  };
  export = baseJSBundle;
};

declare module 'metro/src/lib/bundleToString' {
  const baseJSBundle: (
    bundle: {
      modules: [number, string][],
      post: string,
      pre: string,
    },
  ) => {
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
