# packages/core — TypeScript/JavaScript SDK

## Build & Test

```bash
yarn build:sdk:watch   # Watch mode for development
yarn test:watch        # Jest watch mode
yarn test:sdk          # SDK tests only
yarn test:tools        # Tools tests only
```

## Code Style

- **Single quotes** for strings
- **Arrow functions** preferred for callbacks
- **async/await** is allowed (React Native bundle size isn't a concern)
- Use **optional chaining** (`?.`) and **nullish coalescing** (`??`)
- Maximum line length: **120 characters**
- Trailing commas: **always**
- Arrow parens: **avoid** when possible (`x => x` not `(x) => x`)

## Type Annotations

- Explicitly type function parameters and return types
- Use TypeScript strict mode conventions
- Prefer `interface` over `type` for object shapes
- Use `unknown` instead of `any` when possible

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

## Import Ordering

1. External packages (e.g., `@sentry/core`, `react-native`)
2. Internal absolute imports
3. Relative imports
4. Type imports (can be inline with `import type`)

## Test Naming Convention

Use `describe/it` blocks (preferred) or flat `test()` calls:

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
});
```

## Test Code Style

**Arrange-Act-Assert pattern** — always structure tests with clear sections.

**Use specific Jest matchers:**

```typescript
// Good
expect(value).toBe(true);
expect(array).toHaveLength(3);
expect(object).toMatchObject({ key: 'value' });
expect(fn).toThrow(Error);
expect(promise).resolves.toBe('success');

// Avoid
expect(value === true).toBe(true);
expect(array.length).toBe(3);
```

**Mock cleanup:**

```typescript
describe('MyComponent', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
});
```

## Common Patterns

### Error Handling

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

### Native Bridge (JS side)

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

### Platform-Specific Code

```typescript
import { Platform } from 'react-native';

const platformSpecificValue = Platform.select({
  ios: 'iOS value',
  android: 'Android value',
  default: 'Default value',
});
```

### Mocking Native Modules in Tests

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
