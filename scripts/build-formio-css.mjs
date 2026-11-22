// Builds the front-end assets that only Form.io pages load.
//
//   node scripts/build-formio-css.mjs           build once (npm run build)
//   node scripts/build-formio-css.mjs --watch   build, then rebuild the theme
//                                               when it changes (npm run start:dev)
//
// 1. Vendor files: copies the Form.io files the app needs from node_modules
//    into public/vendor/formio/, so production does not need @formio/js.
// 2. Scoped Bootstrap: compiles assets/styles/formio-theme.scss with Sass,
//    scopes every rule to the Form.io containers, flips it to RTL, and writes
//    public/css/formio-scope.css.
//
// Both outputs are generated and ignored by git.

import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import prefixer from 'postcss-prefix-selector';
import rtlcss from 'rtlcss';
import * as sass from 'sass';

const ROOT = path.resolve(import.meta.dirname, '..');
const FORMIO_DIST = path.join(ROOT, 'node_modules/@formio/js/dist');
const VENDOR_OUT = path.join(ROOT, 'public/vendor/formio');
const THEME_IN = path.join(ROOT, 'assets/styles/formio-theme.scss');
const SCOPE_OUT = path.join(ROOT, 'public/css/formio-scope.css');

// Bootstrap applies only inside these elements. .formio-scope wraps the
// builder/form in our views; the others are popups Form.io appends to <body>.
const SCOPE_ROOTS =
  ':is(.formio-scope, .formio-dialog, .flatpickr-calendar, .tippy-box)';

// ---------------------------------------------------------------- vendor files

// Form.io's CSS ships a <dialog> polyfill for old browsers that styles EVERY
// <dialog> on the page (position, border, padding). The app's own modals are
// <dialog> elements, so drop those rules. Modern browsers do not need them.
const isGlobalDialogSelector = (selector) => /^dialog\b/.test(selector.trim());

const stripGlobalDialogRules = {
  postcssPlugin: 'strip-global-dialog-rules',
  Rule(rule) {
    const kept = rule.selectors.filter((s) => !isGlobalDialogSelector(s));
    if (kept.length === 0) rule.remove();
    else if (kept.length !== rule.selectors.length) rule.selectors = kept;
  },
};

// Form.io's CSS also has rules with generic names that collide with the app's
// Tailwind classes: ".hidden { display: none !important }" hid the app
// sidebar (Tailwind's "hidden lg:flex"). Rules whose first part names a
// Form.io-specific class stay global (the builder's drag preview and popups
// live outside .formio-scope); every other rule is scoped like Bootstrap.
const FORMIO_SPECIFIC =
  /formio|choices|flatpickr|builder|gu-|tippy|ql-|ace_|signature|ck-|drag|drop-|component-|editgrid|datagrid|tree|wizard|bi-|\bbi\b|fa-|glyphicon|lb-|pdf|tableview|field-required|control-label|open-modal|reset-margins/;

function scopeFormioSelector(prefix, selector) {
  const trimmed = selector.trim();
  if (trimmed.startsWith(SCOPE_ROOTS)) return trimmed;
  const first = trimmed.split(/[\s>+~]/)[0];
  if (FORMIO_SPECIFIC.test(first)) return trimmed;

  // [dir=rtl] is on <html>, outside the scope roots: keep it first.
  const dir = trimmed.match(/^\[dir=["']?(?:rtl|ltr)["']?\]\s*/);
  if (dir) {
    return dir[0] + scopeFormioSelector(prefix, trimmed.slice(dir[0].length));
  }
  return scopeSelector(prefix, trimmed);
}

const scopeGenericFormioRules = () =>
  prefixer({
    prefix: SCOPE_ROOTS,
    transform: scopeFormioSelector,
    // @keyframes steps ("0%", "to") are not selectors.
    exclude: [/^\d+(\.\d+)?%$/, 'from', 'to'],
  });

// Keeps only the Bootstrap Icons rules from formio.full.min.css. The renderer
// CSS (formio.form.min.css) does not include the icon font, but forms use it.
const keepOnlyIconRules = {
  postcssPlugin: 'keep-only-icon-rules',
  Once(root) {
    root.walkAtRules((atRule) => {
      if (atRule.name === 'font-face') {
        if (!/bootstrap-icons/.test(atRule.toString())) atRule.remove();
      } else if (atRule.name === 'keyframes') {
        atRule.remove();
      }
    });
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && rule.parent.name === 'font-face') {
        return;
      }
      const isIconRule = rule.selectors.every((s) =>
        /\.bi(-|::|$|\s)|\[class[\^*]=["']?\s?bi-/.test(s),
      );
      if (!isIconRule) rule.remove();
    });
    root.walkAtRules((atRule) => {
      if (atRule.nodes?.length === 0) atRule.remove();
    });
  },
};

async function processCss(file, plugins) {
  const css = fs.readFileSync(path.join(FORMIO_DIST, file), 'utf8');
  const result = await postcss(plugins).process(css, { from: undefined });
  return result.css;
}

async function copyVendorFiles() {
  // Overwrite in place; never delete the folder. Nest copies public/ into
  // dist/public/ and watches it: a deleted-and-recreated folder is no longer
  // watched, so its new files never reached dist/ and were served as 404.
  fs.mkdirSync(VENDOR_OUT, { recursive: true });

  // JS: full = builder + renderer (admin pages), form = renderer only (public).
  for (const file of [
    'formio.full.min.js',
    'formio.full.min.js.LICENSE.txt',
    'formio.form.min.js',
    'formio.form.min.js.LICENSE.txt',
  ]) {
    fs.copyFileSync(path.join(FORMIO_DIST, file), path.join(VENDOR_OUT, file));
  }

  // CSS: builder pages use full; form pages use form + icons.
  const full = await processCss('formio.full.min.css', [
    stripGlobalDialogRules,
    scopeGenericFormioRules(),
  ]);
  const form = await processCss('formio.form.min.css', [
    stripGlobalDialogRules,
    scopeGenericFormioRules(),
  ]);
  const icons = await processCss('formio.full.min.css', [keepOnlyIconRules]);
  fs.writeFileSync(path.join(VENDOR_OUT, 'formio.full.min.css'), full);
  fs.writeFileSync(path.join(VENDOR_OUT, 'formio.form.min.css'), form);
  fs.writeFileSync(path.join(VENDOR_OUT, 'formio-icons.min.css'), icons);

  // Form.io loads some libraries at runtime from cdn.form.io. formio-setup.js
  // points Form.io at /vendor/formio/cdn instead, so nothing comes from an
  // outside server. Date fields need flatpickr (Form.io expects 4.6.13).
  // Form.io waits for window['flatpickr-ar'], so the locale file sets it.
  const flatpickrDist = path.join(ROOT, 'node_modules/flatpickr/dist');
  const flatpickrOut = path.join(VENDOR_OUT, 'cdn/flatpickr-formio');
  fs.mkdirSync(path.join(flatpickrOut, 'l10n'), { recursive: true });
  for (const file of ['flatpickr.min.js', 'flatpickr.min.css']) {
    fs.copyFileSync(
      path.join(flatpickrDist, file),
      path.join(flatpickrOut, file),
    );
  }
  fs.copyFileSync(
    path.join(ROOT, 'node_modules/flatpickr/LICENSE.md'),
    path.join(flatpickrOut, 'LICENSE.md'),
  );
  const arabic = fs.readFileSync(
    path.join(flatpickrDist, 'l10n/ar.js'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(flatpickrOut, 'l10n/flatpickr-ar.js'),
    `${arabic}\nwindow['flatpickr-ar'] = window.flatpickr.l10ns.ar;\n`,
  );

  // Icon font files referenced by the CSS above as url(fonts/...).
  fs.cpSync(path.join(FORMIO_DIST, 'fonts'), path.join(VENDOR_OUT, 'fonts'), {
    recursive: true,
  });
}

// ------------------------------------------------------------ scoped Bootstrap

// :root/html/body rules (Bootstrap's --bs-* variables and base font/color)
// become rules on the scope roots themselves; everything else goes inside them.
function scopeSelector(prefix, selector) {
  // postcss runs this again on rules another plugin changed (rtlcss flips
  // margins/padding), which used to prefix them twice: ":is(..) :is(..) .row".
  if (selector.startsWith(SCOPE_ROOTS)) return selector;

  const pageLevel = /^(:root|html|body)(?=$|[\s.:[>+~])/;
  if (pageLevel.test(selector)) {
    // ":root" -> ":is(...)",  "body.x" -> ":is(...).x"
    return SCOPE_ROOTS + selector.replace(pageLevel, '');
  }
  return `${SCOPE_ROOTS} ${selector}`;
}

async function buildScopedBootstrap() {
  // 1) Sass: Bootstrap source + our theme -> plain CSS. "expanded" keeps
  //    Bootstrap's /* rtl:... */ comments, which rtlcss reads in step 3.
  const compiled = sass.compile(THEME_IN, {
    loadPaths: [path.join(ROOT, 'node_modules')],
    style: 'expanded',
    // Bootstrap 5.3 still uses Sass features newer Sass versions warn about.
    quietDeps: true,
    silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
  });

  // 2) Scope every selector, 3) flip to RTL.
  const processed = await postcss([
    prefixer({ prefix: SCOPE_ROOTS, transform: scopeSelector }),
    rtlcss(),
  ]).process(compiled.css, { from: undefined });

  // 4) Minify by running the plain CSS back through Sass.
  const minified = sass.compileString(processed.css, {
    syntax: 'css',
    style: 'compressed',
  });

  fs.mkdirSync(path.dirname(SCOPE_OUT), { recursive: true });
  fs.writeFileSync(SCOPE_OUT, minified.css);
}

// ----------------------------------------------------------------------- main

async function build() {
  const started = Date.now();
  await buildScopedBootstrap();
  console.log(
    `[formio] public/css/formio-scope.css (${Date.now() - started}ms)`,
  );
}

try {
  await copyVendorFiles();
  console.log('[formio] public/vendor/formio/');
  await build();
} catch (error) {
  console.error('[formio] build failed:', error.message);
  if (!process.argv.includes('--watch')) process.exit(1);
}

if (process.argv.includes('--watch')) {
  let timer;
  fs.watch(THEME_IN, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      build().catch((error) =>
        console.error('[formio] build failed:', error.message),
      );
    }, 100);
  });
  console.log('[formio] watching assets/styles/formio-theme.scss');
}
