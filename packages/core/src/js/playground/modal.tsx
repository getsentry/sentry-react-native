import * as React from 'react';
import { Animated, Image, Modal, Platform, Pressable, Text, useColorScheme, View } from 'react-native';

import { openURLInBrowser } from '../metro/openUrlInBrowser';
import { isExpoGo, isWeb } from '../utils/environment';
import { bug as bugAnimation, hi as hiAnimation, thumbsup as thumbsupAnimation } from './animations';
import { nativeCrashExample, tryCatchExample, uncaughtErrorExample } from './examples';
import { bug as bugImage, hi as hiImage, thumbsup as thumbsupImage } from './images';
import { defaultDarkStyles, lightStyles } from './modal.styles';

/**
 * Wrapper to add Sentry Playground to your application
 * to test your Sentry React Native SDK setup.
 *
 * @example
 * ```tsx
 * import * as Sentry from '@sentry/react-native';
 * import { withSentryPlayground } from '@sentry/react-native/playground';
 *
 * function App() {
 *   return <View>...</View>;
 * }
 *
 * export default withSentryPlayground(Sentry.wrap(App), {
 *   projectId: '123456',
 *   organizationSlug: 'my-org'
 * });
 * ```
 */
export const withSentryPlayground = <P extends object>(
  Component: React.ComponentType<P>,
  options: { projectId?: string; organizationSlug?: string } = {},
): React.ComponentType<P> => {
  const Wrapper = (props: P): React.ReactElement => {
    return (
      <>
        <SentryPlayground projectId={options.projectId} organizationSlug={options.organizationSlug} />
        <Component {...props} />
      </>
    );
  };

  Wrapper.displayName = 'withSentryPlayground()';
  return Wrapper;
};

export const SentryPlayground = ({
  projectId,
  organizationSlug,
}: {
  projectId?: string;
  organizationSlug?: string;
}): React.ReactElement => {
  const issuesStreamUrl =
    projectId && organizationSlug
      ? `https://${organizationSlug}.sentry.io/issues/?project=${projectId}&statsPeriod=1h`
      : 'https://sentry.io/';
  const styles = useColorScheme() === 'dark' ? defaultDarkStyles : lightStyles;

  const [show, setShow] = React.useState(true);
  const [animation, setAnimation] = React.useState('hi');

  const onAnimationPress = (): void => {
    switch (animation) {
      case 'hi':
        setAnimation('thumbsup');
        break;
      default:
        setAnimation('hi');
    }
  };

  const isNativeCrashDisabled = isWeb() || isExpoGo() || __DEV__;

  const animationContainerYPosition = React.useRef(new Animated.Value(0)).current;

  const springAnimation = Animated.sequence([
    Animated.timing(animationContainerYPosition, {
      toValue: -50,
      duration: 300,
      useNativeDriver: true,
    }),
    Animated.spring(animationContainerYPosition, {
      toValue: 0,
      friction: 4,
      tension: 40,
      useNativeDriver: true,
    }),
  ]);

  const changeAnimationToBug = (func: () => void): void => {
    setAnimation('bug');
    springAnimation.start(() => {
      func();
    });
  };

  return (
    <Modal
      presentationStyle="formSheet"
      visible={show}
      animationType="slide"
      onRequestClose={() => {
        setShow(false);
      }}
    >
      <View style={styles.background}>
        <View style={styles.container}>
          <Text style={styles.welcomeText}>Welcome to Sentry Playground!</Text>
          <Animated.View
            style={{
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ translateY: animationContainerYPosition }],
            }}
            onTouchEnd={() => {
              springAnimation.start();
            }}
          >
            <Pressable onPress={onAnimationPress}>
              <Animation id={animation} />
            </Pressable>
          </Animated.View>
          <View style={styles.listContainer}>
            <Row
              title={'captureException()'}
              description={'In a try-catch scenario, errors can be reported using manual APIs.'}
              actionDescription={'Try'}
              action={tryCatchExample}
            />
            <Row
              title={'throw new Error()'}
              description={'Uncaught errors are automatically reported by the React Native Global Handler.'}
              actionDescription={'Throw'}
              action={() => changeAnimationToBug(uncaughtErrorExample)}
            />
            <Row
              title={'throw RuntimeException()'}
              description={
                isNativeCrashDisabled
                  ? 'For testing native crashes, build the mobile application in release mode.'
                  : 'Unhandled errors in native layers such as Java, Objective-C, C, Swift, or Kotlin are automatically reported.'
              }
              actionDescription={'Crash'}
              action={nativeCrashExample}
              last
              disabled={isNativeCrashDisabled}
            />
          </View>
          <View style={{ marginTop: 40 }} />
          <View
            style={{
              width: '100%',
              flexDirection: 'row', // Arrange buttons horizontally
              justifyContent: 'space-evenly', // Space between buttons
            }}
          >
            <Button
              secondary
              title={'Open Sentry'}
              onPress={() => {
                openURLInBrowser(issuesStreamUrl);
              }}
            />
            <Button
              title={'Go to my App'}
              onPress={() => {
                setShow(false);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const Animation = ({ id }: { id: string }): React.ReactElement | null => {
  const shouldFallbackToImage = Platform.OS === 'android';

  switch (id) {
    case 'hi':
      return (
        <Image source={{ uri: shouldFallbackToImage ? hiImage : hiAnimation }} style={{ width: 100, height: 100 }} />
      );
    case 'bug':
      return (
        <Image source={{ uri: shouldFallbackToImage ? bugImage : bugAnimation }} style={{ width: 100, height: 100 }} />
      );
    case 'thumbsup':
      return (
        <Image
          source={{ uri: shouldFallbackToImage ? thumbsupImage : thumbsupAnimation }}
          style={{ width: 100, height: 100 }}
        />
      );
    default:
      return null;
  }
};

const Row = ({
  last = false,
  action = () => {},
  actionDescription = '',
  title,
  description,
  disabled = false,
}: {
  last?: boolean;
  action?: () => void;
  actionDescription?: string;
  title: string;
  description: string;
  disabled?: boolean;
}): React.ReactElement => {
  const styles = useColorScheme() === 'dark' ? defaultDarkStyles : lightStyles;

  return (
    <View style={[styles.rowContainer, last && styles.lastRowContainer]}>
      <View style={{ flexShrink: 1, paddingRight: 12 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={{ color: 'rgb(146, 130, 170)', fontSize: 12 }}>{description}</Text>
      </View>
      <View>
        <Button disabled={disabled} secondary onPress={action} title={actionDescription} />
      </View>
    </View>
  );
};

const Button = ({
  onPress,
  title,
  secondary,
  disabled = false,
}: {
  onPress: () => void;
  title: string;
  secondary?: boolean;
  disabled?: boolean;
}): React.ReactElement => {
  const styles = useColorScheme() === 'dark' ? defaultDarkStyles : lightStyles;

  return (
    <View style={[styles.buttonBottomLayer, styles.buttonCommon, secondary && styles.buttonSecondaryBottomLayer]}>
      <Pressable
        style={({ pressed }) => [
          styles.buttonMainContainer,
          pressed && styles.buttonMainContainerPressed,
          styles.buttonCommon,
          secondary && styles.buttonSecondaryContainer,
          disabled && styles.buttonDisabledContainer,
        ]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text
          style={[styles.buttonText, secondary && styles.buttonSecondaryText, disabled && styles.buttonDisabledText]}
        >
          {title}
        </Text>
      </Pressable>
    </View>
  );
};
