// Fasst alle Skripte aus skripte/ zu dist/lss-skripte.js zusammen, damit das Lade-Skript in
// Tampermonkey nur diese eine Datei laden muss und nie mehr geändert werden muss.
// Aufruf: node build.js   (nach jeder Änderung an skripte/)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, 'skripte');
const OUT = path.join(__dirname, 'dist', 'lss-skripte.js');
const USER_OUT = path.join(__dirname, 'dist', 'lss-skripte.user.js');
const META_OUT = path.join(__dirname, 'dist', 'lss-skripte.meta.js');
// Öffentliche Adresse der Dateien im GitHub-Repo (Branch main)
const RAW = 'https://raw.githubusercontent.com/Stevenk1304/leitstellenspiel/main';

// Muss als erstes geladen werden (stellt "lss" bereit), Themes direkt danach, damit die Farben sofort stimmen
const FIRST = ['gemeinsam.js', 'themes.js'];
// Feste Reihenfolge für die bestehenden Werkzeuge; neue Dateien kommen alphabetisch dahinter
const ORDER = [
    'fahrzeuge-umbenennen.js', 'personal-zuweisen.js', 'personal-verschieben.js', 'wachen-check.js', 'fahrzeug-uebersicht.js',
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
const built = new Date();
const map = (offset = 0) => `\n/* exported LSS_BUILD */\nvar LSS_BUILD = ${JSON.stringify({
    built: built.toISOString(),
    files: starts.map(([f, start]) => [f, start + offset]),
})};\n`;
const body = header + parts.join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body + map());

// Installierbare Fassung für Tampermonkey aus dem öffentlichen GitHub-Repo. Die Version kommt aus der
// Bauzeit, damit Tampermonkey jedes neue Build als Update erkennt und von selbst nachlädt.
const pad = n => String(n).padStart(2, '0');
const version = `3.${built.getFullYear()}${pad(built.getMonth() + 1)}${pad(built.getDate())}.${pad(built.getHours())}${pad(built.getMinutes())}`;
const userHeader = [
    '// ==UserScript==',
    '// @name         LSS Skripte',
    '// @namespace    https://github.com/Stevenk1304/leitstellenspiel',
    `// @version      ${version}`,
    '// @description  Eigene Werkzeuge für leitstellenspiel.de (Menü 🛠 Werkzeuge in der Spiel-Leiste)',
    '// @match        https://www.leitstellenspiel.de/*',
    '// @match        https://leitstellenspiel.de/*',
    '// @grant        GM_registerMenuCommand',
    '// @grant        GM_xmlhttpRequest',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @grant        GM_deleteValue',
    '// @grant        GM_listValues',
    '// @grant        GM_setClipboard',
    '// @grant        GM_notification',
    '// @connect      api.lss-manager.de',
    '// @run-at       document-idle',
    `// @updateURL    ${RAW}/dist/lss-skripte.meta.js`,
    `// @downloadURL  ${RAW}/dist/lss-skripte.user.js`,
    '// ==/UserScript==',
    '',
].join('\n');
fs.writeFileSync(USER_OUT, userHeader + body + map(userHeader.split('\n').length - 1));
// Nur der Kopf: Tampermonkey fragt damit kurz nach, ob es eine neue Version gibt
fs.writeFileSync(META_OUT, userHeader);

// Syntax prüfen, damit ein Tippfehler nicht erst im Spiel auffällt
execFileSync(process.execPath, ['--check', OUT], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', USER_OUT], { stdio: 'inherit' });
console.log(`✓ ${files.length} Skripte → ${path.relative(__dirname, OUT)} und ${path.relative(__dirname, USER_OUT)} (Version ${version})${extra.length ? ` (neu dabei: ${extra.join(', ')})` : ''}`);
