using ReactNative.Bridge;
using ReactNative.Modules.Core;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace RNSentry
{
    class RNSentryEventEmitter : ReactContextNativeModuleBase
    {

        public const string SENTRY_EVENT_SENT_SUCCESSFULLY = "Sentry/eventSentSuccessfully";
        public const string SENTRY_EVENT_STORED = "Sentry/eventStored";

        public override string Name => "RNSentryEventEmitter";

        public RNSentryEventEmitter(ReactContext reactContext)
            : base(reactContext)
        {

        }

        public override IReadOnlyDictionary<string, object> Constants
        {
            get
            {
                return new Dictionary<string, object>
                {
                    { "EVENT_SENT_SUCCESSFULLY", SENTRY_EVENT_SENT_SUCCESSFULLY },
                    { "EVENT_STORED", SENTRY_EVENT_STORED },
                };
            }
        }

        public static void sendEvent(ReactContext reactContext, string eventName, object data)
        {
            reactContext.GetJavaScriptModule<RCTDeviceEventEmitter>()
                .emit(eventName, data);
        }
    }
}
