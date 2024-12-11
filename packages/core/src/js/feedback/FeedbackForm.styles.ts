import type { FeedbackFormStyles } from './FeedbackForm.types';

const defaultStyles: FeedbackFormStyles = {
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'left',
    flex: 1,
  },
  label: {
    marginBottom: 4,
    fontSize: 16,
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#6a1b9a',
    paddingVertical: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    color: '#6a1b9a',
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
