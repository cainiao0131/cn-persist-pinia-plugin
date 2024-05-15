import { defineConfig } from 'vitepress';

export default defineConfig({
  srcDir: './src',
  base: '/cn-persist-pinia-plugin/',
  head: [['link', { rel: 'icon', href: '/cn-persist-pinia-plugin/favicon.ico' }]],
  title: 'cn-persist-pinia-plugin',
  lastUpdated: true,
  markdown: {
    theme: {
      light: 'catppuccin-latte',
      dark: 'catppuccin-mocha',
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/cainiao0131/cn-persist-pinia-plugin',
      },
    ],
  },
});
