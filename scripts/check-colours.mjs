#!/usr/bin/env node
// Fails when a colour literal appears anywhere under src except src/ui/design/tokens.css (step 5.2, ADR-014, UI_ARCHITECTURE §3):
// colours are tokens, used as var(--color-*). Checked: hex colours, rgb()/hsl()/hwb()/lab()/lch()/oklab()/oklch()/color() functions
// and CSS named colours in colour properties of every .css file under src; hex colours in string literals and the colour functions in
// the presentation code (.ts/.tsx under src/ui, src/app, src/features, src/render; tests excluded). `color-mix()` of tokens is allowed.
// src/chem/svg is not presentation code: it holds the SVG sanitiser's value grammar.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const TOKEN_FILE = join('src', 'ui', 'design', 'tokens.css');
const CODE_ROOTS = ['ui', 'app', 'features', 'render'].map((name) => join('src', name) + sep);
const FUNCTIONS = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const QUOTED_HEX = /['"`]#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})['"`]/;
const COLOUR_PROPERTY = /(?:^|[;{\s])(?:color|background(?:-color|-image)?|border(?:-[a-z]+)*|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|text-decoration(?:-color)?|caret-color|accent-color|column-rule(?:-color)?)\s*:\s*([^;}]*)/gi;
const NAMED = new Set(
  ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '),
);

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const stripCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

function cssProblems(text) {
  const found = [];
  stripCssComments(text).split('\n').forEach((line, index) => {
    if (HEX.test(line)) found.push([index + 1, 'hex colour']);
    else if (FUNCTIONS.test(line)) found.push([index + 1, 'colour function']);
    else {
      for (const match of line.matchAll(COLOUR_PROPERTY)) {
        const word = match[1].toLowerCase().split(/[\s,()/]+/).find((w) => NAMED.has(w));
        if (word !== undefined) { found.push([index + 1, `named colour "${word}"`]); break; }
      }
    }
  });
  return found;
}

function codeProblems(text) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (QUOTED_HEX.test(line)) found.push([index + 1, 'hex colour in a string']);
    else if (FUNCTIONS.test(line)) found.push([index + 1, 'colour function']);
  });
  return found;
}

let failures = 0;
for (const file of walk('src')) {
  const rel = relative(process.cwd(), file);
  if (rel === TOKEN_FILE) continue;
  const ext = extname(file);
  let problems = [];
  if (ext === '.css') problems = cssProblems(readFileSync(file, 'utf8'));
  else if ((ext === '.ts' || ext === '.tsx') && !/\.(test|bench)\.tsx?$/.test(file) && CODE_ROOTS.some((root) => rel.startsWith(root))) problems = codeProblems(readFileSync(file, 'utf8'));
  for (const [line, what] of problems) {
    failures += 1;
    console.error(`✖ ${rel}:${line}: ${what}; use a token from ${TOKEN_FILE} (var(--color-...)).`);
  }
}
if (failures > 0) process.exit(1);
console.log('check:colours ok (no colour literal outside the token file)');
