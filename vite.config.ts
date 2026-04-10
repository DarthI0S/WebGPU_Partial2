import { defineConfig } from "vite";

export default defineConfig({
  base: "/proyecto_lol/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        // add more entry points as needed
      },
    },
  },
});
