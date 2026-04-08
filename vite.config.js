import { resolve } from "path";
import { createHtmlPlugin } from "vite-plugin-html";
import { header, nav, footer } from "./docs/partials.js";

const docsData = { header, nav, footer };

export default {
  base: '/',
  appType: 'mpa',
  plugins: [
    {
      name: 'docs-directory',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.originalUrl.endsWith('/docs') || req.originalUrl.endsWith('/docs/')) {
            res.writeHead(302, { Location: '/docs/index.html' });
            res.end();
            return;
          }
          next();
        });
      },
    },
    createHtmlPlugin({
      pages: [
        {
          filename: 'docs/index.html',
          template: 'docs/index.html',
          injectOptions: {
            data: { title: 'Home', ...docsData },
          },
        },
        {
          filename: 'docs/getting-started.html',
          template: 'docs/getting-started.html',
          injectOptions: {
            data: { title: 'Getting Started', ...docsData },
          },
        },
        {
          filename: 'docs/loading-saving.html',
          template: 'docs/loading-saving.html',
          injectOptions: {
            data: { title: 'Loading & Saving', ...docsData },
          },
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        symbol_editor: resolve(__dirname, "symbol_editor.html"),
        'docs/index': resolve(__dirname, "docs/index.html"),
        'docs/getting-started': resolve(__dirname, "docs/getting-started.html"),
        'docs/loading-saving': resolve(__dirname, "docs/loading-saving.html"),
      },
    },
  },
};