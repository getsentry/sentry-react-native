using Newtonsoft.Json;
using ReactNative.Bridge;
using ReactNative.Modules.Core;
using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace RNSentry
{
    public class RNSentryModule : ReactContextNativeModuleBase
    {
        public RNSentryModule(ReactContext reactContext)
            : base(reactContext)
        {
        }

        public override string Name => "RNSentry";

        public override IReadOnlyDictionary<string, object> Constants
        {
            get
            {
                return new Dictionary<string, object>
                { };
            }
        }

        [ReactMethod]
        public void getMessage(ICallback callback)
        {
            var message = "Hello from Windows";
            callback.Invoke(message);
        }
    }
}
