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
        static ReactContext reactContext;

        public RNSentryModule(ReactContext ctxt)
            : base(ctxt)
        {
            reactContext = ctxt;
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
            throw new Exception("TEST - RNSentry Windows Native Exception");
        }

        [ReactMethod]
        public void crash()
        {
            throwError();
        }

        private void addExtraContextForKey(JObject evt, string key)
        {
            if (evt.ContainsKey(key))
            {
                var value = evt.Value<JObject>(key);
                this.addExtra(key, value);
            }
        }

        [ReactMethod]
        public async void captureEvent(JObject evt)
        {
            addExtraContextForKey(evt, "stacktrace");
            addExtraContextForKey(evt, "extra");

            // set user
            if (evt.ContainsKey("user"))
            {
                var user = evt.Value<JObject>("user");
                this.setUser(user);
            }

            if (evt.ContainsKey("logger"))
            {
                raven.Logger = evt.Value<string>("logger");
            }

            // capture exception
            var msg = evt.Value<string>("message") ?? "";
            var e = new Exception(msg);
            await raven.CaptureExceptionAsync(e, false);

            RNSentryEventEmitter.sendEvent(reactContext, RNSentryEventEmitter.SENTRY_EVENT_STORED, new Object());

        }

        [ReactMethod]
        public void captureBreadcrumb(JObject breadCrumb)
        {
            // hacking extra context to store breadcrumbs
            this.addExtra($"breadcrumb_{Guid.NewGuid()}", breadCrumb.ToString());
        }

        [ReactMethod]
        public void clearContext()
        {
            raven.FlushAsync();
            raven.DefaultExtra = new Dictionary<string, object>();
            raven.DefaultTags = null;
        }

        [ReactMethod]
        public void setLogLevel(string logLevel)
        {
            // TODO
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
