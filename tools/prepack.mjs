// Run by each package's prepack (npm pack / npm publish), in the package's directory: puts the repository's LICENSE
// into the package, so the tarball carries the license text without a second copy kept in the repository.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
fs.copyFileSync(path.join(root, "LICENSE"), path.join(process.cwd(), "LICENSE"));
