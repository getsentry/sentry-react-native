// The plugin source file has to be present in the repository, otherwise it would have to be install
// before running yarn install by the user/ci...
// https://github.com/mhassan1/yarn-plugin-after-install/blob/a82850b5cf4a8b76cefc244c803e38b3b55514dc/bundles/%40yarnpkg/plugin-after-install.js

/* eslint-disable */
//prettier-ignore
module.exports = {
  name: "@yarnpkg/plugin-after-install",
  factory: function (require) {
  "use strict";var plugin=(()=>{var s=Object.defineProperty;var g=Object.getOwnPropertyDescriptor;var x=Object.getOwnPropertyNames;var C=Object.prototype.hasOwnProperty;var n=(t=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(t,{get:(o,e)=>(typeof require<"u"?require:o)[e]}):t)(function(t){if(typeof require<"u")return require.apply(this,arguments);throw new Error('Dynamic require of "'+t+'" is not supported')});var I=(t,o)=>{for(var e in o)s(t,e,{get:o[e],enumerable:!0})},h=(t,o,e,a)=>{if(o&&typeof o=="object"||typeof o=="function")for(let r of x(o))!C.call(t,r)&&r!==e&&s(t,r,{get:()=>o[r],enumerable:!(a=g(o,r))||a.enumerable});return t};var k=t=>h(s({},"__esModule",{value:!0}),t);var P={};I(P,{default:()=>y});var d=n("@yarnpkg/core");var f=n("@yarnpkg/core"),c={afterInstall:{description:"Hook that will always run after install",type:f.SettingsType.STRING,default:""}};var u=n("clipanion"),p=n("@yarnpkg/core");var m=n("@yarnpkg/shell"),l=async(t,o)=>{var r;let e=t.get("afterInstall"),a=!!((r=t.projectCwd)!=null&&r.endsWith(`dlx-${process.pid}`));return e&&!a?(o&&console.log("Running `afterInstall` hook..."),(0,m.execute)(e,[],{cwd:t.projectCwd||void 0})):0};var i=class extends u.Command{async execute(){let o=await p.Configuration.find(this.context.cwd,this.context.plugins);return l(o,!1)}};i.paths=[["after-install"]];var w={configuration:c,commands:[i],hooks:{afterAllInstalled:async(t,o)=>{if((o==null?void 0:o.mode)===d.InstallMode.UpdateLockfile)return;if(await l(t.configuration,!0))throw new Error("The `afterInstall` hook failed, see output above.")}}},y=w;return k(P);})();
  return plugin;
  }
  };
