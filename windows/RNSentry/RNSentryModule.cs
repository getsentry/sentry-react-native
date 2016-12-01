using ReactNative.Bridge;
using System;
using System.Collections.Generic;
using Windows.ApplicationModel.Core;
using Windows.UI.Core;

namespace Com.Reactlibrary.RNSentry
{
    /// <summary>
    /// A module that allows JS to share data.
    /// </summary>
    class RNSentryModule : NativeModuleBase
    {
        /// <summary>
        /// Instantiates the <see cref="RNSentryModule"/>.
        /// </summary>
        internal RNSentryModule()
        {

        }

        /// <summary>
        /// The name of the native module.
        /// </summary>
        public override string Name
        {
            get
            {
                return "RNSentry";
            }
        }
    }
}
