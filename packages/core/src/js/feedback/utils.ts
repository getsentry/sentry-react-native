export const checkInternetConnection = async (onConnected: () => void, onDisconnected: () => void): Promise<void> => {
  try {
    const response = await fetch('https://sentry.io', { method: 'HEAD' });
    if (response.ok) {
      onConnected();
    } else {
      onDisconnected();
    }
  } catch (error) {
    onDisconnected();
  }
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};
