/**
 * Sucrase-based Jest transform for TypeScript.
 * Sucrase is a pure-JS TypeScript stripper (no binary required) that ships
 * with Next.js. This avoids needing @swc/jest or @babel/preset-typescript.
 *
 * On macOS (user's machine), this also works. If you prefer @swc/jest, run:
 *   npm install --save-dev @swc/jest @swc/core
 * and update jest.config.js transform to: ["@swc/jest", {}]
 */

const sucrase = require("sucrase");
const path = require("path");

module.exports = {
  process(sourceText, sourcePath) {
    const ext = path.extname(sourcePath);

    if (ext === ".ts" || ext === ".tsx") {
      const result = sucrase.transform(sourceText, {
        transforms: ext === ".tsx" ? ["typescript", "jsx", "imports"] : ["typescript", "imports"],
        filePath: sourcePath,
        enableLegacyTypeScriptModuleInterop: true,
      });
      return { code: result.code };
    }

    if (ext === ".js" || ext === ".jsx" || ext === ".mjs") {
      if (ext === ".jsx") {
        const result = sucrase.transform(sourceText, {
          transforms: ["jsx"],
          filePath: sourcePath,
        });
        return { code: result.code };
      }
    }

    return { code: sourceText };
  },
};
