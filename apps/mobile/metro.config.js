/**
 * Metro yapılandırması — monorepo desteği (docs.expo.dev/guides/monorepos).
 *
 * - Modül çözümlemesi hem uygulama hem kök node_modules'a yapılır; böylece
 *   @perdego/contracts çalışır.
 * - watchFolders, workspace kökünün tamamı yerine yalnızca packages/ dizinini
 *   izler. Gerekçe: paylaşılan sözleşme kaynakları canlı yeniden yüklemede
 *   takip edilmeli; ancak sandbox ortamındaki düşük inotify izleme limiti
 *   (8192) kök node_modules'ın tamamının izlenmesine izin vermiyor.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: paylaşılan paket kaynaklarını izle (node_modules hariç)
config.watchFolders = [path.resolve(workspaceRoot, 'packages')];

// Modül çözümleme: önce uygulama, sonra kök node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
