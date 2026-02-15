const path = require('path');
const fs = require('fs');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      // Preserve execute permissions (critical for spawn-helper)
      const { mode } = fs.statSync(srcPath);
      fs.chmodSync(destPath, mode);
    }
  }
}

// Recursively find and chmod +x any spawn-helper or .node binaries
function fixExecPerms(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixExecPerms(full);
    } else if (entry.name === 'spawn-helper' || entry.name.endsWith('.node')) {
      fs.chmodSync(full, 0o755);
    }
  }
}

// External native/non-bundleable modules that Vite doesn't include in its output
const EXTERNAL_MODULES = ['node-pty', 'chokidar'];

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '{**/node-pty/**,**/*.node}',
    },
    name: 'ClawNote',
    afterCopy: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        try {
          const projectRoot = __dirname;
          for (const mod of EXTERNAL_MODULES) {
            const src = path.join(projectRoot, 'node_modules', mod);
            const dest = path.join(buildPath, 'node_modules', mod);
            if (fs.existsSync(src)) {
              copyDirSync(src, dest);
              // Copy transitive native dependencies
              const modPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf-8'));
              const deps = Object.keys(modPkg.dependencies || {});
              for (const dep of deps) {
                const depSrc = path.join(projectRoot, 'node_modules', dep);
                const depDest = path.join(buildPath, 'node_modules', dep);
                if (fs.existsSync(depSrc) && !fs.existsSync(depDest)) {
                  copyDirSync(depSrc, depDest);
                }
              }
            }
          }
          // Ensure spawn-helper binaries are executable (npm strips the bit)
          fixExecPerms(path.join(buildPath, 'node_modules'));
          callback();
        } catch (err) {
          callback(err);
        }
      },
    ],
  },
  makers: [
    { name: '@electron-forge/maker-zip' },
    { name: '@electron-forge/maker-dmg' },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          { entry: 'src/main/index.js', config: 'vite.main.config.mjs' },
          { entry: 'src/preload.js', config: 'vite.preload.config.mjs' },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
  ],
};
