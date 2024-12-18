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
    textAlign: 'center',
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
  triggerButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: BACKROUND_COLOR,
    padding: 15,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: BORDER_COLOR,
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    flexDirection: 'row',
  },
  triggerText: {
    color: FORGROUND_COLOR,
    fontSize: 18,
  },
  triggerIcon: {
    width: 24,
    height: 24,
    padding: 2,
    marginEnd: 6,
  },
};

export default defaultStyles;
