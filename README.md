# Leitstellenspiel-Skripte

Eigene Tampermonkey-Skripte für leitstellenspiel.de.

| Datei | Funktion |
|---|---|
| `skripte/gemeinsam.js` | Gemeinsame Hilfsfunktionen, Fenster-Design, Werkzeuge-Menü und Fehler-Melder mit 🐞 Fehlerprotokoll (muss zuerst geladen werden) |
| `skripte/fahrzeuge-umbenennen.js` | Fahrzeuge nach dem Muster `RTW-1 \| Wache` umbenennen |
| `skripte/personal-zuweisen.js` | Fahrzeuge mit passendem freiem Personal der Wache auffüllen |
| `skripte/personal-verschieben.js` | 🔀 Personal von einer anderen Wache übernehmen (Filter, Wochenlimit, Rückfrage) |
| `skripte/wachen-check.js` | Übersicht über Probleme an allen Wachen (Personal, Namen, Leitstelle, Ausbauten) |
| `skripte/fahrzeug-uebersicht.js` | Fahrzeuge pro Typ: gesamt, frei, im Einsatz, Sprechwunsch, außer Dienst, ohne Personal |
| `skripte/personal-werben.js` | Personalwerbung (längste Phase, nie Coins) an Wachen mit Personalmangel starten |
| `skripte/auslastung.js` | Belegung der Krankenhäuser und Zellen |
| `skripte/einsatz-helfer.js` | Im Alarmfenster: was der Einsatz braucht, was da ist und was fehlt; „Fehlendes auswählen“ hakt die nächsten passenden Fahrzeuge an |
| `skripte/dashboard.js` | Alle wichtigen Zahlen auf einen Blick, mit Schnellzugriff auf die Werkzeuge |
| `skripte/sprechwunsch.js` | 📻 Bestes Krankenhaus/Zelle bei Sprechwünschen markieren, danach automatisch zum nächsten |
| `skripte/fahrzeugnamen-karte.js` | 🏷️ Fahrzeugnamen auf der Karte dauerhaft ausblenden (abschaltbar) |
| `skripte/themes.js` | 🎨 Farbschema für alle Werkzeuge |
| `skripte/schnellstart.js` | ⭐ Lieblingswerkzeuge als Symbole in der Spiel-Leiste |
| `skripte/changelog.js` | 📰 „Was ist neu?“ und Hinweis nach Updates |
| `skripte/kauf-berater.js` | „Was soll ich kaufen?“: merkt sich Einsätze und Engpässe der letzten 14 Tage und empfiehlt Fahrzeuge |

Alle Funktionen stehen im Menü **🛠 Werkzeuge** oben in der Spiel-Leiste. Ist gerade eine Wache offen
(auch im Popup), stehen oben die Einträge für diese Wache, darunter die für alle Wachen.

## Installieren (an jedem PC)

1. Tampermonkey im Browser installieren.
2. Diesen Link öffnen und in Tampermonkey auf **Installieren** klicken:
   **https://raw.githubusercontent.com/Stevenk1304/leitstellenspiel/main/dist/lss-skripte.user.js**
3. Leitstellenspiel neu laden. Oben in der Spiel-Leiste erscheint **🛠 Werkzeuge**.

Updates kommen danach von selbst: Tampermonkey schaut regelmäßig nach (Standard: einmal am Tag).
Sofort aktualisieren: Tampermonkey → Übersicht → bei „LSS Skripte“ auf das Datum unter **Zuletzt aktualisiert** klicken,
oder den Link oben noch einmal öffnen.

Wichtig: Nicht gleichzeitig mit dem lokalen Lade-Skript „LSS Skripte (lokal)“ laufen lassen, sonst ist alles doppelt da.

## Lokal entwickeln (optional)

Wer direkt aus dem Ordner testen will, ohne vorher hochzuladen:

1. `brave://extensions` → Tampermonkey → **Details** → **„Zugriff auf Datei-URLs zulassen“** einschalten.
2. In Tampermonkey ein neues Userscript erstellen, den Inhalt von `tampermonkey-loader.user.js` einfügen und speichern
   (Pfad darin an den eigenen Ordner anpassen) und „LSS Skripte“ solange deaktivieren.

Das Lade-Skript lädt nur `dist/lss-skripte.js`.

## Bauen

`dist/lss-skripte.js` (für das lokale Lade-Skript) und `dist/lss-skripte.user.js` (zum Installieren, mit Update-Adresse) werden mit

```bash
node build.js
```

aus allen Dateien in `skripte/` zusammengesetzt (neue Dateien werden automatisch mitgenommen) und dabei
auf Syntaxfehler geprüft. Nach jeder Änderung an `skripte/` also `node build.js` ausführen, dann ist
die Änderung nach **Strg + F5** im Spiel aktiv (lokal). Damit sie an den anderen PCs ankommt: committen und
nach GitHub pushen. Die Version im `.user.js` ergibt sich aus der Bauzeit, jedes neue Build gilt also als Update.

Dateien in `dist/` nie von Hand bearbeiten, Änderungen gehören nach `skripte/`.
