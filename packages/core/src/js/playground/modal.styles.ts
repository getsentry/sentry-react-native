import { StyleSheet } from 'react-native';

export const defaultDarkStyles = StyleSheet.create({
  welcomeText: { color: 'rgb(246, 245, 250)', fontSize: 24, fontWeight: 'bold' },
  background: {
    flex: 1,
    backgroundColor: 'rgb(26, 20, 31)',
    width: '100%',
    minHeight: '100%',
    alignItems: 'center', // Center content horizontally
    justifyContent: 'center', // Center content vertically
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    padding: 12,
    marginTop: 20,
    width: '100%',
    alignItems: 'center', // Center image and button container
    justifyContent: 'space-evenly', // Center image and button container
  },
  buttonContainer: {
    flexDirection: 'row', // Arrange buttons horizontally
    marginTop: 20, // Add some space above the buttons
  },
  listContainer: {
    backgroundColor: 'rgb(39, 36, 51)',
    width: '100%',
    flexDirection: 'column',
    marginTop: 20, // Add some space above the buttons
    borderColor: 'rgb(7, 5, 15)',
    borderWidth: 1,
    borderRadius: 8,
  },
  rowTitle: {
    color: 'rgb(246, 245, 250)',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Menlo',
  },
  rowContainer: {
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'space-between', // Space between buttons
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderColor: 'rgb(7, 5, 15)',
    borderBottomWidth: 1,
  },
  lastRowContainer: {
    borderBottomWidth: 0, // Remove border for the last row
  },
  buttonCommon: {
    borderRadius: 8,
  },
  buttonBottomLayer: {
    backgroundColor: 'rgb(7, 5, 15)',
  },
  buttonMainContainer: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: 'rgb(117, 83, 255)',
    transform: [{ translateY: -4 }],
    borderWidth: 1,
    borderColor: 'rgb(7, 5, 15)',
  },
  buttonSecondaryContainer: {
    backgroundColor: 'rgb(39, 36, 51)',
  },
  buttonSecondaryBottomLayer: {},
  buttonSecondaryText: {},
  buttonMainContainerPressed: {
    transform: [{ translateY: 0 }],
  },
  buttonText: {
    color: 'rgb(246, 245, 250)',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonDisabledText: {
    color: 'rgb(146, 130, 170)',
  },
  buttonDisabledContainer: {
    transform: [{ translateY: -2 }],
    backgroundColor: 'rgb(39, 36, 51)',
  },
});

export const lightStyles: typeof defaultDarkStyles = StyleSheet.create({
  ...defaultDarkStyles,
  welcomeText: {
    ...defaultDarkStyles.welcomeText,
    color: 'rgb(24, 20, 35)',
  },
  background: {
    ...defaultDarkStyles.background,
    backgroundColor: 'rgb(251, 250, 255)',
  },
  buttonMainContainer: {
    ...defaultDarkStyles.buttonMainContainer,
    backgroundColor: 'rgb(117, 83, 255)',
    borderColor: 'rgb(85, 61, 184)',
  },
  buttonBottomLayer: {
    backgroundColor: 'rgb(85, 61, 184)',
  },
  buttonSecondaryContainer: {
    backgroundColor: 'rgb(255, 255, 255)',
    borderColor: 'rgb(218, 215, 229)',
  },
  buttonSecondaryBottomLayer: {
    backgroundColor: 'rgb(218, 215, 229)',
  },
  buttonText: {
    ...defaultDarkStyles.buttonText,
  },
  buttonSecondaryText: {
    ...defaultDarkStyles.buttonText,
    color: 'rgb(24, 20, 35)',
  },
  rowTitle: {
    ...defaultDarkStyles.rowTitle,
    color: 'rgb(24, 20, 35)',
  },
  rowContainer: {
    ...defaultDarkStyles.rowContainer,
    borderColor: 'rgb(218, 215, 229)',
  },
  listContainer: {
    ...defaultDarkStyles.listContainer,
    borderColor: 'rgb(218, 215, 229)',
    backgroundColor: 'rgb(255, 255, 255)',
  },
  buttonDisabledContainer: {
    ...defaultDarkStyles.buttonDisabledContainer,
    backgroundColor: 'rgb(238, 235, 249)',
  },
});
