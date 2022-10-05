cmake_minimum_required(VERSION 3.13)

# Define the library name here.
project(samplenewarchitecture_appmodules)

# This file includes all the necessary to let you build your application with the New Architecture.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

add_subdirectory(${NODE_MODULES_DIR}/../../android/build/generated/source/codegen/jni/ rnsentry_build)

# sample-new-architecture needs to link against the rn_sentry turbo module
target_link_libraries(${CMAKE_PROJECT_NAME}
        react_codegen_RNSentrySpec)
