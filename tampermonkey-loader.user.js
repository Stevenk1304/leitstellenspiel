// ==UserScript==
// @name         LSS Skripte (lokal)
// @version      2.0.0
// @description  Lädt die eigenen Leitstellenspiel-Skripte aus C:\Users\steve\Documents\GitHub\leitstellenspiel\dist\lss-skripte.js
// @match        https://www.leitstellenspiel.de/*
// @match        https://leitstellenspiel.de/*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_setClipboard
// @grant        GM_notification
// @connect      api.lss-manager.de
// @run-at       document-idle
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/dist/lss-skripte.js
// ==/UserScript==

// Der eigentliche Code steht in dist/lss-skripte.js. Diese Datei wird von build.js aus allen
// Dateien in skripte/ zusammengesetzt, deshalb muss dieses Lade-Skript bei neuen Skripten nicht
// mehr geändert werden.
// Damit Tampermonkey sie lesen darf, muss in brave://extensions bei Tampermonkey
// "Zugriff auf Datei-URLs zulassen" eingeschaltet sein.
