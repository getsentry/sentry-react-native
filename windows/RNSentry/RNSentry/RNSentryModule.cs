using Newtonsoft.Json.Linq;
using ReactNative.Bridge;
using ReactNative.Modules.Core;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using Sentry;

namespace RNSentry
{
    public class RNSentryModule : ReactContextNativeModuleBase
    {
        static RavenClient raven;
        
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
        public void GetMessage(ICallback callback)
        {
            var message = "Hello from Windows";
            callback.Invoke(message);
        }

        [ReactMethod]
        public void StartWithDsnString(Sentry.Dsn dsn)
        {
            RavenClient.InitializeAsync(dsn, true);
            raven = RavenClient.Instance;
        }

        [ReactMethod]
        public void Crash()
        {
            throw new Exception("TEST - RNSentry Windows Native Crash");
        }

        [ReactMethod]
        public async void CaptureEvent(JObject evt)
        {
            var e = new Exception(evt.ToString());
            await raven.CaptureExceptionAsync(e, false);
        }

        [ReactMethod]
        public async void CaptureBreadcrumb(JObject breadCrumb)
        {
            await raven.CaptureMessageAsync(breadCrumb.ToString(), false);
        }

        [ReactMethod]
        public void ClearContext()
        {
            raven.FlushAsync();
        }

        [ReactMethod]
        public void SetLogLevel(string logLevel)
        {
           
        }

        [ReactMethod]
        public void SetUser(string userId)
        {
            raven.SetUser(userId);
        }

        [ReactMethod]
        public void SetTags(Dictionary<string, string> tags)
        {
            raven.DefaultTags = tags;
        }

        [ReactMethod]
        public void AddExtra(string key, string value)
        {
            raven.DefaultExtra.Add(key, value);
        }
    }   
}
