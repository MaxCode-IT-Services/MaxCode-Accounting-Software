const fs = require("fs");
const path = require("path");

const functionsServeDir = path.join(
  __dirname,
  "..",
  ".netlify",
  "functions-serve",
);
const packageJsonPath = path.join(functionsServeDir, "package.json");

try {
  fs.mkdirSync(functionsServeDir, { recursive: true });

  const packageJson = {
    name: "maxcode-netlify-functions-serve",
    private: true,
    type: "commonjs",
  };

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8",
  );
  console.log(
    "Prepared .netlify/functions-serve/package.json with type=commonjs",
  );
} catch (error) {
  console.error(
    "Failed to prepare Netlify dev runtime:",
    error?.message || error,
  );
  process.exit(1);
}
