# Lovable tagger for Tailwind 4

This is the bundled `lovable-tagger` 1.3.5 implementation from npm, authored by Emil Fagerholm and distributed under the MIT license. The JSX source instrumentation and Tailwind 4 theme extraction remain intact. The unused Tailwind 3 import, extraction fallback, and their dependencies have been removed.

The upstream package still depends on Tailwind 3, which imports `braces`. All published versions of `braces` are affected by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), with no patched release available on 3 October 2026. Keeping this small local adaptation preserves Lovable's visual editor without retaining the vulnerable dependency or bypassing npm audit.

The package uses `@tailwindcss/node` 4 and supports the same Vite versions as upstream. Replace it with the registry version when upstream removes its Tailwind 3 dependency. Recheck the audit and the development build with `LOVABLE_DEV_SERVER=true` before doing so.

Source package: [lovable-tagger 1.3.5 on npm](https://www.npmjs.com/package/lovable-tagger/v/1.3.5). The upstream repository listed in that package is `lovablelabs/lovable`, directory `npm-packages/tagger`.
