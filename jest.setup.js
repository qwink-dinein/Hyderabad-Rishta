jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// Sound effects are optional UX (services/feedback); the native audio module isn't available under Jest.
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => undefined, seekTo: () => undefined, remove: () => undefined }), setAudioModeAsync: async () => undefined }));
