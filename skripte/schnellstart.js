// LSS Schnellstart-Leiste
// Symbole der Lieblingswerkzeuge direkt in der Spiel-Leiste neben "Werkzeuge". Auswahl über
// "⭐ Schnellstart anpassen" im Werkzeuge-Menü.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js; muss nach den Werkzeugen stehen.

(function () {
    'use strict';

    const FAV_KEY = 'lss.quickbar';
    const SETTINGS_LABEL = '⭐ Schnellstart anpassen';
    const DEFAULTS = ['📊 Dashboard', '🩺 Wachen-Check (alle Wachen)', '🚑 Fahrzeug-Übersicht (alle Wachen)'];

    const loadFavs = () => { try { return GM_getValue(FAV_KEY, DEFAULTS); } catch (e) { return DEFAULTS; } };
    const saveFavs = favs => { try { GM_setValue(FAV_KEY, favs); } catch (e) { /* kein Speicher */ } };

    // Werkzeuge, die in die Leiste dürfen: alle, die ohne offene Wache funktionieren
    const candidates = () => lss.listTools().filter(t => t.scope === 'all' && t.label !== SETTINGS_LABEL);

    // Das Symbol ist das erste Zeichen-Bündel des Namens, z.B. "📊" aus "📊 Dashboard"
    const iconOf = label => label.split(' ')[0];

    function render() {
        const nav = lss.navMenuItem();
        if (!nav) return;
        nav.parentElement.querySelectorAll('.lssr-quick').forEach(li => li.remove());
        const tools = candidates();
        const favs = loadFavs().map(label => tools.find(t => t.label === label)).filter(Boolean);
        let anchor = nav;
        for (const tool of favs) {
            const li = document.createElement('li');
            li.className = 'lssr-quick';
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = iconOf(tool.label);
            a.title = tool.label.slice(iconOf(tool.label).length).trim();
            a.style.cssText = 'font-size:16px;padding-left:7px;padding-right:7px';
            a.onclick = e => {
                e.preventDefault();
                tool.run();
            };
            li.append(a);
            anchor.after(li);
            anchor = li;
        }
    }

    function showSettings() {
        const favs = loadFavs();
        const e = lss.escapeHtml;
        const panel = lss.openPanel({
            title: '⭐ Schnellstart anpassen',
            count: `${favs.length} gewählt`,
            body: `
                <div style="padding:12px 18px;color:#aab0b8;font-size:13px">Wähle die Werkzeuge, deren Symbol oben in der Spiel-Leiste erscheinen soll.</div>
                <div style="padding:0 18px 12px;display:flex;flex-direction:column;gap:2px">
                    ${candidates().map(t => `
                        <label style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;background:#2a2e34;color:#e6e6e6;font-size:14px;cursor:pointer;margin:0;font-weight:normal">
                            <input type="checkbox" value="${e(t.label)}" ${favs.includes(t.label) ? 'checked' : ''} style="margin:0">
                            <span style="font-size:18px;width:24px;text-align:center">${e(iconOf(t.label))}</span>
                            ${e(t.label.slice(iconOf(t.label).length).trim())}
                        </label>`).join('')}
                </div>`,
        });
        panel.root.addEventListener('change', () => {
            const chosen = [...panel.root.querySelectorAll('input:checked')].map(i => i.value);
            saveFavs(chosen);
            panel.root.closest('.lssr-dialog').querySelector('.lssr-count').textContent = `${chosen.length} gewählt`;
            render();
        });
    }

    if (lss.isWorkerFrame || window !== window.top) return;

    lss.addTool({ label: SETTINGS_LABEL, scope: 'all', order: 91, run: showSettings });
    // Erst zeichnen, wenn alle Skripte ihre Werkzeuge angemeldet haben
    setTimeout(lss.safe('Schnellstart-Leiste', render), 0);
})();
