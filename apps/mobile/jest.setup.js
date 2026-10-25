/**
 * Jest ortam kurulumu.
 * Expo, EXPO_PUBLIC_* değişkenlerini derleme sırasında gömer; testlerde
 * env'i elle ayarlarız. __DEV__ jest-expo preset'i tarafından true ayarlanır.
 */
process.env.EXPO_PUBLIC_MOCK_API = '1';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000/api/v1';
