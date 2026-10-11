Three.js **0.183.2**, MIT license (see LICENSE), installed from the pinned npm
`three@0.183.2` package with npm's registry integrity checking and TLS enabled.
`three.module.js` and `three.core.js` are unchanged upstream build artifacts.
`OrbitControls.js` is upstream `examples/jsm/controls/OrbitControls.js` with
only `from 'three'` replaced by `from './three.module.js'` for static hosting.
The Lab loads these local files so its PC TEST works without any CDN.

To update, install the desired fixed version outside this checkout, copy the
same three files and LICENSE, change that one OrbitControls import, and rerun
all static, unit and browser checks. No runtime npm install is needed.
