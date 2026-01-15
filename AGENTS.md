# AGENTS.md

This file provides comprehensive guidance for AI coding agents working with the Sentry React Native SDK repository.

## Agent Responsibilities

- **Continuous Learning**: Whenever an agent performs a task and discovers new patterns, conventions, or best practices that aren't documented here, it should add these learnings to AGENTS.md. This ensures the documentation stays current and helps future agents work more effectively.
- **Context Management**: When using compaction (which reduces context by summarizing older messages), the agent must re-read AGENTS.md afterwards to ensure it's always fully available in context. This guarantees that all guidelines, conventions, and best practices remain accessible throughout the entire session.

## Best Practices

### Compilation & Testing

Before forming a commit, ensure compilation and tests succeed for all supported platforms and environments.

#### JavaScript/TypeScript SDK
- **Build**: Run `yarn build` from the root to build all packages
- **Type checking**: TypeScript must compile without errors
- **Linting**: Run `yarn lint` to check all code (TypeScript, Java, Kotlin, Objective-C, Swift, C++)
- **Unit tests**: Run `yarn test` to execute the full Jest test suite
- **Circular dependency check**: Run `yarn circularDepCheck` to ensure no circular dependencies
- **TypeScript 3.8 compatibility**: Ensure downleveled types are compatible with older TypeScript versions

#### Native Code (Android)
- **Java formatting**: Use Google Java Format via `yarn fix:android`
- **Kotlin formatting**: Use ktlint via `yarn fix:kotlin`
- **PMD static analysis**: Ensure no PMD violations via `yarn java:pmd`
- **Build verification**: Native Android code should compile in sample projects

#### Native Code (iOS/macOS)
- **Objective-C/C++ formatting**: Use clang-format via `yarn fix:clang`
- **Swift linting**: Use swiftlint via `yarn fix:swift`
- **Build verification**: Native iOS/macOS code should compile in sample projects

### Testing Instructions

#### Finding the CI Plan
- CI workflows are located in `.github/workflows/`
- Main workflow: `buildandtest.yml`
- Native tests: `native-tests.yml`
- E2E tests: `e2e-v2.yml`
- Sample app tests: `sample-application.yml`, `sample-application-expo.yml`

#### Running Tests

**Unit Tests (JavaScript/TypeScript):**
```bash
# Run all tests
yarn test

# Run tests in watch mode during development
cd packages/core
yarn test:watch

# Run SDK tests only
cd packages/core
yarn test:sdk

# Run tools tests only
cd packages/core
yarn test:tools
```

**Linting:**
```bash
# Run all linters
yarn lint

# Fix linting issues automatically
yarn fix

# Run specific linters
yarn lint:lerna    # TypeScript/JavaScript linting
yarn lint:android  # Java formatting and PMD
yarn lint:kotlin   # Kotlin linting
yarn lint:clang    # Objective-C/C++ formatting
yarn lint:swift    # Swift linting
```

**Building:**
```bash
# Build all packages
yarn build

# Build SDK in watch mode for development
cd packages/core
yarn build:sdk:watch
```

**Testing Sample Applications:**
```bash
# React Native sample
cd samples/react-native
yarn start  # Start Metro bundler
yarn ios    # Run iOS app
yarn android # Run Android app

# Expo sample
cd samples/expo
yarn start
```

#### Test Naming Convention

Use the pattern `test<Function>_<scenario>` or `describe/it` blocks for test method names:

**Jest/describe-it pattern (preferred):**

```typescript
describe('functionName', () => {
  it('returns expected value when input is valid', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toBe('expected');
  });

  it('throws error when input is invalid', () => {
    expect(() => functionName(null)).toThrow();
  });
});
```

**Flat test naming pattern:**

```typescript
test('functionName returns expected value when input is valid', () => {
  // Arrange
  const input = 'test';

  // Act
  const result = functionName(input);

  // Assert
  expect(result).toBe('expected');
});
```

**Benefits:**
- Clear function being tested
- Explicit condition/scenario
- Expected outcome is obvious
- Easy to understand test purpose without reading implementation

#### Test Code Style

**Arrange-Act-Assert Pattern:**

Always structure tests with clear sections:

```typescript
it('processes user data correctly', () => {
  // Arrange
  const userData = { name: 'Test User', id: 123 };
  const processor = new DataProcessor();

  // Act
  const result = processor.process(userData);

  // Assert
  expect(result.name).toBe('Test User');
  expect(result.id).toBe(123);
});
```

**Use Jest matchers appropriately:**

```typescript
// Good - specific matchers
expect(value).toBe(true);
expect(array).toHaveLength(3);
expect(object).toMatchObject({ key: 'value' });
expect(fn).toThrow(Error);
expect(promise).resolves.toBe('success');

// Avoid - less specific
expect(value === true).toBe(true);
expect(array.length).toBe(3);
```

**Mock cleanup:**

```typescript
describe('MyComponent', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls API with correct parameters', () => {
    const mockApi = jest.fn();
    // test code
    expect(mockApi).toHaveBeenCalledWith(expectedParams);
  });
});
```

### Code Style Guidelines

#### TypeScript/JavaScript

**General Style:**
- Use **single quotes** for strings
- **Arrow functions** preferred for callbacks
- **async/await** is allowed (React Native bundle size isn't a concern)
- Use **optional chaining** (`?.`) and **nullish coalescing** (`??`)
- Maximum line length: **120 characters**
- Trailing commas: **always**
- Arrow parens: **avoid** when possible (`x => x` not `(x) => x`)

**Type Annotations:**
- Explicitly type function parameters and return types
- Use TypeScript strict mode conventions
- Prefer `interface` over `type` for object shapes
- Use `unknown` instead of `any` when possible

**Example:**

```typescript
interface UserData {
  id: string;
  name: string;
  email?: string;
}

const processUser = (user: UserData): string => {
  return user.email ?? 'no-email@example.com';
};
```

**Import Ordering:**
1. External packages (e.g., `@sentry/core`, `react-native`)
2. Internal absolute imports
3. Relative imports
4. Type imports (can be inline with `import type`)

#### Native Code (Java/Kotlin)

**Java:**
- Use Google Java Format (enforced by `yarn lint:android`)
- Package structure: `io.sentry.react.*`
- Null safety: Use `@Nullable` and `@NonNull` annotations

**Kotlin:**
- Use ktlint formatting (enforced by `yarn lint:kotlin`)
- Prefer Kotlin idioms (data classes, extension functions, etc.)

#### Native Code (Objective-C/Swift)

**Objective-C:**
- Use clang-format (enforced by `yarn lint:clang`)
- Prefix classes with `RNSentry`
- Use nullability annotations (`nullable`, `nonnull`)

**Swift:**
- Use swiftlint (enforced by `yarn lint:swift`)
- Follow Swift API design guidelines

### Commit Guidelines

#### Commit Messages

Follow conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Other changes that don't modify src or test files

**Scopes (examples):**
- `android`: Android-specific changes
- `ios`: iOS-specific changes
- `core`: Core SDK functionality
- `tracing`: Performance tracing
- `replay`: Session replay
- `profiling`: Profiling functionality
- `e2e`: End-to-end tests

**Examples:**

```
feat(replay): Add mobile replay masking support

Implements custom masking components for React Native session replay.
Adds RNSentryReplayMask and RNSentryReplayUnmask components.

Closes #1234
```

```
fix(android): Fix crash on startup with Hermes

The native module was trying to access the bridge before it was ready.
Added null check to prevent crash.

Fixes #5678
```

#### Pre-Commit Checklist

Before committing, ensure:

- [ ] Code compiles without errors (`yarn build`)
- [ ] All tests pass (`yarn test`)
- [ ] Linting passes (`yarn lint`)
- [ ] No circular dependencies (`yarn circularDepCheck`)
- [ ] Native code formatted correctly
- [ ] TypeScript types are correct
- [ ] Tests added/updated for changes
- [ ] Documentation updated if necessary

## CI/CD Considerations

### Concurrency Control

The CI uses concurrency groups to prevent wasted resources:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

**Key points:**
- Pull request workflows cancel previous runs when new commits are pushed
- Main branch workflows never cancel to ensure complete validation
- Release branches follow the same protection as main

### Ready-to-Merge Gate

To save CI resources, some expensive tests only run when a PR has the `ready-to-merge` label:

- Full native tests on multiple React Native versions
- E2E tests
- Sample application builds

During development, basic tests run on every commit. Add `ready-to-merge` label when PR is ready for final review.

### CI Jobs Overview

**buildandtest.yml:**
- TypeScript compilation
- Unit tests (Jest)
- Linting (all languages)
- Circular dependency check
- TypeScript 3.8 compatibility check
- Bundle generation for iOS and Android

**native-tests.yml:**
- iOS native tests (Objective-C/Swift)
- Android native tests (Java/Kotlin)
- Multiple React Native versions

**e2e-v2.yml:**
- End-to-end tests using Maestro
- Real device testing on Sauce Labs
- Multiple React Native versions

**sample-application.yml:**
- Build sample React Native app
- iOS and Android variants
- Legacy and new architecture

## Development Workflow

### Setting Up Development Environment

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Build packages:**
   ```bash
   yarn build
   ```

3. **Start development:**
   ```bash
   cd packages/core
   yarn build:sdk:watch  # Watch mode for SDK development
   ```

4. **Run sample app:**
   ```bash
   cd samples/react-native
   yarn start  # Metro bundler
   # In another terminal:
   yarn ios    # or yarn android
   ```

### Working with Native Dependencies

**Sentry Cocoa (iOS):**

To test changes with local sentry-cocoa:

1. Build sentry-cocoa: `cd sentry-cocoa && make init`
2. Edit `RNSentry.podspec` to remove version constraint
3. Add local pod to sample's Podfile:
   ```ruby
   pod 'Sentry/HybridSDK', :path => '../../../../sentry-cocoa'
   ```

**Sentry Java (Android):**

To test changes with local sentry-java:

1. Build sentry-java: `cd sentry-java && make dryRelease`
2. Add `mavenLocal()` to sample's `android/build.gradle`
3. Update version to locally published version

### Cross-Platform Dependencies

When making changes, consider impact on:
- **React Native**: Core platform
- **Expo**: Managed workflow support
- **Sentry Cocoa**: iOS native SDK
- **Sentry Java/Android**: Android native SDK
- **Flutter**: Flutter SDK depends on native SDKs
- **.NET**: .NET MAUI depends on native SDKs
- **Unity**: Unity SDK depends on native SDKs

Coordinate changes with other teams when modifying native bridge APIs.

## Documentation

When making changes, update relevant documentation:

### Code Documentation
- **JSDoc comments** for public APIs
- **Inline comments** for complex logic
- **Type definitions** for TypeScript users

### Project Documentation
- **README.md**: User-facing documentation
- **CONTRIBUTING.md**: Contributor guidelines
- **CHANGELOG.md**: User-visible changes
- **Migration guides**: Breaking changes

### External Documentation
- **docs.sentry.io**: User documentation (separate repo)
- **Native SDK docs**: Link to native SDK documentation for native features

## Common Patterns and Conventions

### Error Handling

**In TypeScript:**

```typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', error);
  // Don't throw - log and return fallback
  return fallbackValue;
}
```

**In Native Code:**

```objc
NSError *error = nil;
BOOL success = [self performOperation:&error];
if (!success) {
  [SentryLog logWithMessage:[NSString stringWithFormat:@"Operation failed: %@", error] andLevel:kSentryLevelError];
  return fallback;
}
```

### Native Bridge Pattern

**TypeScript (JS side):**

```typescript
import { NativeModules } from 'react-native';

const { RNSentry } = NativeModules;

export async function nativeOperation(param: string): Promise<boolean> {
  if (!RNSentry) {
    logger.warn('Native module not available');
    return false;
  }

  try {
    return await RNSentry.nativeOperation(param);
  } catch (error) {
    logger.error('Native operation failed', error);
    return false;
  }
}
```

**Native (Android):**

```java
@ReactMethod
public void nativeOperation(String param, Promise promise) {
  try {
    boolean result = performOperation(param);
    promise.resolve(result);
  } catch (Exception e) {
    promise.reject("OPERATION_FAILED", "Operation failed: " + e.getMessage(), e);
  }
}
```

**Native (iOS):**

```objc
RCT_EXPORT_METHOD(nativeOperation:(NSString *)param
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    BOOL result = [self performOperation:param];
    resolve(@(result));
  } @catch (NSException *exception) {
    reject(@"OPERATION_FAILED", exception.reason, nil);
  }
}
```

### Platform-Specific Code

**TypeScript:**

```typescript
import { Platform } from 'react-native';

const platformSpecificValue = Platform.select({
  ios: 'iOS value',
  android: 'Android value',
  default: 'Default value',
});

if (Platform.OS === 'ios') {
  // iOS-specific logic
} else if (Platform.OS === 'android') {
  // Android-specific logic
}
```

### Testing Native Modules

**Mocking React Native:**

```typescript
jest.mock('react-native', () => ({
  NativeModules: {
    RNSentry: {
      nativeOperation: jest.fn(() => Promise.resolve(true)),
    },
  },
  Platform: {
    OS: 'ios',
  },
}));
```

## Troubleshooting

### Common Issues

**Build Failures:**
- Clear node_modules and reinstall: `rm -rf node_modules && yarn install`
- Clear build artifacts: `yarn clean && yarn build`
- Clear native builds: `cd samples/react-native/ios && pod install --repo-update`

**Test Failures:**
- Clear Jest cache: `jest --clearCache`
- Ensure build is up to date: `yarn build`
- Check for mock issues: Verify mocks in `test/` directory

**Native Module Issues:**
- iOS: Clean build folder in Xcode (Cmd+Shift+K)
- Android: `cd samples/react-native/android && ./gradlew clean`
- Reinstall pods: `cd samples/react-native && npx pod-install`

**Linting Failures:**
- Auto-fix: `yarn fix`
- Check specific linter: `yarn lint:lerna` (or android, kotlin, clang, swift)

### Getting Help

- Check existing issues on GitHub
- Review CONTRIBUTING.md for guidelines
- Review CI.md for CI-specific information
- Check Sentry's internal documentation for cross-platform considerations

## Maintenance Guidelines

### Keeping AGENTS.md Updated

When you discover new patterns or conventions:

1. **Document the pattern** with clear examples
2. **Explain why** the pattern is preferred
3. **Add to appropriate section** or create new section if needed
4. **Keep examples concise** but complete
5. **Update when conventions change**

### Regular Reviews

Periodically review AGENTS.md to:
- Remove outdated information
- Update examples to match current codebase
- Add newly discovered patterns
- Improve clarity and organization
- Ensure consistency with other Sentry SDKs
