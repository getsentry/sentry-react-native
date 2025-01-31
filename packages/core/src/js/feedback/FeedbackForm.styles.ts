import type { FeedbackFormStyles } from './FeedbackForm.types';

const PURPLE = 'rgba(88, 74, 192, 1)';
const FORGROUND_COLOR = '#2b2233';
const BACKROUND_COLOR = '#ffffff';
const BORDER_COLOR = 'rgba(41, 35, 47, 0.13)';

const defaultStyles: FeedbackFormStyles = {
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: BACKROUND_COLOR,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'left',
    flex: 1,
    color: FORGROUND_COLOR,
  },
  label: {
    marginBottom: 4,
    fontSize: 16,
    color: FORGROUND_COLOR,
  },
  input: {
    height: 50,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
    color: FORGROUND_COLOR,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    color: FORGROUND_COLOR,
  },
  screenshotButton: {
    backgroundColor: '#eee',
    padding: 15,
    borderRadius: 5,
    marginBottom: 20,
    alignItems: 'center',
  },
  screenshotText: {
    color: '#333',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: PURPLE,
    paddingVertical: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitText: {
    color: BACKROUND_COLOR,
    fontSize: 18,
  },
  cancelButton: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    color: FORGROUND_COLOR,
    fontSize: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    width: '100%',
  },
  sentryLogo: {
    width: 40,
    height: 40,
  },
};

export default defaultStyles;
