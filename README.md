
# sentry-react-native

## Getting started

`$ npm install sentry-react-native --save`

### Mostly automatic installation

`$ react-native link sentry-react-native`

### Manual installation


#### iOS

1. In XCode, in the project navigator, right click `Libraries` ➜ `Add Files to [your project's name]`
2. Go to `node_modules` ➜ `sentry-react-native` and add `RNSentry.xcodeproj`
3. In XCode, in the project navigator, select your project. Add `libRNSentry.a` to your project's `Build Phases` ➜ `Link Binary With Libraries`
4. Run your project (`Cmd+R`)<

#### Android

1. Open up `android/app/src/main/java/[...]/MainActivity.java`
  - Add `import com.reactlibrary.RNSentryPackage;` to the imports at the top of the file
  - Add `new RNSentryPackage()` to the list returned by the `getPackages()` method
2. Append the following lines to `android/settings.gradle`:
  	```
  	include ':sentry-react-native'
  	project(':sentry-react-native').projectDir = new File(rootProject.projectDir, 	'../node_modules/sentry-react-native/android')
  	```
3. Insert the following lines inside the dependencies block in `android/app/build.gradle`:
  	```
      compile project(':sentry-react-native')
  	```

#### Windows
[Read it! :D](https://github.com/ReactWindows/react-native)

1. In Visual Studio add the `RNSentry.sln` in `node_modules/sentry-react-native/windows/RNSentry.sln` folder to their solution, reference from their app.
2. Open up your `MainPage.cs` app
  - Add `using Cl.Json.RNSentry;` to the usings at the top of the file
  - Add `new RNSentryPackage()` to the `List<IReactPackage>` returned by the `Packages` method


## Usage
```javascript
import RNSentry from 'sentry-react-native';

// TODO: What do with the module?
RNSentry;
```
  