import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // A pragmatic 3-way split so the app code is not one 600 kB file: the markdown
        // renderer (largest, only needed on lesson/chat screens), the React runtime and
        // router, and everything else (zod, forms, app code).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (
            /[\/]node_modules[\/](react-markdown|remark-[^\/]+|rehype-[^\/]+|unified|mdast-[^\/]+|micromark[^\/]*|hast-[^\/]+|unist-[^\/]+|vfile[^\/]*|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities[^\/]*|trim-lines|html-url-attributes|devlop|bail|trough|is-plain-obj|estree-util-is-identifier-name)[\/]/.test(
              id,
            )
          ) {
            return "markdown";
          }
          if (/[\/]node_modules[\/](react|react-dom|react-router|scheduler)[\/]/.test(id)) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
