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
                {
                    { "nativeClientAvailable", true },
                };
            }
        }

        [ReactMethod]
        public void startWithDsnString(string dsn, JObject options)
        {
            RavenClient.InitializeAsync(new Sentry.Dsn(dsn), true);

            raven = RavenClient.Instance;
            raven.DefaultExtra = new Dictionary<string, object>();
        }

        private void throwError()
        {
            throw new Exception("TEST - RNSentry Windows Native Crash");
        }

        [ReactMethod]
        public void crash()
        {
            throwError();
        }

        [ReactMethod]
        public async void captureEvent(JObject evt)
        {
            // var e = new Exception(evt.ToString());
            var e = new Exception("TEST - RNSentry Windows Native Crash");
            await raven.CaptureExceptionAsync(e, false);
        }

        [ReactMethod]
        public void captureBreadcrumb(JObject breadCrumb)
        {
            this.addExtra($"breadcrumb_{Guid.NewGuid()}", breadCrumb.ToString());
        }

        [ReactMethod]
        public void clearContext()
        {
            raven.FlushAsync();
        }

        [ReactMethod]
        public void setLogLevel(string logLevel)
        {

        }

        [ReactMethod]
        public void setUser(JObject user)
        {
            var userId = user.Value<string>("id") ?? user.Value<string>("userId") ?? "";
            var username = user.Value<string>("username") ?? "";
            var email = user.Value<string>("email") ?? "";
            raven.SetUser(userId, username, email);
        }

        [ReactMethod]
        public void setTags(Dictionary<string, string> tags)
        {
            raven.DefaultTags = tags;
        }

        [ReactMethod]
        public void addExtra(string key, object value)
        {
            raven.DefaultExtra.Add(key, value);
        }
    }
}
