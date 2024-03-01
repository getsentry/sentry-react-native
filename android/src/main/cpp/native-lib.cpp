#include <jni.h>
#include <string>

extern "C" JNIEXPORT jstring JNICALL
Java_io_sentry_react_RNSentryModuleImpl_stringFromJNI(
        JNIEnv* env,
        jobject /* this */) {
    std::string hello = "Hello from C++";
    return env->NewStringUTF(hello.c_str());
}

extern "C" JNIEXPORT jdouble JNICALL
Java_io_sentry_react_RNSentryModuleImpl_jsPerformanceNow(
        JNIEnv* env,
        jobject /* this */) {
    auto time = std::chrono::steady_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(
            time.time_since_epoch())
            .count();

    constexpr double NANOSECONDS_IN_MILLISECOND = 1000000.0;
    return duration / NANOSECONDS_IN_MILLISECOND;
}

