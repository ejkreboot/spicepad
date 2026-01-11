import { resolve } from "path";

export default {
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        sim: resolve(__dirname, "sim.html"),
        symbol_editor: resolve(__dirname, "symbol_editor.html"),
      },
    },
  },
};