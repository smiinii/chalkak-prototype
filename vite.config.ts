import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/chalkak-prototype/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
