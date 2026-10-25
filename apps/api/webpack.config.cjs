/**
 * NestJS webpack yapılandırması.
 *
 * Gerekçe: @perdego/contracts workspace paketi TS kaynak olarak paylaşılır
 * (exports → src/index.ts). Node 24'ün yerel TS yükleyicisi, ESM sözdizimli
 * .ts dosyalarında uzantısız göreli importları çözemediği için dist, sözleşme
 * kaynağını PAKETİN İÇİNE gömmelidir. Ayrıca tsc'in emitDecoratorMetadata'sı
 * NestJS DI için zorunludur — tsx/esbuild bunu üretmediğinden derleme
 * tsc(ts-loader) ile yapılır (tsconfig.webpack.json: rootDir yok).
 *
 * Prisma ve argon2 native/istemci paketleri bundle'a girmez (externals).
 */
module.exports = (options) => ({
  ...options,
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  externals: [
    { '@prisma/client': 'commonjs @prisma/client' },
    { '.prisma/client': 'commonjs .prisma/client' },
    { '@node-rs/argon2': 'commonjs @node-rs/argon2' },
  ],
  optimization: {
    ...options.optimization,
    // Node hedefi: modül birleştirme ve minify gerekmez (hata ayıklanabilirlik).
    minimize: false,
  },
});
