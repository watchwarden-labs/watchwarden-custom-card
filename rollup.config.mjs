import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/main.ts",
  output: {
    file: "dist/watchwarden-card.js",
    format: "es",
  },
  plugins: [
    resolve(),
    typescript(),
    terser({ format: { comments: false } }),
  ],
};
