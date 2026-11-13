// LSS Changelog: "Was ist neu?"
// Neue Einträge oben ergänzen. Nach einem Update erscheint einmal ein Hinweis mit Link zum Changelog.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const SEEN_KEY = 'lss.changelogSeen';

    // Neueste zuerst; version muss bei jedem neuen Eintrag größer werden
    const CHANGELOG = [
        {
            version: 22, date: '13.11.2026', title: 'Einsatz-Helfer: Bergeinsätze',
            items: [
                '🐛 Fahrzeuge mit Ausrüstung (z.B. GW-Bergrettung mit Drohnen) galten im Einsatz-Helfer als ausgewählt, obwohl sie nicht angehakt waren. Die Häkchen der Ladung werden jetzt nicht mehr als Fahrzeug gezählt',
                '🐕 Die Hundestaffel (Bergrettung) zählt jetzt als Rettungshunde, z.B. bei der Gasexplosion',
            ],
        },
        {
            version: 21, date: '13.11.2026', title: 'Überzählige Fachleute verteilen',
            items: [
                '➕ Neuer Knopf auf der Wachen-Seite und im Werkzeuge-Menü: setzt ausgebildete Leute, von denen die Wache mehr hat als gebraucht (z.B. 6 Notärzte für 1 NEF), auch auf freie Plätze anderer Fahrzeuge',
                'Fragt vorher nach; für Fahrzeuge mit Ausbildungspflicht bleiben immer genug übrig',
            ],
        },
        {
            version: 20, date: '08.11.2026', title: 'Personal gleichmäßig verteilen',
            items: [
                '⚖️ Personal zuweisen verteilt freie Leute jetzt gleichmäßig auf LF, HLF, MTW usw. einer Wache, statt die ersten Fahrzeuge voll zu machen und die letzten leer zu lassen',
                '♻️ Personal umsortieren nimmt dafür auch Leute von vollen Fahrzeugen (z.B. HLF mit 9) und gibt sie leeren (z.B. neue LF)',
                'Fahrzeuge mit Ausbildungspflicht (NEF, ELW 2, Werkfeuerwehr …) werden weiterhin zuerst und ganz gefüllt',
            ],
        },
        {
            version: 19, date: '08.11.2026', title: 'Sprechwunsch-Helfer: Zellen im Fahrzeugfenster',
            items: [
                '🚔 Auch im Fahrzeugfenster („Zelle wählen“) wird jetzt die beste Zelle markiert und kann mit „Anfahren“ direkt gewählt werden',
                '⏭ Nach dem Anfahren geht es immer automatisch zum nächsten Sprechwunsch (der Haken ist weg), auch bei Polizeifahrzeugen',
                '🧾 Bleibt die Automatik irgendwo stehen, erscheint unten rechts ein Hinweis mit den letzten Schritten; Fehlermeldungen des Spiels werden angezeigt',
            ],
        },
        {
            version: 18, date: '07.11.2026', title: 'Einsatz-Helfer liest Patientenwünsche',
            items: [
                '🚑 Patienten werden jetzt richtig gezählt (auch wenn nur „3 Patienten“ dasteht), fehlende RTW erscheinen wieder',
                '🩺 „Wir benötigen: LNA / OrgL / NEF / RTH“ auf den Patienten-Kärtchen wird gelesen: LNA und OrgL je einmal pro Einsatz, NEF und RTH pro Patient',
                '✓ „Fehlendes auswählen“ hakt diese Fahrzeuge jetzt mit an',
                '🟥 Die rote Spiel-Meldung „Fehlende Fahrzeuge: …“ wird gelesen: aus „evtl.“ wird dann eine feste Anforderung (z.B. DLK, FwK)',
            ],
        },
        {
            version: 17, date: '07.11.2026', title: 'Personal umsortieren für alle Wachen',
            items: ['♻️ Im Werkzeuge-Menü: „Personal umsortieren (alle Wachen)“ räumt falsch eingeteiltes Fachpersonal an allen Wachen auf einmal auf'],
        },
        {
            version: 16, date: '07.11.2026', title: 'Fahrzeugnamen bleiben aus',
            items: [
                '🏷️ Die Fahrzeugnamen auf der Karte bleiben jetzt dauerhaft ausgeblendet, auch wenn das Spiel sie von selbst wieder einschaltet',
                'Im Werkzeuge-Menü mit „Fahrzeugnamen auf Karte ein/aus“ abschaltbar',
                '🛒 Was soll ich kaufen?: unter jedem Fahrzeug steht jetzt, an welcher Wache man es kaufen kann',
                '👥 Personal zuweisen: ausgebildete Leute (z.B. Wasserschaden/Pumpen) landen nicht mehr auf Fahrzeugen ohne Ausbildungspflicht wie dem GKW',
                '🚛 Anhänger: die Ausbildung, die ein Anhänger braucht (z.B. Anh SwPu, NEA200, Boote), wird jetzt beim Zugfahrzeug berücksichtigt',
                '♻️ Personal umsortieren: nimmt falsch eingeteiltes Fachpersonal von Fahrzeugen und füllt danach alles passend neu auf',
            ],
        },
        {
            version: 15, date: '07.11.2026', title: 'Personal holen',
            items: [
                '🔀 Auf der Wachen-Seite und im Werkzeuge-Menü: Personal von einer anderen Wache übernehmen',
                'Quellwache, Anzahl und Ausbildung wählen; standardmäßig nur Leute, die auf keinem Fahrzeug sitzen',
                'Beachtet das Wochenlimit und das Minimum der Quellwache, fragt vor dem Verschieben nach, nie Coins',
            ],
        },
        {
            version: 14, date: '07.11.2026', title: 'Personal zuweisen direkt in der Wache',
            items: ['👥 Auf der Wachen-Seite gibt es über der Fahrzeugliste wieder den Knopf „Personal zuweisen“ für alle Fahrzeuge dieser Wache'],
        },
        {
            version: 13, date: '06.11.2026', title: 'Sprechwunsch-Helfer für Gefangene',
            items: [
                '🚔 Im Alarmfenster: für jeden FuStW mit Gefangenen wird die beste Zelle markiert (freie Zellen, Entfernung, Abgabe)',
                '⏭ Automatisch weiter: erst alle Gefangenen im selben Einsatz, dann zum nächsten Sprechwunsch – Polizei ins Alarmfenster, Rettungsdienst ins Fahrzeugfenster',
            ],
        },
        {
            version: 12, date: '06.11.2026', title: 'Fehlerbehebungen',
            items: [
                '📻 Sprechwunsch-Helfer: kein Fehler mehr nach dem letzten Sprechwunsch, das Fenster lädt danach neu',
                '📻 Doppelklicks auf „Anfahren“ werden ignoriert',
                '🐞 Fehlerberichte zeigen jetzt die genaue Datei und Zeile statt langer Tampermonkey-Pfade',
            ],
        },
        {
            version: 11, date: '06.11.2026', title: 'Einsatz-Helfer kennt Patienten',
            items: [
                '🚑 Neue Zeile „RTW (x Patienten)“: Rettungsdienst-Einsätze wie „Person auf Laub ausgerutscht“ zeigen jetzt, dass ein RTW fehlt',
                '✓ „Fehlendes auswählen“ hakt dafür den nächsten RTW an (KTW nur, wo das Spiel es erlaubt)',
                '📏 Entfernungen wie „01 Min. 22 Sek.“ werden jetzt genau gelesen, das nächste Fahrzeug stimmt wieder',
                '🏥 Transport-Wahrscheinlichkeit und Fachrichtung stehen jetzt in der Infozeile',
            ],
        },
        {
            version: 10, date: '06.11.2026', title: 'Sprechwunsch-Helfer',
            items: [
                '📻 Im Fahrzeugfenster mit Sprechwunsch: bestes Krankenhaus bzw. beste Zelle markiert (Fachabteilung, freie Plätze, Entfernung, Abgabe)',
                '⏭ Nach dem Anfahren automatisch zum nächsten Sprechwunsch (abschaltbar)',
            ],
        },
        {
            version: 9, date: '06.11.2026', title: 'Themes, Schnellstart-Leiste und Changelog',
            items: [
                '🎨 Theme: Farbschema für alle Werkzeuge wählen (Feuerwehr, Polizei, THW, Rettungsdienst …)',
                '⭐ Schnellstart-Leiste: Lieblingswerkzeuge als Symbol direkt in der Spiel-Leiste',
                '📰 Was ist neu?: dieses Fenster',
                'Alle Skripte werden jetzt aus einer Datei geladen: das Lade-Skript muss nie wieder geändert werden',
            ],
        },
        {
            version: 8, date: '06.11.2026', title: 'Fehler-Melder und Kauf-Berater',
            items: [
                '🐞 Fehler erscheinen unten rechts mit kopierbarem Bericht, dazu ein Fehlerprotokoll',
                '🛒 Was soll ich kaufen?: Empfehlungen aus deinen Einsätzen und Engpässen der letzten 14 Tage',
            ],
        },
        {
            version: 7, date: '06.11.2026', title: 'Dashboard und „Fehlendes auswählen“',
            items: [
                '📊 Dashboard mit Credits, Einsätzen, freien Fahrzeugen, Sprechwünschen und Wachen-Check',
                '✓ Einsatz-Helfer hakt die nächsten passenden Fahrzeuge für alles Fehlende an',
            ],
        },
        {
            version: 6, date: '06.11.2026', title: 'Einsatz-Helfer',
            items: [
                '🧭 Im Alarmfenster: Soll, vor Ort, Anfahrt, gewählt und was fehlt',
                'Mindestpersonal je Organisation, Wasser/Schaum, Wahrscheinlichkeiten, Credits und Patienten',
            ],
        },
        {
            version: 5, date: '06.11.2026', title: 'Übersichten und Personalwerbung',
            items: [
                '🚑 Fahrzeug-Übersicht nach Typ',
                '📣 Personalwerbung an Wachen mit Personalmangel (nie Coins)',
                '🏥 Krankenhaus- und Zellen-Auslastung',
            ],
        },
        {
            version: 4, date: '06.11.2026', title: 'Wachen-Check und Werkzeuge-Menü',
            items: ['🩺 Wachen-Check für alle Wachen', '🛠 Werkzeuge-Menü oben in der Spiel-Leiste'],
        },
        {
            version: 3, date: '06.11.2026', title: 'Personal zuweisen',
            items: ['👥 Fahrzeuge mit passendem freiem Personal auffüllen'],
        },
        {
            version: 2, date: '06.11.2026', title: 'Fahrzeuge umbenennen',
            items: ['✎ Fahrzeuge nach dem Muster „RTW-1 | Wache“ umbenennen'],
        },
    ];

    const latest = CHANGELOG[0].version;
    const seen = () => { try { return GM_getValue(SEEN_KEY, 0); } catch (e) { return latest; } };
    const markSeen = () => { try { GM_setValue(SEEN_KEY, latest); } catch (e) { /* kein Speicher */ } };

    function showChangelog() {
        const last = seen();
        const e = lss.escapeHtml;
        lss.openPanel({
            title: '📰 Was ist neu?',
            count: `${CHANGELOG.length} Updates`,
            body: `
                <div style="overflow:auto;flex:1;padding:6px 18px 16px">
                    ${CHANGELOG.map(c => `
                        <div style="padding:12px 0;border-bottom:1px solid #2e3238">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                <b style="color:#fff;font-size:15px">${e(c.title)}</b>
                                ${c.version > last ? '<span style="background:var(--lssr-accent,#c9302c);color:#fff;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700">NEU</span>' : ''}
                                <span style="color:#8b929c;font-size:12px;margin-left:auto">${e(c.date)}</span>
                            </div>
                            <ul style="margin:6px 0 0;padding-left:20px;color:#cfd3d8;font-size:13px;line-height:1.6">
                                ${c.items.map(i => `<li>${e(i)}</li>`).join('')}
                            </ul>
                        </div>`).join('')}
                </div>`,
        });
        markSeen();
    }

    // Einmaliger Hinweis unten rechts, wenn es etwas Neues gibt
    function notifyIfNew() {
        if (seen() >= latest) return;
        lss.injectStyle();
        const note = document.createElement('div');
        note.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100000;background:#22252a;color:#e6e6e6;border:1px solid #3a3f47;border-left:4px solid var(--lssr-accent,#c9302c);border-radius:8px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.5);font:13px "Helvetica Neue",Arial,sans-serif;max-width:340px';
        note.innerHTML = `<b style="color:#fff;display:block;margin-bottom:4px">📰 Neu: ${lss.escapeHtml(CHANGELOG[0].title)}</b>
            <button class="lssr-btn lssr-btn-primary" style="padding:4px 10px;font-size:12px;margin-right:6px">Anzeigen</button>
            <button class="lssr-btn lssr-btn-ghost" style="padding:4px 10px;font-size:12px">Später</button>`;
        const [show, later] = note.querySelectorAll('button');
        show.onclick = () => { note.remove(); showChangelog(); };
        later.onclick = () => { note.remove(); markSeen(); };
        document.body.append(note);
    }

    lss.actions.changelog = showChangelog;

    if (lss.isWorkerFrame || window !== window.top) return;

    lss.addTool({ label: '📰 Was ist neu?', scope: 'all', order: 92, run: showChangelog });
    setTimeout(lss.safe('Changelog', notifyIfNew), 1500);
})();
