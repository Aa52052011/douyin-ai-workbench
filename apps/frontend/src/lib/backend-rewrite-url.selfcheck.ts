import assert from "node:assert/strict";
import { resolveBackendRewriteUrl } from "./backend-rewrite-url";

assert.equal(resolveBackendRewriteUrl({ NODE_ENV: "development" }, ["tsx"]), "http://localhost:3001");
assert.equal(
  resolveBackendRewriteUrl({ NODE_ENV: "production", BACKEND_URL: "http://127.0.0.1:3001/" }, ["next", "start"]),
  "http://127.0.0.1:3001",
);
assert.throws(
  () => resolveBackendRewriteUrl({ NODE_ENV: "production" }, ["node", "next", "start"]),
  /BACKEND_URL is required in production/,
);
assert.equal(
  resolveBackendRewriteUrl({ NODE_ENV: "production" }, ["node", "next", "build"]),
  "http://127.0.0.1:3001",
);

console.log("backend-rewrite-url.selfcheck: PASS");
