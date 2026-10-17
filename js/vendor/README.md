# Vendored dependencies

`supabase.js` is `@supabase/supabase-js` 2.117.2 bundled into a single ES module (MIT license, see `LICENSE-supabase-js.txt`).
It is committed so the app makes no requests to third-party CDNs and the exact version is pinned.

To update it:

```bash
mkdir tmp-bundle && cd tmp-bundle
npm init -y
npm i @supabase/supabase-js@<version> esbuild
echo "export { createClient } from '@supabase/supabase-js';" > entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=none --outfile=../js/vendor/supabase.js
```
