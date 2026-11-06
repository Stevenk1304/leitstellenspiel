// LSS Themes
// Farbschema für alle eigenen Werkzeuge (Kopfzeilen, Hauptknöpfe, Balken). Warn- und Fehlerfarben bleiben.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const THEME_KEY = 'lss.theme';

    // accent: Hauptfarbe, dark: Ende des Farbverlaufs, light: helles Ende des Fortschrittsbalkens
    const THEMES = {
        feuerwehr: { label: '🚒 Feuerwehr-Rot', accent: '#c9302c', dark: '#8f1f1c', light: '#e8584f' },
        polizei: { label: '🚓 Polizei-Blau', accent: '#1f6fd1', dark: '#0f3f80', light: '#4d94ea' },
        thw: { label: '🚛 THW-Blau', accent: '#1a3fb0', dark: '#0b2266', light: '#4a6fe0' },
        rettung: { label: '🚑 Rettungsdienst-Orange', accent: '#e07b00', dark: '#a35400', light: '#f5a03a' },
        notarzt: { label: '🩺 Notarzt-Grün', accent: '#1f9d61', dark: '#126840', light: '#45c486' },
        nacht: { label: '🌙 Nacht-Violett', accent: '#7b4fd6', dark: '#4a2c8c', light: '#9d7bea' },
        grau: { label: '🪨 Schlicht-Grau', accent: '#5b6270', dark: '#383d46', light: '#848c9a' },
    };

    const current = () => {
        try { return THEMES[GM_getValue(THEME_KEY, 'feuerwehr')] ? GM_getValue(THEME_KEY, 'feuerwehr') : 'feuerwehr'; } catch (e) { return 'feuerwehr'; }
    };

    // Variablen in ein Dokument schreiben (Hauptseite oder Popup-Fenster)
    function applyTo(doc, name) {
        const t = THEMES[name];
        let style = doc.getElementById('lssr-theme');
        if (!style) {
            style = doc.createElement('style');
            style.id = 'lssr-theme';
            (doc.head ?? doc.documentElement).append(style);
        }
        style.textContent = `:root { --lssr-accent:${t.accent}; --lssr-accent-dark:${t.dark}; --lssr-accent-light:${t.light}; }`;
    }

    // Sofort überall umfärben: diese Seite und alle offenen Popup-Fenster des Spiels
    function applyEverywhere(name) {
        applyTo(document, name);
        document.querySelectorAll('iframe').forEach(f => {
            try { if (f.contentDocument) applyTo(f.contentDocument, name); } catch (e) { /* fremdes Fenster */ }
        });
    }

    function showPicker() {
        const active = current();
        const panel = lss.openPanel({
            title: '🎨 Theme wählen',
            count: THEMES[active].label,
            body: `
                <div style="padding:14px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
                    ${Object.entries(THEMES).map(([key, t]) => `
                        <button class="lssr-theme-pick" data-theme="${key}" style="all:unset;cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid ${key === active ? '#fff' : '#3a3f47'};background:#2a2e34">
                            <div style="height:38px;background:linear-gradient(135deg,${t.accent},${t.dark})"></div>
                            <div style="padding:8px 10px;color:#e6e6e6;font-size:13px;font-weight:600">${t.label}${key === active ? ' ✓' : ''}</div>
                        </button>`).join('')}
                </div>
                <div style="padding:0 18px 14px;color:#8b929c;font-size:12px">Warn- und Fehlerfarben (rot, gelb, grün) bleiben in jedem Theme gleich.</div>`,
        });
        panel.root.addEventListener('click', e => {
            const pick = e.target.closest('.lssr-theme-pick');
            if (!pick) return;
            try { GM_setValue(THEME_KEY, pick.dataset.theme); } catch (err) { /* kein Speicher */ }
            applyEverywhere(pick.dataset.theme);
            panel.close();
            showPicker();
        });
    }

    lss.actions.themePicker = showPicker;

    applyTo(document, current());

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '🎨 Theme', scope: 'all', order: 90, run: showPicker });
})();
