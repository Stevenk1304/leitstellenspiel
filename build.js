// Fasst alle Skripte aus skripte/ zu dist/lss-skripte.js zusammen, damit das Lade-Skript in
// Tampermonkey nur diese eine Datei laden muss und nie mehr geändert werden muss.
// Aufruf: node build.js   (nach jeder Änderung an skripte/)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, 'skripte');
const OUT = path.join(__dirname, 'dist', 'lss-skripte.js');

// Muss als erstes geladen werden (stellt "lss" bereit), Themes direkt danach, damit die Farben sofort stimmen
const FIRST = ['gemeinsam.js', 'themes.js'];
// Feste Reihenfolge für die bestehenden Werkzeuge; neue Dateien kommen alphabetisch dahinter
const ORDER = [
    'fahrzeuge-umbenennen.js', 'personal-zuweisen.js', 'wachen-check.js', 'fahrzeug-uebersicht.js',
    'personal-werben.js', 'auslastung.js', 'einsatz-helfer.js', 'dashboard.js', 'kauf-berater.js', 'sprechwunsch.js',
];
// Brauchen die Liste aller Werkzeuge, deshalb zum Schluss
const LAST = ['schnellstart.js', 'changelog.js'];

const all = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const known = new Set([...FIRST, ...ORDER, ...LAST]);
const extra = all.filter(f => !known.has(f)).sort();
const files = [...FIRST, ...ORDER, ...extra, ...LAST].filter(f => all.includes(f));

const missing = [...known].filter(f => !all.includes(f));
if (missing.length) console.warn('Hinweis: nicht gefunden (übersprungen):', missing.join(', '));

const header = [
    '// AUTOMATISCH ERZEUGT von build.js – nicht von Hand bearbeiten, Änderungen gehören nach skripte/.',
    `// Enthält: ${files.join(', ')}`,
    '',
].join('\n');

// Startzeile jeder Datei im Ergebnis merken, damit der Fehler-Melder Zeilennummern zurückrechnen kann
let line = header.split('\n').length;
const starts = [];
const parts = files.map(f => {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8').trimEnd();
    starts.push([f, line + 1]);
    line += code.split('\n').length + 2;
    return `// ===== ${f} =====\n${code}\n`;
});
// Steht ganz am Ende, damit diese Zeile die Zeilennummern davor nicht verschiebt
const map = `\n/* exported LSS_BUILD */\nvar LSS_BUILD = ${JSON.stringify({ built: new Date().toISOString(), files: starts })};\n`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, header + parts.join('\n') + map);

// Syntax prüfen, damit ein Tippfehler nicht erst im Spiel auffällt
execFileSync(process.execPath, ['--check', OUT], { stdio: 'inherit' });
console.log(`✓ ${files.length} Skripte → ${path.relative(__dirname, OUT)}${extra.length ? ` (neu dabei: ${extra.join(', ')})` : ''}`);
