# Leitstellenspiel-Skripte

Eigene Tampermonkey-Skripte für leitstellenspiel.de.

| Datei | Funktion |
|---|---|
| `skripte/gemeinsam.js` | Gemeinsame Hilfsfunktionen und Fenster-Design (muss zuerst geladen werden) |
| `skripte/fahrzeuge-umbenennen.js` | Fahrzeuge nach dem Muster `RTW-1 \| Wache` umbenennen |
| `skripte/personal-zuweisen.js` | Fahrzeuge mit passendem freiem Personal der Wache auffüllen |

## Einrichtung (einmalig)

1. `brave://extensions` → Tampermonkey → **Details** → **„Zugriff auf Datei-URLs zulassen“** einschalten.
2. In Tampermonkey ein neues Userscript erstellen, den Inhalt von `tampermonkey-loader.user.js` einfügen und speichern.
3. Die einzeln installierte Version von „LSS Fahrzeuge umbenennen“ in Tampermonkey löschen.

Danach werden die Dateien in `skripte/` bei jedem Laden von Leitstellenspiel frisch gelesen.
Änderungen sind nach **Strg + F5** aktiv.

Nur wenn ein **neues Skript** dazukommt, muss das Lade-Skript in Tampermonkey einmal neu eingefügt werden
(neue `@require`-Zeile).
