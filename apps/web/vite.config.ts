import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The markdown pipeline (react-markdown and its unified/remark/rehype/micromark dependencies).
const MARKDOWN_PACKAGES =
  /^(react-markdown|remark-.*|rehype-.*|unified|mdast-.*|micromark.*|hast-.*|unist-.*|vfile.*|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities.*|trim-lines|html-url-attributes|devlop|bail|trough|is-plain-obj|estree-util-is-identifier-name)$/;
const REACT_PACKAGES = new Set(["react", "react-dom", "react-router", "scheduler"]);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // A pragmatic 3-way split so the app code is not one 600 kB file: the markdown
        // renderer (largest, only needed on lesson/chat screens), the React runtime and
        // router, and everything else (zod, forms, app code).
        manualChunks(id: string) {
          const path = id.replaceAll("\\", "/");
          const marker = "/node_modules/";
          const at = path.lastIndexOf(marker);
          if (at === -1) return undefined;
          const pkg = path.slice(at + marker.length).split("/")[0] ?? "";
          if (MARKDOWN_PACKAGES.test(pkg)) return "markdown";
          if (REACT_PACKAGES.has(pkg)) return "react";
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
