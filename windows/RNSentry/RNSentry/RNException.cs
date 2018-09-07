using System;

namespace RNSentry
{
    class RNException : Exception
    {
        private string _StackTrace;

        public RNException(string message, string stackTrace) : base(message)
        {
            this._StackTrace = stackTrace;
        }


        public override string StackTrace
        {
            get
            {
                return this._StackTrace;
            }
        }
    }
}
