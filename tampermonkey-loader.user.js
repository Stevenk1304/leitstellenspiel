// ==UserScript==
// @name         LSS Skripte (lokal)
// @version      1.3.0
// @description  Lädt die eigenen Leitstellenspiel-Skripte direkt aus C:\Users\steve\Documents\GitHub\leitstellenspiel\skripte
// @match        https://www.leitstellenspiel.de/*
// @match        https://leitstellenspiel.de/*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.lss-manager.de
// @run-at       document-idle
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/skripte/gemeinsam.js
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/skripte/fahrzeuge-umbenennen.js
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/skripte/personal-zuweisen.js
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/skripte/wachen-check.js
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/skripte/fahrzeug-uebersicht.js
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/skripte/personal-werben.js
// @require      file:///C:/Users/steve/Documents/GitHub/leitstellenspiel/skripte/auslastung.js
// ==/UserScript==

// Der eigentliche Code steht in den Dateien unter @require.
// Damit Tampermonkey sie lesen darf, muss in brave://extensions bei Tampermonkey
// "Zugriff auf Datei-URLs zulassen" eingeschaltet sein.
