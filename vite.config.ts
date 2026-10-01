import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages ではリポジトリ名のサブパスで配信されるため BASE_PATH で切り替える
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ホロドリ編成アドバイザー',
        short_name: 'ホロドリ編成',
        description: 'ホロライブドリームスの編成とホロメンボード解放ルートを提案',
        lang: 'ja',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fff7fb',
        theme_color: '#3db8f5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
