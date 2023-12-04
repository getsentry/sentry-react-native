#include "NativeSampleModule.h"

namespace facebook::react
{

  NativeSampleModule::NativeSampleModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeSampleModuleCxxSpec(std::move(jsInvoker)) {}

  void NativeSampleModule::crash(jsi::Runtime &rt)
  {
    throw std::runtime_error("Error from native cxx module");
  }

} // namespace facebook::react
