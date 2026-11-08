// AUTOMATISCH ERZEUGT von build.js – nicht von Hand bearbeiten, Änderungen gehören nach skripte/.
// Enthält: gemeinsam.js, themes.js, fahrzeuge-umbenennen.js, personal-zuweisen.js, personal-verschieben.js, wachen-check.js, fahrzeug-uebersicht.js, personal-werben.js, auslastung.js, einsatz-helfer.js, dashboard.js, kauf-berater.js, sprechwunsch.js, fahrzeugnamen-karte.js, schnellstart.js, changelog.js
// ===== gemeinsam.js =====
// Gemeinsame Hilfsfunktionen und das Fenster-Design für alle LSS-Skripte.
// Muss im Lade-Skript als erstes @require stehen.

/* exported lss */
const lss = (() => {
    'use strict';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content;

    // Kurzer Cache, damit mehrere Skripte direkt nacheinander nicht dieselben Daten doppelt laden
    const jsonCache = {};
    const getJSON = url => {
        const hit = jsonCache[url];
        if (hit && Date.now() - hit.time < 10000) return hit.promise;
        const promise = fetch(url, { credentials: 'include' }).then(r => {
            if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
            return r.json();
        });
        promise.catch(() => delete jsonCache[url]);
        jsonCache[url] = { time: Date.now(), promise };
        return promise;
    };

    // Fahrzeugtypen von der LSSM-API (Kurzname, Besatzung, Ausbildungen), nur einmal pro Seite geladen
    let vehicleTypes;
    const getVehicleTypes = () => vehicleTypes ??= new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.lss-manager.de/de_DE/vehicles',
            onload: r => {
                try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); }
            },
            onerror: reject,
        });
    });

    const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Unsichtbare Hilfsfenster der Skripte selbst sollen keine Knöpfe bekommen
    const isWorkerFrame = window.name === 'lss-worker';

    // ---- Fehler-Melder ----
    // Fehler landen als Hinweis unten rechts (mit Kopier-Knopf) und im Fehlerprotokoll (letzte 30).
    const LOG_KEY = 'lss.errorLog';
    const LOG_MAX = 30;

    const readLog = () => { try { return GM_getValue(LOG_KEY, []); } catch (e) { return []; } };
    const clearLog = () => { try { GM_setValue(LOG_KEY, []); } catch (e) { /* kein Speicher */ } };

    // Zeile in dist/lss-skripte.js → "skripte/datei.js:zeile" (Startzeilen schreibt build.js ans Dateiende)
    function sourceLine(bundleLine) {
        const files = typeof LSS_BUILD !== 'undefined' ? LSS_BUILD.files : null;
        if (!files) return `dist/lss-skripte.js:${bundleLine}`;
        const hit = files.filter(([, start]) => start <= bundleLine).pop();
        return hit ? `skripte/${hit[0]}:${bundleLine - hit[1] + 1}` : `dist/lss-skripte.js:${bundleLine}`;
    }

    // Lokale und Tampermonkey-Pfade aus dem Stack entfernen; Tampermonkey zählt eine Zeile mehr als die Datei
    const cleanStack = stack => String(stack ?? '')
        .split('\n').slice(0, 6)
        .map(l => l
            .replace(/chrome-extension:\/\/\S*?userscript\.html\?\S*?:(\d+):(\d+)/g, (_, ln, col) => `${sourceLine(Number(ln) - 1)}:${col}`)
            .replace(/file:\/\/\/\S*?\/dist\/lss-skripte\.js:(\d+):(\d+)/g, (_, ln, col) => `${sourceLine(Number(ln))}:${col}`)
            .replace(/file:\/\/\/\S*?\/leitstellenspiel\//g, '')
            .trim())
        .join('\n');

    function formatReport(entries) {
        const version = (() => { try { return GM_info.script.version; } catch (e) { return '?'; } })();
        return [
            `LSS-Skripte Fehlerbericht (Lade-Skript ${version})`,
            ...entries.map(en => [
                '',
                `[${new Date(en.time).toLocaleString('de-DE')}] ${en.source}`,
                `Seite: ${en.page}`,
                `Fehler: ${en.message}`,
                en.stack ? `Stack:\n${en.stack}` : '',
            ].filter(Boolean).join('\n')),
        ].join('\n');
    }

    function copyText(text) {
        try { GM_setClipboard(text, 'text'); return true; } catch (e) { /* weiter mit Fallback */ }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    }

    const TOAST_STYLE = `
        .lssr-toasts { position:fixed; right:16px; bottom:16px; z-index:100000; display:flex; flex-direction:column; gap:8px; max-width:min(420px, calc(100vw - 32px)); font-family:"Helvetica Neue",Arial,sans-serif; }
        .lssr-toast { background:#22252a; color:#e6e6e6; border:1px solid #3a3f47; border-left:4px solid #c9302c; border-radius:8px; padding:10px 12px; box-shadow:0 10px 30px rgba(0,0,0,.5); font-size:13px; animation:lssr-fade .15s ease-out; }
        .lssr-toast b { color:#fff; display:block; margin-bottom:3px; }
        .lssr-toast p { margin:0 0 8px; color:#aab0b8; word-break:break-word; }
        .lssr-toast .lssr-btn { padding:4px 10px; font-size:12px; margin-right:6px; }
    `;

    function showToast(entry) {
        injectStyle();
        if (!document.getElementById('lssr-toast-style')) {
            const style = document.createElement('style');
            style.id = 'lssr-toast-style';
            style.textContent = TOAST_STYLE;
            document.head.append(style);
        }
        let box = document.querySelector('.lssr-toasts');
        if (!box) {
            box = document.createElement('div');
            box.className = 'lssr-toasts';
            document.body.append(box);
        }
        // Höchstens drei Hinweise gleichzeitig
        while (box.children.length >= 3) box.firstElementChild.remove();
        const toast = document.createElement('div');
        toast.className = 'lssr-toast';
        toast.innerHTML = `
            <b>⚠ Fehler in „${escapeHtml(entry.source)}“</b>
            <p>${escapeHtml(entry.message)}</p>
            <button class="lssr-btn lssr-btn-primary">📋 Bericht kopieren</button>
            <button class="lssr-btn lssr-btn-ghost">Schließen</button>`;
        const [copyBtn, closeBtn] = toast.querySelectorAll('button');
        copyBtn.onclick = () => { copyBtn.textContent = copyText(formatReport([entry])) ? '✓ Kopiert, jetzt bei Claude einfügen' : 'Kopieren ging nicht'; };
        closeBtn.onclick = () => toast.remove();
        box.append(toast);
        setTimeout(() => toast.remove(), 30000);
    }

    // source: welches Werkzeug, error: Error oder Text
    function report(source, error) {
        const entry = {
            time: Date.now(),
            source,
            message: error?.message ?? String(error),
            stack: cleanStack(error?.stack),
            page: location.pathname,
        };
        console.error(`[LSS-Skripte] ${source}:`, error);
        try { GM_setValue(LOG_KEY, [entry, ...readLog()].slice(0, LOG_MAX)); } catch (e) { /* kein Speicher */ }
        if (!isWorkerFrame && document.body) showToast(entry);
    }

    // Funktion so einpacken, dass Fehler (auch in async-Funktionen) gemeldet statt verschluckt werden
    const safe = (source, fn) => (...args) => {
        try {
            const result = fn(...args);
            if (result?.catch) result.catch(e => report(source, e));
            return result;
        } catch (e) {
            report(source, e);
            return undefined;
        }
    };

    // Unbehandelte Fehler, deren Stack auf eines der eigenen Skripte zeigt
    const ours = stack => /lss-skripte\.js|skripte\/|LSS-Skripte|LSS Skripte/.test(String(stack ?? ''));
    window.addEventListener('error', e => { if (ours(e.error?.stack ?? e.filename)) report('Unbekannt', e.error ?? e.message); });
    window.addEventListener('unhandledrejection', e => { if (ours(e.reason?.stack)) report('Unbekannt', e.reason); });

    const STYLE = `
        .lssr-overlay { position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center;
            background:rgba(0,0,0,.65); backdrop-filter:blur(2px); font-family:"Helvetica Neue",Arial,sans-serif; animation:lssr-fade .15s ease-out; }
        .lssr-dialog { width:min(640px,94vw); max-height:86vh; display:flex; flex-direction:column; overflow:hidden;
            background:#22252a; color:#e6e6e6; border:1px solid #3a3f47; border-radius:10px; box-shadow:0 20px 60px rgba(0,0,0,.6); }
        .lssr-head { display:flex; align-items:center; gap:10px; padding:14px 18px; background:linear-gradient(135deg,var(--lssr-accent,#c9302c),var(--lssr-accent-dark,#8f1f1c)); color:#fff; }
        .lssr-head h3 { margin:0; font-size:17px; font-weight:600; flex:1; }
        .lssr-count { background:rgba(255,255,255,.2); border-radius:999px; padding:2px 10px; font-size:13px; font-weight:600; }
        .lssr-x { background:none; border:0; color:#fff; font-size:22px; line-height:1; cursor:pointer; opacity:.8; padding:0 2px; }
        .lssr-x:hover { opacity:1; }
        .lssr-list { overflow:auto; flex:1; padding:6px 0; }
        .lssr-row { display:grid; grid-template-columns:minmax(0,1fr) 22px minmax(0,1.4fr) 30px; align-items:center; gap:8px;
            padding:8px 18px; border-bottom:1px solid #2e3238; font-size:14px; transition:background .2s; }
        .lssr-row:last-child { border-bottom:0; }
        .lssr-row:hover { background:#2a2e34; }
        .lssr-old { color:#8b929c; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lssr-arrow { color:var(--lssr-accent,#c9302c); text-align:center; font-weight:700; }
        .lssr-new { color:#fff; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lssr-state { min-width:22px; height:22px; padding:0 4px; box-sizing:border-box; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; }
        .lssr-row.busy .lssr-state { width:22px; border:2px solid #555; border-top-color:var(--lssr-accent,#c9302c); animation:lssr-spin .7s linear infinite; }
        .lssr-row.ok { background:rgba(46,160,67,.08); }
        .lssr-row.ok .lssr-state { background:#2ea043; color:#fff; }
        .lssr-row.skip .lssr-state { background:#3a3f47; color:#aab0b8; }
        .lssr-row.err { background:rgba(201,48,44,.12); }
        .lssr-row.err .lssr-state { background:#c9302c; color:#fff; cursor:help; }
        .lssr-empty { padding:30px 18px; text-align:center; color:#8b929c; }
        .lssr-foot { padding:12px 18px 16px; border-top:1px solid #3a3f47; background:#1c1f23; }
        .lssr-bar { height:6px; background:#33373e; border-radius:999px; overflow:hidden; margin-bottom:10px; display:none; }
        .lssr-bar > div { height:100%; width:0; background:linear-gradient(90deg,var(--lssr-accent,#c9302c),var(--lssr-accent-light,#e8584f)); transition:width .25s; }
        .lssr-status { font-size:13px; color:#aab0b8; min-height:18px; margin-bottom:12px; }
        .lssr-status.done { color:#5cd178; font-weight:600; }
        .lssr-actions { display:flex; gap:8px; justify-content:flex-end; }
        .lssr-btn { border:0; border-radius:6px; padding:8px 16px; font-size:14px; font-weight:600; cursor:pointer; transition:filter .15s, opacity .15s; }
        .lssr-btn:hover:not(:disabled) { filter:brightness(1.15); }
        .lssr-btn:disabled { opacity:.45; cursor:default; }
        .lssr-btn-ghost { background:#33373e; color:#e6e6e6; }
        .lssr-btn-primary { background:var(--lssr-accent,#c9302c); color:#fff; }
        @keyframes lssr-spin { to { transform:rotate(360deg); } }
        @keyframes lssr-fade { from { opacity:0; } }
    `;

    function injectStyle() {
        if (document.getElementById('lssr-style')) return;
        const style = document.createElement('style');
        style.id = 'lssr-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    // Fenster mit Liste "links → rechts" und Start-Knopf.
    // run(api) wird beim Klick auf Start aufgerufen und arbeitet die Zeilen ab.
    function openDialog({ title, count, rows, empty, hint, startLabel, run }) {
        injectStyle();
        const overlay = document.createElement('div');
        overlay.className = 'lssr-overlay';
        overlay.innerHTML = `
            <div class="lssr-dialog">
                <div class="lssr-head">
                    <h3>${escapeHtml(title)}</h3>
                    <span class="lssr-count">${escapeHtml(count)}</span>
                    <button class="lssr-x" title="Schließen">×</button>
                </div>
                <div class="lssr-list">${rows.length
                    ? rows.map((r, i) => `
                        <div class="lssr-row" data-row="${i}">
                            <span class="lssr-old" title="${escapeHtml(r.left)}">${escapeHtml(r.left)}</span>
                            <span class="lssr-arrow">→</span>
                            <span class="lssr-new" title="${escapeHtml(r.right)}">${escapeHtml(r.right)}</span>
                            <span class="lssr-state"></span>
                        </div>`).join('')
                    : `<div class="lssr-empty">✔ ${escapeHtml(empty)}</div>`}
                </div>
                <div class="lssr-foot">
                    <div class="lssr-bar"><div></div></div>
                    <div class="lssr-status">${rows.length ? escapeHtml(hint) : ''}</div>
                    <div class="lssr-actions">
                        <button class="lssr-btn lssr-btn-ghost lssr-close">Schließen</button>
                        <button class="lssr-btn lssr-btn-primary lssr-start" ${rows.length ? '' : 'disabled'}>${escapeHtml(startLabel)}</button>
                    </div>
                </div>
            </div>`;
        document.body.append(overlay);

        const status = overlay.querySelector('.lssr-status');
        const bar = overlay.querySelector('.lssr-bar');
        const startBtn = overlay.querySelector('.lssr-start');
        const closeBtn = overlay.querySelector('.lssr-close');
        const rowEl = i => overlay.querySelector(`[data-row="${i}"]`);
        let running = false, finished = false, cancelled = false;

        const close = () => {
            cancelled = true;
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            if (finished) location.reload();
        };
        const onKey = e => { if (e.key === 'Escape' && !running) close(); };
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.lssr-x').onclick = close;
        closeBtn.onclick = close;
        overlay.onclick = e => { if (e.target === overlay && !running) close(); };

        const api = {
            cancelled: () => cancelled,
            busy(i) {
                rowEl(i).classList.add('busy');
                rowEl(i).scrollIntoView({ block: 'nearest' });
            },
            // state: 'ok' | 'skip' | 'err'
            done(i, state, badge, tooltip = '') {
                const row = rowEl(i);
                row.classList.remove('busy');
                row.classList.add(state);
                row.querySelector('.lssr-state').textContent = badge;
                row.querySelector('.lssr-state').title = tooltip;
            },
            setRight(i, text) {
                const el = rowEl(i).querySelector('.lssr-new');
                el.textContent = text;
                el.title = text;
            },
            progress(doneCount, text) {
                bar.firstElementChild.style.width = `${(doneCount / rows.length) * 100}%`;
                status.textContent = text;
            },
        };

        startBtn.onclick = async () => {
            running = true;
            startBtn.disabled = true;
            closeBtn.textContent = 'Abbrechen';
            bar.style.display = 'block';
            let summary;
            try {
                summary = await run(api);
            } catch (e) {
                summary = `Abgebrochen: ${e.message}`;
                report(title, e);
            }
            running = false;
            finished = true;
            status.classList.add('done');
            status.textContent = summary;
            closeBtn.textContent = 'Schließen & neu laden';
            closeBtn.classList.replace('lssr-btn-ghost', 'lssr-btn-primary');
            startBtn.style.display = 'none';
        };
    }

    // Einfacher Knopf auf einer Spielseite (z.B. in der Personalzuweisung)
    function addPageButton(target, label, onClick) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-xs btn-danger';
        btn.textContent = label;
        btn.style.cssText = 'margin:6px 6px 6px 0;font-weight:600;border-radius:4px';
        btn.onclick = e => {
            e.preventDefault();
            onClick();
        };
        target.before(btn);
    }

    // Werkzeug-Menü oben in der Spiel-Leiste.
    // scope 'building': nur sichtbar, wenn gerade eine Wache offen ist, run(buildingId)
    // scope 'all': immer sichtbar, run()
    const tools = [];
    let navItem;

    // Welche Wache ist gerade offen? Entweder die Seite selbst oder ein Popup-Fenster des Spiels
    function currentBuilding() {
        const windows = [window, ...[...document.querySelectorAll('iframe')]
            .filter(f => f.name !== 'lss-worker' && f.offsetParent !== null)
            .map(f => { try { return f.contentWindow; } catch (e) { return null; } })
            .filter(Boolean)];
        for (const w of windows.reverse()) {
            try {
                const m = w.location.pathname.match(/^\/buildings\/(\d+)\/?$/);
                if (m) return { id: Number(m[1]), name: w.document.querySelector('h1')?.textContent.trim() || 'Diese Wache' };
            } catch (e) { /* fremdes Fenster */ }
        }
        return null;
    }

    function fillNavMenu(list) {
        const building = currentBuilding();
        const sorted = [...tools].sort((a, b) => a.order - b.order);
        const entry = (tool, arg) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = tool.label;
            a.onclick = e => {
                e.preventDefault();
                navItem.classList.remove('open');
                tool.run(arg);
            };
            li.append(a);
            return li;
        };
        const header = text => {
            const li = document.createElement('li');
            li.className = 'dropdown-header';
            li.textContent = text;
            return li;
        };
        list.innerHTML = '';
        const own = sorted.filter(t => t.scope === 'building');
        if (building && own.length) {
            list.append(header(building.name), ...own.map(t => entry(t, building.id)));
            const divider = document.createElement('li');
            divider.className = 'divider';
            divider.setAttribute('role', 'separator');
            list.append(divider);
        }
        list.append(header('Alle Wachen'), ...sorted.filter(t => t.scope === 'all').map(t => entry(t)));
    }

    function addTool(tool) {
        if (window !== window.top || isWorkerFrame) return;
        tools.push({ order: 50, scope: 'all', ...tool, run: safe(tool.label, tool.run) });
        if (navItem) return;
        const nav = document.querySelector('#navbar-main-collapse > ul.nav');
        if (!nav) return;
        navItem = document.createElement('li');
        navItem.className = 'dropdown';
        navItem.innerHTML = '<a href="#" class="dropdown-toggle" role="button">🛠 Werkzeuge <span class="caret"></span></a><ul class="dropdown-menu"></ul>';
        // Eigenes Auf-/Zuklappen statt Bootstrap, damit der Inhalt beim Öffnen frisch berechnet wird
        navItem.firstElementChild.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const open = !navItem.classList.contains('open');
            document.querySelectorAll('#navbar-main-collapse .dropdown.open').forEach(d => d.classList.remove('open'));
            if (open) fillNavMenu(navItem.lastElementChild);
            navItem.classList.toggle('open', open);
        };
        document.addEventListener('click', e => { if (!navItem.contains(e.target)) navItem.classList.remove('open'); });
        nav.prepend(navItem);
    }

    // Leeres Fenster im gleichen Design; der Inhalt kommt vom aufrufenden Skript
    function openPanel({ title, count, body }) {
        injectStyle();
        const overlay = document.createElement('div');
        overlay.className = 'lssr-overlay';
        overlay.innerHTML = `
            <div class="lssr-dialog lssr-wide">
                <div class="lssr-head">
                    <h3>${escapeHtml(title)}</h3>
                    <span class="lssr-count">${escapeHtml(count)}</span>
                    <button class="lssr-x" title="Schließen">×</button>
                </div>
                <div class="lssr-body">${body}</div>
            </div>`;
        document.body.append(overlay);
        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        };
        // Nur schließen, wenn kein anderes Fenster (z.B. Umbenennen) darüber liegt
        const onKey = e => {
            if (e.key === 'Escape' && [...document.querySelectorAll('.lssr-overlay')].pop() === overlay) close();
        };
        document.addEventListener('keydown', onKey);
        overlay.querySelector('.lssr-x').onclick = close;
        overlay.onclick = e => { if (e.target === overlay) close(); };
        return { root: overlay.querySelector('.lssr-body'), close };
    }

    // Andere Skripte tragen hier ihre Funktionen ein, damit z.B. der Wachen-Check sie aufrufen kann
    const actions = {};

    // Fehlerprotokoll: die letzten gespeicherten Fehler mit Kopier- und Leeren-Knopf
    function showLog() {
        const entries = readLog();
        const panel = openPanel({
            title: '🐞 Fehlerprotokoll',
            count: `${entries.length} Fehler`,
            body: `
                <div class="lssr-list" style="padding:10px 18px">${entries.length
                    ? entries.map(en => `
                        <div style="padding:8px 0;border-bottom:1px solid #2e3238;font-size:13px">
                            <div><b style="color:#fff">${escapeHtml(en.source)}</b> <span style="color:#8b929c">· ${new Date(en.time).toLocaleString('de-DE')} · ${escapeHtml(en.page)}</span></div>
                            <div style="color:#ff8a84;margin-top:2px">${escapeHtml(en.message)}</div>
                        </div>`).join('')
                    : '<div class="lssr-empty">✔ Keine Fehler aufgezeichnet.</div>'}
                </div>
                <div class="lssr-foot"><div class="lssr-actions">
                    <button class="lssr-btn lssr-btn-ghost lssr-log-clear" ${entries.length ? '' : 'disabled'}>Protokoll leeren</button>
                    <button class="lssr-btn lssr-btn-primary lssr-log-copy" ${entries.length ? '' : 'disabled'}>📋 Alles kopieren</button>
                </div></div>`,
        });
        panel.root.querySelector('.lssr-log-copy').onclick = e => {
            e.target.textContent = copyText(formatReport(entries)) ? '✓ Kopiert' : 'Kopieren ging nicht';
        };
        panel.root.querySelector('.lssr-log-clear').onclick = () => {
            clearLog();
            panel.close();
            showLog();
        };
    }

    addTool({ label: '🐞 Fehlerprotokoll', scope: 'all', order: 99, run: showLog });

    // Für die Schnellstart-Leiste: alle Werkzeuge und der Menüpunkt in der Spiel-Leiste
    const listTools = () => [...tools].sort((a, b) => a.order - b.order);
    const navMenuItem = () => navItem ?? null;

    return {
        sleep, csrfToken, getJSON, getVehicleTypes, escapeHtml, isWorkerFrame, openDialog, openPanel, addPageButton,
        addTool, listTools, navMenuItem, currentBuilding, injectStyle, actions, report, safe,
    };
})();

// ===== themes.js =====
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

// ===== fahrzeuge-umbenennen.js =====
// LSS Fahrzeuge umbenennen
// Benennt Fahrzeuge nach dem Muster "Typ-Nummer | Wache" um, z.B. "RTW-1 | DRK Sundhausen"
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Pause zwischen zwei Umbenennungen in ms, damit der Server nicht überlastet wird
    const DELAY = 300;

    // Neue Namen berechnen; buildingId = null bedeutet alle Wachen
    async function buildPlan(buildingId) {
        const [vehicles, buildings, types] = await Promise.all([
            lss.getJSON('/api/vehicles'),
            lss.getJSON('/api/buildings'),
            lss.getVehicleTypes(),
        ]);
        const buildingNames = Object.fromEntries(buildings.map(b => [b.id, b.caption]));

        const counters = {};
        return vehicles
            .filter(v => buildingId === null || v.building_id === buildingId)
            .sort((a, b) => a.id - b.id)
            .map(v => {
                // Eigene Fahrzeugklasse hat Vorrang vor dem Standard-Typnamen
                const type = v.vehicle_type_caption || types[v.vehicle_type]?.caption || `Typ ${v.vehicle_type}`;
                const key = `${v.building_id}|${type}`;
                counters[key] = (counters[key] || 0) + 1;
                const newName = `${type}-${counters[key]} | ${buildingNames[v.building_id] ?? ''}`.trim();
                return { id: v.id, oldName: v.caption, newName };
            })
            .filter(p => p.oldName !== p.newName);
    }

    function renameVehicle(id, caption) {
        const body = new URLSearchParams({
            utf8: '✓',
            _method: 'put',
            authenticity_token: lss.csrfToken(),
            'vehicle[caption]': caption,
        });
        return fetch(`/vehicles/${id}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        }).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
        });
    }

    function showDialog(plan) {
        lss.openDialog({
            title: 'Fahrzeuge umbenennen',
            count: `${plan.length} Fahrzeug${plan.length === 1 ? '' : 'e'}`,
            rows: plan.map(p => ({ left: p.oldName, right: p.newName })),
            empty: 'Alle Fahrzeuge haben schon den richtigen Namen.',
            hint: 'Prüfe die Vorschau und klicke dann auf „Umbenennen starten“.',
            startLabel: 'Umbenennen starten',
            async run(ui) {
                let ok = 0, failed = 0;
                for (let i = 0; i < plan.length && !ui.cancelled(); i++) {
                    ui.busy(i);
                    try {
                        await renameVehicle(plan[i].id, plan[i].newName);
                        ui.done(i, 'ok', '✓');
                        ok++;
                    } catch (e) {
                        ui.done(i, 'err', '!', e.message);
                        failed++;
                    }
                    ui.progress(i + 1, `${i + 1} von ${plan.length} erledigt${failed ? ` · ${failed} Fehler` : ''}`);
                    await lss.sleep(DELAY);
                }
                return `Fertig! ${ok} umbenannt${failed ? `, ${failed} Fehler` : ''}.`;
            },
        });
    }

    async function start(buildingId) {
        try {
            showDialog(await buildPlan(buildingId));
        } catch (e) {
            lss.report('Fahrzeuge umbenennen', e);
        }
    }

    lss.actions.renamePlan = buildPlan;
    lss.actions.rename = start;

    if (lss.isWorkerFrame) return;

    // Menüeintrag im Tampermonkey-Menü: alle Wachen auf einmal
    if (window === window.top) GM_registerMenuCommand('Alle Fahrzeuge umbenennen', () => start(null));

    lss.addTool({ label: '✎ Fahrzeuge umbenennen', scope: 'building', order: 20, run: id => start(id) });
    lss.addTool({ label: '✎ Fahrzeuge umbenennen (alle Wachen)', scope: 'all', order: 20, run: () => start(null) });
})();

// ===== personal-zuweisen.js =====
// LSS Personal zuweisen
// Füllt Fahrzeuge mit passendem, noch freiem Personal der eigenen Wache auf
// (z.B. Notärzte aufs NEF). Personal, das schon an ein anderes Fahrzeug gebunden ist, bleibt dort.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Pause zwischen zwei Zuweisungen in ms, damit der Server nicht überlastet wird
    const DELAY = 300;
    // So lange wird auf die Antwort des Spiels nach einem Klick gewartet
    const TIMEOUT = 10000;

    // Welche Ausbildungen ein Fahrzeugtyp braucht.
    // all: alle Plätze brauchen eine dieser Ausbildungen; min: {Ausbildung: Anzahl}
    function requirements(type, max) {
        const all = new Set();
        const min = {};
        for (const school of Object.values(type?.staff?.training ?? {})) {
            for (const [key, rule] of Object.entries(school)) {
                if (rule.all) all.add(key);
                else if (rule.min) min[key] = Math.max(min[key] ?? 0, Math.min(rule.min, max));
            }
        }
        return { all, min };
    }

    // Zuweisungsseite eines Fahrzeugs unsichtbar öffnen
    function openWorker(vehicleId) {
        return new Promise((resolve, reject) => {
            const frame = document.createElement('iframe');
            frame.name = 'lss-worker';
            frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none';
            const timer = setTimeout(() => {
                frame.remove();
                reject(new Error('Zuweisungsseite lädt nicht'));
            }, 30000);
            frame.onload = () => {
                clearTimeout(timer);
                frame.onload = null;
                resolve(frame);
            };
            frame.src = `/vehicles/${vehicleId}/zuweisung`;
            document.body.append(frame);
        });
    }

    function readPersonnel(doc) {
        return [...doc.querySelectorAll('#personal_table tbody tr[id^="personal_"]')].map(row => {
            const btn = row.querySelector('a.btn[personal_id]');
            let keys = [];
            try { keys = JSON.parse(row.dataset.filterableBy || '[]'); } catch (e) { /* keine Ausbildung lesbar */ }
            return {
                id: row.id.replace('personal_', ''),
                name: row.cells[0]?.textContent.trim(),
                keys,
                btn,
                assigned: !!btn?.classList.contains('btn-assigned'),
                elsewhere: !!btn?.classList.contains('btn-warning'),
            };
        });
    }

    // Wer soll zugewiesen werden?
    // neededAtBuilding = Ausbildungen, die irgendein Fahrzeug (oder Anhänger) der Wache braucht
    // knownKeys = alle Ausbildungen, die die Fahrzeugliste überhaupt kennt
    function pick(personnel, req, max, neededAtBuilding, knownKeys) {
        const assigned = personnel.filter(p => p.assigned);
        const free = personnel.filter(p => p.btn && !p.assigned && !p.elsewhere);
        let slots = max - assigned.length;
        const picks = [];
        const take = (list, n) => {
            for (const p of list) {
                if (n <= 0 || slots <= 0) break;
                if (picks.includes(p)) continue;
                picks.push(p);
                n--;
                slots--;
            }
        };
        const hasAny = (p, keys) => p.keys.some(k => keys.has(k));

        if (req.all.size) {
            take(free.filter(p => hasAny(p, req.all)), slots);
            return picks;
        }
        for (const [key, n] of Object.entries(req.min)) {
            const have = assigned.filter(p => p.keys.includes(key)).length;
            take(free.filter(p => p.keys.includes(key)), n - have);
        }
        // Restliche Plätze: erst Personal ohne Ausbildung. Ausgebildete Leute nur, wenn sicher ist, dass
        // ihre Ausbildung an dieser Wache kein Fahrzeug braucht. Kennt die Fahrzeugliste eine Ausbildung
        // nicht, bleibt die Person sicherheitshalber frei.
        take(free.filter(p => !p.keys.length), slots);
        take(free.filter(p => p.keys.length && p.keys.every(k => knownKeys.has(k)) && !hasAny(p, neededAtBuilding)), slots);
        return picks;
    }

    async function waitFor(check) {
        const end = Date.now() + TIMEOUT;
        while (Date.now() < end) {
            if (check()) return true;
            await lss.sleep(150);
        }
        return false;
    }

    // Ein Fahrzeug auffüllen, gibt die Anzahl neu zugewiesener Personen zurück
    async function fillVehicle(vehicle, req, max, neededAtBuilding, knownKeys, isCancelled) {
        const frame = await openWorker(vehicle.id);
        try {
            const doc = () => frame.contentDocument;
            if (!doc()?.querySelector('#personal_table')) throw new Error('Keine Personalliste gefunden');
            const picks = pick(readPersonnel(doc()), req, max, neededAtBuilding, knownKeys);
            let count = 0;
            for (const p of picks) {
                if (isCancelled()) break;
                doc().querySelector(`#personal_${p.id} a.btn[personal_id]`)?.click();
                // Das Spiel tauscht den Knopf aus (oder lädt die Seite neu), sobald die Person zugewiesen ist
                const ok = await waitFor(() => doc()?.querySelector(`#personal_${p.id} a.btn-assigned`));
                if (!ok) throw new Error(`${p.name}: keine Antwort vom Spiel`);
                count++;
                await lss.sleep(DELAY);
            }
            return count;
        } finally {
            frame.remove();
        }
    }

    // Falsch eingeteiltes Personal von einem Fahrzeug nehmen: ausgebildete Leute, deren Ausbildung dieses
    // Fahrzeug nicht braucht, die aber ein anderes Fahrzeug der Wache braucht (z.B. Pumpen-Leute auf dem GKW).
    // Gibt die Anzahl entfernter Personen zurück.
    async function cleanVehicle(vehicle, req, neededAtBuilding, knownKeys, isCancelled) {
        const ownKeys = new Set([...req.all, ...Object.keys(req.min).filter(k => req.min[k] > 0)]);
        const frame = await openWorker(vehicle.id);
        try {
            const doc = () => frame.contentDocument;
            if (!doc()?.querySelector('#personal_table')) throw new Error('Keine Personalliste gefunden');
            const misplaced = readPersonnel(doc()).filter(p => p.assigned && p.keys.length
                && p.keys.every(k => knownKeys.has(k))
                && !p.keys.some(k => ownKeys.has(k))
                && p.keys.some(k => neededAtBuilding.has(k)));
            return await unassign(doc, misplaced, isCancelled);
        } finally {
            frame.remove();
        }
    }

    // Personen von einem Fahrzeug nehmen (Knopf in der Zuweisungsseite klicken)
    async function unassign(doc, people, isCancelled) {
        let count = 0;
        for (const p of people) {
            if (isCancelled()) break;
            doc().querySelector(`#personal_${p.id} a.btn[personal_id]`)?.click();
            const ok = await waitFor(() => {
                const btn = doc()?.querySelector(`#personal_${p.id} a.btn[personal_id]`);
                return btn && !btn.classList.contains('btn-assigned');
            });
            if (!ok) throw new Error(`${p.name}: Zuweisung ließ sich nicht entfernen`);
            count++;
            await lss.sleep(DELAY);
        }
        return count;
    }

    // Darf diese freie Person auf ein Fahrzeug ohne Ausbildungspflicht? (gleiche Regel wie in pick)
    const fitsPlain = (p, needed, knownKeys) => p.btn && !p.assigned && !p.elsewhere
        && (!p.keys.length || (p.keys.every(k => knownKeys.has(k)) && !p.keys.some(k => needed.has(k))));

    // Gleichmäßig verteilen: Fahrzeuge ohne Ausbildungspflicht einer Wache (LF, HLF, MTW …) teilen sich das
    // freie Personal nach Platzzahl, statt dass die ersten Fahrzeuge voll und die letzten leer sind.
    // canTrim: Fahrzeuge dürfen Leute abgeben (Umsortieren); sonst behalten sie mindestens ihre Besatzung.
    async function setTargets(group, needed, knownKeys, canTrim) {
        const frame = await openWorker(group[0].vehicle.id);
        let free;
        try {
            const doc = frame.contentDocument;
            if (!doc?.querySelector('#personal_table')) throw new Error('Keine Personalliste gefunden');
            free = readPersonnel(doc).filter(p => fitsPlain(p, needed, knownKeys)).length;
        } finally {
            frame.remove();
        }
        let pool = free + group.reduce((s, p) => s + p.current, 0);
        let active = [...group];
        // Wer mehr behalten muss, als ihm zusteht, bekommt genau das und fällt aus der Verteilung raus
        for (;;) {
            const sumMax = active.reduce((s, p) => s + p.max, 0);
            const fixed = active.filter(p => {
                const floor = canTrim ? 0 : p.current;
                return floor >= Math.min(p.max, pool * p.max / sumMax);
            });
            if (!fixed.length || !sumMax) break;
            for (const p of fixed) {
                p.target = canTrim ? Math.min(p.max, pool * p.max / sumMax) : p.current;
                p.target = Math.floor(p.target);
                pool -= p.target;
            }
            active = active.filter(p => !fixed.includes(p));
        }
        const sumMax = active.reduce((s, p) => s + p.max, 0);
        const share = active.map(p => (sumMax ? Math.min(p.max, pool * p.max / sumMax) : 0));
        active.forEach((p, i) => { p.target = Math.floor(share[i]); });
        let rest = Math.max(0, pool) - active.reduce((s, p) => s + p.target, 0);
        [...active.keys()].sort((a, b) => (share[b] % 1) - (share[a] % 1)).forEach(i => {
            if (rest > 0 && active[i].target < active[i].max) { active[i].target++; rest--; }
        });
    }

    // Ziele für alle Fahrzeuge ohne Ausbildungspflicht dieser Wache setzen (einmal pro Wache)
    async function ensureTargets(items, p, neededByBuilding, knownKeys, canTrim) {
        if (p.trained || p.target != null) return;
        const group = items.filter(o => !o.trained && o.vehicle.building_id === p.vehicle.building_id);
        await setTargets(group, neededByBuilding[p.vehicle.building_id] ?? new Set(), knownKeys, canTrim);
    }

    // Überzählige Besatzung abgeben; zuerst Leute ohne Ausbildung, die finden überall Platz
    async function trimVehicle(vehicle, keep, isCancelled) {
        const frame = await openWorker(vehicle.id);
        try {
            const doc = () => frame.contentDocument;
            if (!doc()?.querySelector('#personal_table')) throw new Error('Keine Personalliste gefunden');
            const assigned = readPersonnel(doc()).filter(p => p.assigned)
                .sort((a, b) => a.keys.length - b.keys.length);
            return await unassign(doc, assigned.slice(0, Math.max(0, assigned.length - keep)), isCancelled);
        } finally {
            frame.remove();
        }
    }

    // buildingId und vehicleId beide null: alle Fahrzeuge aller Wachen
    // resort: auch volle Fahrzeuge aufnehmen, weil dort falsch eingeteiltes Personal sitzen kann
    async function buildPlan(buildingId, vehicleId, resort = false) {
        const [vehicles, types] = await Promise.all([lss.getJSON('/api/vehicles'), lss.getVehicleTypes()]);
        const selected = vehicles.filter(v =>
            vehicleId !== null ? v.id === vehicleId : buildingId === null || v.building_id === buildingId);

        const knownKeys = new Set();
        for (const type of Object.values(types)) {
            for (const school of Object.values(type?.staff?.training ?? {})) Object.keys(school).forEach(k => knownKeys.add(k));
        }

        // Pro Wache: welche Ausbildungen braucht irgendein Fahrzeug dort?
        const neededByBuilding = {};
        for (const v of vehicles) {
            const req = requirements(types[v.vehicle_type], 99);
            const set = neededByBuilding[v.building_id] ??= new Set();
            [...req.all, ...Object.keys(req.min)].forEach(k => set.add(k));
        }

        const maxOf = v => {
            const type = types[v.vehicle_type];
            return v.max_personnel_override ?? type?.maxPersonnel ?? type?.staff?.max ?? 0;
        };
        const plans = new Map(vehicles.map(v => [v.id, { vehicle: v, max: maxOf(v), req: requirements(types[v.vehicle_type], maxOf(v)) }]));

        // Anhänger und Abrollbehälter haben keine eigene Besatzung: ihre Ausbildung (z.B. Wasserschaden/Pumpen
        // beim Anh SwPu, Notstrom beim NEA200) muss das Personal des Zugfahrzeugs mitbringen
        for (const v of vehicles) {
            const tow = plans.get(v.tractive_vehicle_id ?? v.tractive_vehicle?.id);
            if (!tow || maxOf(v) > 0 || !tow.max) continue;
            const trailerReq = requirements(types[v.vehicle_type], tow.max);
            for (const key of trailerReq.all) tow.req.min[key] = Math.max(tow.req.min[key] ?? 0, tow.max);
            for (const [key, n] of Object.entries(trailerReq.min)) tow.req.min[key] = Math.max(tow.req.min[key] ?? 0, n);
        }

        return {
            neededByBuilding,
            knownKeys,
            items: selected
                .map(v => {
                    const p = plans.get(v.id);
                    const trained = p.req.all.size > 0 || Object.values(p.req.min).some(n => n > 0);
                    return { ...p, current: v.assigned_personnel_count ?? 0, trained };
                })
                .filter(p => p.max > 0 && (resort || p.current < p.max))
                // Fahrzeuge mit Ausbildungspflicht zuerst, damit sie ihr Fachpersonal sicher bekommen
                .sort((a, b) => b.trained - a.trained || a.vehicle.id - b.vehicle.id),
        };
    }

    function showDialog({ items, neededByBuilding, knownKeys }, resort = false) {
        const label = p => `${p.current} / ${p.max} Personal`;
        if (resort) return showResortDialog({ items, neededByBuilding, knownKeys }, label);
        lss.openDialog({
            title: 'Personal zuweisen',
            count: `${items.length} Fahrzeug${items.length === 1 ? '' : 'e'}`,
            rows: items.map(p => ({ left: p.vehicle.caption, right: label(p) })),
            empty: 'Alle Fahrzeuge sind schon voll besetzt.',
            hint: 'Es wird nur freies Personal der jeweiligen Wache zugewiesen, gleichmäßig verteilt (z.B. LF und HLF bekommen gleich viel). Ausgebildete Leute bleiben für Fahrzeuge frei, die ihre Ausbildung brauchen (auch fürs Zugfahrzeug eines Anhängers).',
            startLabel: 'Personal zuweisen',
            async run(ui) {
                let added = 0, failed = 0;
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    ui.busy(i);
                    try {
                        const needed = neededByBuilding[p.vehicle.building_id] ?? new Set();
                        await ensureTargets(items, p, neededByBuilding, knownKeys, false);
                        const limit = p.trained ? p.max : Math.min(p.max, p.target);
                        const n = p.current < limit ? await fillVehicle(p.vehicle, p.req, limit, needed, knownKeys, ui.cancelled) : 0;
                        p.current += n;
                        ui.setRight(i, label(p));
                        if (n) ui.done(i, 'ok', `+${n}`);
                        else ui.done(i, 'skip', '–', p.current >= limit ? 'Hat schon seinen Anteil' : 'Kein passendes freies Personal');
                        added += n;
                    } catch (e) {
                        ui.done(i, 'err', '!', e.message);
                        failed++;
                    }
                    ui.progress(i + 1, `${i + 1} von ${items.length} Fahrzeugen · ${added} Personen zugewiesen${failed ? ` · ${failed} Fehler` : ''}`);
                }
                return `Fertig! ${added} Person${added === 1 ? '' : 'en'} zugewiesen${failed ? `, ${failed} Fehler` : ''}.`;
            },
        });
    }

    // Erst überall falsch eingeteiltes Personal entfernen, dann alle Fahrzeuge neu auffüllen
    function showResortDialog({ items, neededByBuilding, knownKeys }, label) {
        lss.openDialog({
            title: 'Personal umsortieren',
            count: `${items.length} Fahrzeug${items.length === 1 ? '' : 'e'}`,
            rows: items.map(p => ({ left: p.vehicle.caption, right: label(p) })),
            empty: 'Keine Fahrzeuge mit Besatzung.',
            hint: 'Schritt 1: Ausgebildete Leute kommen von Fahrzeugen runter, die ihre Ausbildung nicht brauchen, wenn ein anderes Fahrzeug der Wache sie braucht (z.B. Pumpen-Leute vom GKW). Schritt 2: Volle Fahrzeuge ohne Ausbildungspflicht (z.B. HLF) geben Leute ab, damit alle (z.B. auch die LF) gleich viel bekommen. Schritt 3: Alle Fahrzeuge werden wieder passend aufgefüllt.',
            startLabel: 'Umsortieren',
            async run(ui) {
                const removed = items.map(() => 0);
                const errors = items.map(() => null);
                let failed = 0;
                const needed = p => neededByBuilding[p.vehicle.building_id] ?? new Set();
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    ui.busy(i);
                    try {
                        removed[i] = await cleanVehicle(p.vehicle, p.req, needed(p), knownKeys, ui.cancelled);
                        p.current -= removed[i];
                        ui.setRight(i, label(p));
                    } catch (e) {
                        errors[i] = e.message;
                    }
                    ui.progress((i + 1) / 3, `Schritt 1: ${i + 1} von ${items.length} Fahrzeugen geprüft · ${removed.reduce((a, b) => a + b, 0)} entfernt`);
                }
                // Schritt 2: volle Fahrzeuge ohne Ausbildungspflicht geben Leute ab, damit alle gleich viel haben
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    if (errors[i] || p.trained) continue;
                    ui.busy(i);
                    try {
                        await ensureTargets(items, p, neededByBuilding, knownKeys, true);
                        if (p.current > p.target) {
                            const n = await trimVehicle(p.vehicle, p.target, ui.cancelled);
                            removed[i] += n;
                            p.current -= n;
                            ui.setRight(i, label(p));
                        }
                    } catch (e) {
                        errors[i] = e.message;
                    }
                    ui.progress((items.length + i + 1) / 3, `Schritt 2: ${i + 1} von ${items.length} Fahrzeugen gleichmäßig verteilt`);
                }
                let added = 0;
                for (let i = 0; i < items.length && !ui.cancelled(); i++) {
                    const p = items[i];
                    ui.busy(i);
                    let n = 0;
                    const limit = p.trained ? p.max : Math.min(p.max, p.target ?? p.max);
                    try {
                        if (!errors[i] && p.current < limit) n = await fillVehicle(p.vehicle, p.req, limit, needed(p), knownKeys, ui.cancelled);
                    } catch (e) {
                        errors[i] = e.message;
                    }
                    p.current += n;
                    added += n;
                    ui.setRight(i, label(p));
                    const text = [removed[i] ? `−${removed[i]}` : '', n ? `+${n}` : ''].filter(Boolean).join(' ');
                    if (errors[i]) { ui.done(i, 'err', '!', errors[i]); failed++; }
                    else if (text) ui.done(i, 'ok', text);
                    else ui.done(i, 'skip', '–', p.current >= limit ? 'Passt schon' : 'Kein passendes freies Personal');
                    ui.progress((2 * items.length + i + 1) / 3, `Schritt 3: ${i + 1} von ${items.length} Fahrzeugen · ${added} zugewiesen`);
                }
                const total = removed.reduce((a, b) => a + b, 0);
                return `Fertig! ${total} Person${total === 1 ? '' : 'en'} umgesetzt, ${added} zugewiesen${failed ? `, ${failed} Fehler` : ''}.`;
            },
        });
    }

    async function start(buildingId, vehicleId, resort = false) {
        try {
            showDialog(await buildPlan(buildingId, vehicleId, resort), resort);
        } catch (e) {
            lss.report('Personal zuweisen', e);
        }
    }

    lss.actions.assign = buildingId => start(buildingId, null);

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '👥 Personal zuweisen', scope: 'building', order: 30, run: id => start(id, null) });
    lss.addTool({ label: '👥 Personal zuweisen (alle Wachen)', scope: 'all', order: 30, run: () => start(null, null) });
    lss.addTool({ label: '♻️ Personal umsortieren', scope: 'building', order: 31, run: id => start(id, null, true) });
    lss.addTool({ label: '♻️ Personal umsortieren (alle Wachen)', scope: 'all', order: 31, run: () => start(null, null, true) });

    // Wachen-Seite: alle Fahrzeuge dieser Wache, Knopf direkt über der Fahrzeugliste
    const building = location.pathname.match(/^\/buildings\/(\d+)\/?$/);
    const vehicleTable = document.querySelector('#vehicle_table');
    if (building && vehicleTable) {
        lss.addPageButton(vehicleTable, '👥 Personal zuweisen', () => start(Number(building[1]), null));
        lss.addPageButton(vehicleTable, '♻️ Personal umsortieren', () => start(Number(building[1]), null, true));
    }

    // Zuweisungsseite: nur dieses Fahrzeug
    const assignment = location.pathname.match(/^\/vehicles\/(\d+)\/zuweisung\/?$/);
    const personnelTable = document.querySelector('#personal_table');
    if (assignment && personnelTable) {
        lss.addPageButton(personnelTable, '👥 Passendes Personal automatisch zuweisen', () => start(null, Number(assignment[1])));
    }
})();

// ===== personal-verschieben.js =====
// LSS Personal verschieben
// Holt Personal von einer anderen Wache auf diese Wache, über die Funktion "Personal übernehmen" des Spiels
// (Seite "Neue Leute werben"). Standardmäßig nur Leute, die auf keinem Fahrzeug sitzen; Filter nach
// Ausbildung, einzeln an- und abwählbar. Beachtet das Wochenlimit und das Minimum der Quellwache.
// Verschieben lässt sich im Spiel NICHT rückgängig machen, deshalb immer mit Rückfrage. Nie Coins.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const STYLE = `
        /* Nur die Personenliste scrollt, Formular und Knöpfe unten bleiben immer sichtbar */
        .lssr-body { display:flex; flex-direction:column; min-height:0; flex:1; }
        .pv-body { overflow:hidden; flex:1; min-height:0; display:flex; flex-direction:column; }
        .pv-body > .pv-form, .pv-body > .pv-info, .pv-body > .lssr-foot { flex-shrink:0; }
        .pv-form { display:grid; grid-template-columns:auto 1fr; gap:8px 12px; align-items:center; padding:14px 18px; border-bottom:1px solid #3a3f47; background:#1c1f23; font-size:13px; }
        .pv-form label { margin:0; color:#aab0b8; font-weight:normal; }
        .pv-form select, .pv-form input[type=number] { background:#2a2e34; border:1px solid #3a3f47; border-radius:6px; color:#e6e6e6; padding:6px 8px; font-size:13px; max-width:100%; }
        /* Das Spiel färbt Auswahlfelder selbst; mit !important bleibt die Schrift hell */
        .pv-form select, .pv-form input[type=number] { background:#2a2e34 !important; color:#e6e6e6 !important; -webkit-text-fill-color:#e6e6e6; }
        .pv-form select option { background:#2a2e34 !important; color:#e6e6e6 !important; }
        .pv-form input[type=number] { width:90px; }
        .pv-check { display:flex; align-items:center; gap:6px; grid-column:2; color:#aab0b8; }
        .pv-check input { margin:0; }
        .pv-info { padding:8px 18px; color:#aab0b8; font-size:13px; border-bottom:1px solid #3a3f47; }
        .pv-info b { color:#fff; }
        .pv-warn { color:#f0b75e; }
        .pv-list { overflow:auto; flex:1 1 auto; min-height:80px; }
        .pv-row { display:grid; grid-template-columns:24px minmax(0,1fr) minmax(0,1fr); gap:8px; align-items:center; padding:6px 18px; border-bottom:1px solid #2e3238; font-size:13px; cursor:pointer; margin:0; font-weight:normal; color:#e6e6e6; }
        .pv-row:hover { background:#2a2e34; }
        .pv-row input { margin:0; }
        .pv-edu { color:#aab0b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pv-bound { color:#8b929c; font-size:12px; }
        .pv-empty { padding:24px 18px; color:#8b929c; text-align:center; }
    `;

    function injectStyle() {
        if (document.getElementById('pv-style')) return;
        const style = document.createElement('style');
        style.id = 'pv-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const loadDoc = async url => {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return new DOMParser().parseFromString(await r.text(), 'text/html');
    };

    // Erste Zahl im Text; nichts Lesbares zählt als 0, damit im Zweifel nichts verschoben wird
    const firstNumber = text => {
        const m = String(text ?? '').match(/d+/);
        return m ? Number(m[0]) : 0;
    };

    // Werbeseite der Zielwache: Quellwachen, Wochenlimit, Formular-Adresse
    async function loadTargetInfo(targetId) {
        const doc = await loadDoc(`/buildings/${targetId}/hire`);
        const form = doc.querySelector('form[action*="/adopt"]');
        // Kein Fehler im Skript, sondern eine Spielregel: dann zeigt start() eine Erklärung statt eines Fehlers
        if (!form) return null;
        const sources = [...form.querySelectorAll('.personal-select-heading[building_id]')].map(h => {
            const spans = h.querySelectorAll('span');
            const counts = spans[1]?.textContent.match(/Derzeit:\s*(\d+).*?Mindestens:\s*(\d+)/i);
            return {
                id: h.getAttribute('building_id'),
                name: spans[0]?.textContent.trim() ?? h.textContent.trim(),
                url: h.getAttribute('href'),
                current: counts ? Number(counts[1]) : null,
                min: counts ? Number(counts[2]) : 0,
            };
        });
        return {
            action: form.getAttribute('action'),
            remaining: firstNumber((form.querySelector('#schooling_free') ?? doc.querySelector('#schooling_free'))?.textContent),
            sources,
        };
    }

    // Personenliste einer Quellwache; nur Leute mit Häkchen sind gerade verschiebbar
    async function loadPeople(source) {
        const doc = await loadDoc(source.url);
        return [...doc.querySelectorAll('tbody tr')].map(row => {
            const box = row.querySelector('input.schooling_checkbox[name="personal_ids[]"]');
            if (!box) return null;
            const bound = row.cells[3]?.querySelector('a[href^="/vehicles/"]');
            return {
                id: box.value,
                name: (row.cells[1]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                education: (row.cells[2]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                bound: bound ? bound.textContent.trim() : '',
            };
        }).filter(Boolean);
    }

    async function adopt(action, ids) {
        const body = new URLSearchParams({ utf8: '✓', authenticity_token: lss.csrfToken() ?? '' });
        ids.forEach(id => body.append('personal_ids[]', id));
        body.append('commit', 'Personal übernehmen');
        const r = await fetch(action, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!r.ok) throw new Error(`Personal übernehmen: HTTP ${r.status}`);
        // Meldung des Spiels (z.B. "Limit erreicht") aus der Antwortseite lesen
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        return [...doc.querySelectorAll('.alert')].map(a => a.textContent.replace(/[×s]+/g, ' ').trim()).filter(Boolean).join(' · ');
    }

    async function start(targetId) {
        injectStyle();
        const [info, buildings] = await Promise.all([loadTargetInfo(targetId), lss.getJSON('/api/buildings').catch(() => [])]);
        const target = buildings.find(b => String(b.id) === String(targetId));
        const e = lss.escapeHtml;
        if (!info) {
            lss.openPanel({
                title: `🔀 Personal holen${target ? `: ${target.caption}` : ''}`,
                count: 'nicht möglich',
                body: `
                    <div style="padding:16px 18px;color:#cfd3d8;font-size:13px;line-height:1.6">
                        Das Spiel bietet für diese Wache gerade <b style="color:#fff">kein „Personal übernehmen“</b> an.
                        Auf ihrer Seite „Neue Leute werben“ fehlt dieser Bereich.<br><br>
                        Mögliche Gründe:
                        <ul style="margin:6px 0 0;padding-left:20px">
                            <li>Für diesen Wachentyp erlaubt das Spiel kein Verschieben (z.B. Kleinwachen, Schulen, Krankenhäuser).</li>
                            <li>Es gibt keine andere Wache desselben Typs, von der Personal kommen kann.</li>
                        </ul>
                    </div>`,
            });
            return;
        }
        const need = target ? Math.max(0, (target.personal_count_target ?? 0) - (target.personal_count ?? 0)) : 0;
        // Quellwachen mit dem meisten Personal über dem Minimum zuerst
        const sources = [...info.sources].sort((a, b) => ((b.current ?? 0) - b.min) - ((a.current ?? 0) - a.min));

        const panel = lss.openPanel({
            title: `🔀 Personal holen${target ? `: ${target.caption}` : ''}`,
            count: `Noch verschiebbar: ${info.remaining}`,
            body: `
                <div class="pv-body">
                    <div class="pv-form">
                        <label>Von Wache</label>
                        <select class="pv-source">${sources.map(s => `<option value="${e(s.id)}">${e(s.name)} (${s.current ?? '?'} Personal, mind. ${s.min})</option>`).join('')}</select>
                        <label>Anzahl</label>
                        <input type="number" class="pv-count" min="1" max="${info.remaining}" value="${Math.max(1, Math.min(need || info.remaining, info.remaining))}">
                        <label>Ausbildung</label>
                        <select class="pv-edu-filter"><option value="*">egal</option><option value="">ohne Ausbildung</option></select>
                        <label class="pv-check"><input type="checkbox" class="pv-bound-ok"> auch Leute, die fest an ein Fahrzeug gebunden sind</label>
                    </div>
                    <div class="pv-info"></div>
                    <div class="pv-list"><div class="pv-empty">Lade Personal …</div></div>
                    <div class="lssr-foot">
                        <div class="lssr-status pv-status">${need ? `Diese Wache liegt <b>${need}</b> unter ihrem Personal-Ziel.` : ''}</div>
                        <div class="lssr-actions">
                            <button class="lssr-btn lssr-btn-ghost pv-close">Schließen</button>
                            <button class="lssr-btn lssr-btn-primary pv-go" disabled>Personal übernehmen</button>
                        </div>
                    </div>
                </div>`,
        });
        const root = panel.root;
        const $ = sel => root.querySelector(sel);
        let people = [];
        let source = sources[0];

        if (!info.remaining) $('.pv-status').innerHTML = '<span class="pv-warn">Diese Woche kann kein Personal mehr verschoben werden (Limit erreicht). Ab Montag wieder.</span>';
        if (!sources.length) {
            $('.pv-list').innerHTML = '<div class="pv-empty">Keine Wache, von der Personal übernommen werden kann.</div>';
            return;
        }

        const selectedIds = () => [...root.querySelectorAll('.pv-list input:checked')].map(i => i.value);
        // Höchstens so viele, wie Limit und Minimum der Quellwache zulassen
        const maxAllowed = () => Math.max(0, Math.min(info.remaining, (source.current ?? Infinity) - source.min));

        const updateInfo = () => {
            const n = selectedIds().length;
            const max = maxAllowed();
            $('.pv-info').innerHTML = `Ausgewählt: <b>${n}</b> · erlaubt: <b>${max}</b>${n > max ? ' · <span class="pv-warn">zu viele ausgewählt</span>' : ''}`;
            $('.pv-go').disabled = !n || n > max;
            $('.pv-go').textContent = n ? `${n} Person${n === 1 ? '' : 'en'} übernehmen` : 'Personal übernehmen';
        };

        // Liste nach Filter zeigen und die ersten "Anzahl" Personen anhaken
        const renderList = () => {
            const edu = $('.pv-edu-filter').value;
            const boundOk = $('.pv-bound-ok').checked;
            const want = Math.min(Number($('.pv-count').value) || 0, maxAllowed());
            const fits = people.filter(p => (boundOk || !p.bound) && (edu === '*' || p.education === edu));
            $('.pv-list').innerHTML = fits.length
                ? fits.map((p, i) => `
                    <label class="pv-row">
                        <input type="checkbox" value="${e(p.id)}" ${i < want ? 'checked' : ''}>
                        <span>${e(p.name)}${p.bound ? ` <span class="pv-bound">· ${e(p.bound)}</span>` : ''}</span>
                        <span class="pv-edu">${e(p.education || '–')}</span>
                    </label>`).join('')
                : '<div class="pv-empty">Niemand passt zum Filter.</div>';
            updateInfo();
        };

        const loadSource = async () => {
            source = sources.find(s => s.id === $('.pv-source').value) ?? sources[0];
            $('.pv-list').innerHTML = '<div class="pv-empty">Lade Personal …</div>';
            try {
                people = await loadPeople(source);
            } catch (err) {
                lss.report('Personal verschieben', err);
                $('.pv-list').innerHTML = '<div class="pv-empty">Personal konnte nicht geladen werden.</div>';
                return;
            }
            const educations = [...new Set(people.map(p => p.education).filter(Boolean))].sort();
            const keep = $('.pv-edu-filter').value;
            $('.pv-edu-filter').innerHTML = '<option value="*">egal</option><option value="">ohne Ausbildung</option>'
                + educations.map(x => `<option value="${e(x)}">${e(x)}</option>`).join('');
            $('.pv-edu-filter').value = ['*', '', ...educations].includes(keep) ? keep : '*';
            renderList();
        };

        $('.pv-source').addEventListener('change', loadSource);
        $('.pv-edu-filter').addEventListener('change', renderList);
        $('.pv-bound-ok').addEventListener('change', renderList);
        $('.pv-count').addEventListener('input', renderList);
        $('.pv-list').addEventListener('change', updateInfo);
        $('.pv-close').addEventListener('click', panel.close);
        $('.pv-go').addEventListener('click', async () => {
            const ids = selectedIds();
            if (!ids.length || ids.length > maxAllowed()) return;
            const ok = confirm(`${ids.length} Person${ids.length === 1 ? '' : 'en'} von „${source.name}“ nach „${target?.caption ?? 'diese Wache'}“ verschieben?\n\nAchtung: Das kann im Spiel NICHT rückgängig gemacht werden.`);
            if (!ok) return;
            $('.pv-go').disabled = true;
            $('.pv-status').textContent = 'Prüfe Wochenlimit …';
            try {
                // Limit direkt vor dem Verschieben frisch vom Spiel holen, das Fenster kann veraltet sein
                const fresh = await loadTargetInfo(targetId);
                if (!fresh || fresh.remaining < ids.length) {
                    $('.pv-status').innerHTML = `<span class="pv-warn">Laut Spiel sind diese Woche nur noch <b>${fresh?.remaining ?? 0}</b> verschiebbar. Es wurde nichts verschoben.</span>`;
                    return;
                }
                $('.pv-status').textContent = 'Verschiebe …';
                const message = await adopt(fresh.action, ids);
                // Nachzählen: wer ist noch an der Quellwache?
                const still = new Set((await loadPeople(source)).map(p => p.id));
                const moved = ids.filter(id => !still.has(id)).length;
                if (!moved) {
                    $('.pv-status').innerHTML = `<span class="pv-warn">Das Spiel hat niemanden verschoben.${message ? ` Meldung: ${e(message)}` : ''}</span>`;
                    return;
                }
                $('.pv-status').innerHTML = `<b style="color:#5cd178">✓ ${moved} Person${moved === 1 ? '' : 'en'} übernommen.</b>${moved < ids.length ? ` <span class="pv-warn">(${ids.length - moved} nicht)</span>` : ''} Die Seite wird neu geladen.`;
                setTimeout(() => location.reload(), 2500);
            } catch (err) {
                lss.report('Personal verschieben', err);
                $('.pv-status').textContent = 'Fehler beim Verschieben, bitte im Spiel prüfen.';
            }
        });

        await loadSource();
    }

    lss.actions.movePersonnel = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '🔀 Personal holen', scope: 'building', order: 32, run: id => start(id) });

    // Wachen-Seite: Knopf direkt über der Fahrzeugliste
    const building = location.pathname.match(/^\/buildings\/(\d+)\/?$/);
    const vehicleTable = document.querySelector('#vehicle_table');
    if (building && vehicleTable) {
        lss.addPageButton(vehicleTable, '🔀 Personal holen', lss.safe('Personal verschieben', () => start(building[1])));
    }
})();

// ===== wachen-check.js =====
// LSS Wachen-Check
// Zeigt auf einen Blick, was an den Wachen nicht stimmt: Fahrzeuge ohne/mit zu wenig Personal,
// Personalmangel, falsche Fahrzeugnamen, fehlende Leitstelle, Fahrzeuge außer Dienst, Ausbauten.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js
// (Umbenennen und Personal zuweisen werden direkt aus dem Check heraus gestartet, wenn geladen).

(function () {
    'use strict';

    const STYLE = `
        .lssr-wide { width:min(860px,96vw); }
        .lssr-body { display:flex; flex-direction:column; min-height:0; flex:1; }
        .wc-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 18px; border-bottom:1px solid #3a3f47; background:#1c1f23; }
        .wc-stat { border-radius:999px; padding:4px 12px; font-size:13px; font-weight:600; cursor:pointer; border:1px solid transparent; user-select:none; }
        .wc-stat.err { background:rgba(201,48,44,.18); color:#ff8a84; }
        .wc-stat.warn { background:rgba(230,162,60,.16); color:#f0b75e; }
        .wc-stat.ok { background:rgba(46,160,67,.15); color:#5cd178; }
        .wc-stat.active { border-color:currentColor; }
        .wc-search { flex:1; min-width:160px; background:#2a2e34; border:1px solid #3a3f47; border-radius:6px; color:#e6e6e6; padding:6px 10px; font-size:13px; }
        .wc-list { overflow:auto; flex:1; padding:10px 14px 14px; display:flex; flex-direction:column; gap:10px; }
        .wc-card { background:#2a2e34; border:1px solid #3a3f47; border-left:4px solid #2ea043; border-radius:8px; padding:10px 14px; }
        .wc-card.err { border-left-color:#c9302c; }
        .wc-card.warn { border-left-color:#e6a23c; }
        .wc-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .wc-name { color:#fff !important; font-weight:600; font-size:15px; flex:1; text-decoration:none; }
        .wc-name:hover { text-decoration:underline; }
        .wc-meta { color:#8b929c; font-size:12px; }
        .wc-issues { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:4px; }
        .wc-issues li { font-size:13px; display:flex; gap:8px; align-items:baseline; }
        .wc-dot { width:8px; height:8px; border-radius:50%; flex:none; transform:translateY(-1px); }
        .wc-dot.err { background:#c9302c; } .wc-dot.warn { background:#e6a23c; } .wc-dot.info { background:#5b8def; }
        .wc-issues small { color:#8b929c; }
        .wc-actions { display:flex; gap:6px; margin-top:8px; }
        .wc-actions .lssr-btn { padding:5px 12px; font-size:12px; }
        .wc-okline { color:#5cd178; font-size:13px; margin-top:4px; }
        .wc-empty { color:#8b929c; text-align:center; padding:30px; }
    `;

    function injectStyle() {
        if (document.getElementById('wc-style')) return;
        const style = document.createElement('style');
        style.id = 'wc-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const names = (list, max = 4) => {
        const shown = list.slice(0, max).map(v => v.caption).join(', ');
        return list.length > max ? `${shown} und ${list.length - max} weitere` : shown;
    };

    // Alle Probleme einer Wache; level: 'err' | 'warn' | 'info'
    function checkBuilding(b, vehicles, types, wrongNames) {
        const issues = [];
        const add = (level, text, detail = '') => issues.push({ level, text, detail });
        const crewed = vehicles
            .map(v => {
                const t = types[v.vehicle_type];
                return { v, max: v.max_personnel_override ?? t?.maxPersonnel ?? t?.staff?.max ?? 0, min: t?.minPersonnel ?? t?.staff?.min ?? 0 };
            })
            .filter(c => c.max > 0);

        if (b.enabled === false) add('info', 'Wache ist deaktiviert');

        const empty = crewed.filter(c => c.v.assigned_personnel_count === 0).map(c => c.v);
        if (empty.length) add('err', `${empty.length} Fahrzeug${empty.length === 1 ? '' : 'e'} ohne Personal`, names(empty));

        const under = crewed.filter(c => c.v.assigned_personnel_count > 0 && c.v.assigned_personnel_count < c.max).map(c => c.v);
        if (under.length) add('warn', `${under.length} Fahrzeug${under.length === 1 ? '' : 'e'} nicht voll besetzt`, names(under));

        const needMin = crewed.reduce((s, c) => s + c.min, 0);
        const needMax = crewed.reduce((s, c) => s + c.max, 0);
        const assigned = crewed.reduce((s, c) => s + c.v.assigned_personnel_count, 0);
        const staff = b.personal_count ?? 0;
        const hiring = b.hiring_automatic || (b.hiring_phase ?? 0) > 0;
        if (crewed.length && staff < needMin) {
            add('err', `Zu wenig Personal für die Mindestbesetzung: ${staff} von ${needMin}`, hiring ? 'Personalwerbung läuft' : 'Keine Personalwerbung aktiv');
        } else if (crewed.length && staff < needMax) {
            add('warn', `Zu wenig Personal für volle Besetzung: ${staff} von ${needMax}`, hiring ? 'Personalwerbung läuft' : 'Keine Personalwerbung aktiv');
        }

        if (wrongNames.length) add('warn', `${wrongNames.length} Fahrzeug${wrongNames.length === 1 ? '' : 'e'} mit abweichendem Namen`, names(wrongNames.map(p => ({ caption: `${p.oldName} → ${p.newName}` })), 2));

        if (vehicles.length && b.leitstelle_building_id == null) add('warn', 'Keiner Leitstelle zugeordnet');

        const off = vehicles.filter(v => v.fms_real === 6);
        if (off.length) add('info', `${off.length} Fahrzeug${off.length === 1 ? '' : 'e'} außer Dienst (Status 6)`, names(off));

        for (const ext of b.extensions ?? []) {
            if (!ext.available) {
                const at = ext.available_at ? new Date(ext.available_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';
                add('info', `Ausbau im Bau: ${ext.caption}`, at && `fertig am ${at}`);
            } else if (!ext.enabled) {
                add('info', `Ausbau deaktiviert: ${ext.caption}`);
            }
        }

        const level = issues.some(i => i.level === 'err') ? 'err' : issues.some(i => i.level === 'warn') ? 'warn' : 'ok';
        return {
            b, issues, level,
            meta: crewed.length ? `${vehicles.length} Fahrzeuge · ${assigned}/${needMax} Plätze besetzt · ${staff} Personal` : `${staff} Personal`,
            canRename: wrongNames.length > 0,
            canAssign: (empty.length || under.length) && staff > assigned,
            canHire: crewed.length > 0 && staff < needMax && !hiring,
        };
    }

    async function collect(buildingId) {
        const [buildings, vehicles, types, renamePlan] = await Promise.all([
            lss.getJSON('/api/buildings'),
            lss.getJSON('/api/vehicles'),
            lss.getVehicleTypes(),
            lss.actions.renamePlan ? lss.actions.renamePlan(null) : [],
        ]);
        const byBuilding = {};
        for (const v of vehicles) (byBuilding[v.building_id] ??= []).push(v);
        const vehicleBuilding = Object.fromEntries(vehicles.map(v => [v.id, v.building_id]));
        const wrongByBuilding = {};
        for (const p of renamePlan) (wrongByBuilding[vehicleBuilding[p.id]] ??= []).push(p);

        const order = { err: 0, warn: 1, ok: 2 };
        return buildings
            .filter(b => buildingId === null ? (byBuilding[b.id]?.length || b.personal_count) : b.id === buildingId)
            .map(b => checkBuilding(b, byBuilding[b.id] ?? [], types, wrongByBuilding[b.id] ?? []))
            .sort((a, b) => order[a.level] - order[b.level] || b.issues.length - a.issues.length || a.b.caption.localeCompare(b.b.caption));
    }

    function renderCard(r) {
        const e = lss.escapeHtml;
        const issues = r.issues.length
            ? `<ul class="wc-issues">${r.issues.map(i => `
                <li><span class="wc-dot ${i.level}"></span><span>${e(i.text)}${i.detail ? ` <small>· ${e(i.detail)}</small>` : ''}</span></li>`).join('')}
               </ul>`
            : '<div class="wc-okline">✔ Alles in Ordnung</div>';
        const actions = [
            r.canAssign && lss.actions.assign ? `<button class="lssr-btn lssr-btn-primary" data-assign="${r.b.id}">👥 Personal zuweisen</button>` : '',
            r.canHire && lss.actions.hire ? `<button class="lssr-btn lssr-btn-ghost" data-hire="${r.b.id}">📣 Werbung starten</button>` : '',
            r.canRename && lss.actions.rename ? `<button class="lssr-btn lssr-btn-ghost" data-rename="${r.b.id}">✎ Umbenennen</button>` : '',
        ].join('');
        return `
            <div class="wc-card ${r.level}" data-level="${r.level}" data-name="${e(r.b.caption.toLowerCase())}">
                <div class="wc-top">
                    <a class="wc-name lightbox-open" href="/buildings/${r.b.id}">${e(r.b.caption)}</a>
                    <span class="wc-meta">${e(r.meta)}</span>
                </div>
                ${issues}
                ${actions ? `<div class="wc-actions">${actions}</div>` : ''}
            </div>`;
    }

    async function start(buildingId) {
        let results;
        try {
            results = await collect(buildingId);
        } catch (e) {
            lss.report('Wachen-Check', e);
            return;
        }
        injectStyle();
        const count = level => results.filter(r => r.level === level).length;
        const single = buildingId !== null;
        const hireIds = results.filter(r => r.canHire).map(r => r.b.id);
        const panel = lss.openPanel({
            title: single ? `Wachen-Check: ${results[0]?.b.caption ?? ''}` : 'Wachen-Check',
            count: `${results.length} Wache${results.length === 1 ? '' : 'n'}`,
            body: `
                ${single ? '' : `
                <div class="wc-bar">
                    <span class="wc-stat err active" data-filter="err">● ${count('err')} mit Fehlern</span>
                    <span class="wc-stat warn active" data-filter="warn">● ${count('warn')} mit Warnungen</span>
                    <span class="wc-stat ok" data-filter="ok">● ${count('ok')} in Ordnung</span>
                    <input class="wc-search" type="search" placeholder="Wache suchen …">
                    ${hireIds.length && lss.actions.hire ? `<button class="lssr-btn lssr-btn-primary wc-hire-all">📣 Werbung an ${hireIds.length} Wache${hireIds.length === 1 ? '' : 'n'} starten</button>` : ''}
                </div>`}
                <div class="wc-list">
                    ${results.map(renderCard).join('')}
                    <div class="wc-empty" hidden>Keine Wachen für diesen Filter.</div>
                </div>`,
        });
        const root = panel.root;

        // Filter: Fehler und Warnungen sind an, "in Ordnung" ist zuerst ausgeblendet
        const active = new Set(single ? ['err', 'warn', 'ok'] : ['err', 'warn']);
        const search = root.querySelector('.wc-search');
        const applyFilter = () => {
            const q = search?.value.trim().toLowerCase() ?? '';
            let visible = 0;
            root.querySelectorAll('.wc-card').forEach(card => {
                const show = active.has(card.dataset.level) && card.dataset.name.includes(q);
                card.hidden = !show;
                if (show) visible++;
            });
            root.querySelector('.wc-empty').hidden = visible > 0;
        };
        root.querySelectorAll('.wc-stat').forEach(chip => chip.onclick = () => {
            const level = chip.dataset.filter;
            active.has(level) ? active.delete(level) : active.add(level);
            chip.classList.toggle('active', active.has(level));
            applyFilter();
        });
        search?.addEventListener('input', applyFilter);
        applyFilter();

        root.addEventListener('click', e => {
            const assign = e.target.closest('[data-assign]');
            const rename = e.target.closest('[data-rename]');
            const hire = e.target.closest('[data-hire]');
            if (e.target.closest('.wc-hire-all')) lss.actions.hire(hireIds);
            else if (hire) lss.actions.hire([Number(hire.dataset.hire)]);
            else if (assign) lss.actions.assign(Number(assign.dataset.assign));
            else if (rename) lss.actions.rename(Number(rename.dataset.rename));
            // Wache öffnen: Check schließen, damit das Fenster des Spiels sichtbar ist
            else if (e.target.closest('.wc-name')) panel.close();
        });
    }

    lss.actions.check = start;
    lss.actions.checkResults = collect;

    if (lss.isWorkerFrame) return;

    if (window === window.top) GM_registerMenuCommand('Wachen-Check', () => start(null));

    lss.addTool({ label: '🩺 Wachen-Check', scope: 'building', order: 10, run: id => start(id) });
    lss.addTool({ label: '🩺 Wachen-Check (alle Wachen)', scope: 'all', order: 10, run: () => start(null) });
})();

// ===== fahrzeug-uebersicht.js =====
// LSS Fahrzeug-Übersicht
// Zeigt pro Fahrzeugtyp, wie viele Fahrzeuge es gibt und wie viele gerade frei, im Einsatz,
// mit Sprechwunsch, außer Dienst oder ohne Personal sind.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // FMS-Status → Gruppe
    const GROUPS = [
        { key: 'free', label: 'Frei', short: 'Frei', color: '#2ea043', fms: [1, 2] },
        { key: 'busy', label: 'Im Einsatz', short: 'Einsatz', color: '#c9302c', fms: [3, 4, 7, 8, 9] },
        { key: 'talk', label: 'Sprechwunsch', short: 'S5', color: '#e6a23c', fms: [5] },
        { key: 'off', label: 'Außer Dienst', short: 'S6', color: '#6b7280', fms: [6] },
    ];
    const groupOf = fms => GROUPS.find(g => g.fms.includes(fms))?.key ?? 'free';

    const STYLE = `
        .fu-bar { display:flex; gap:12px; flex-wrap:wrap; align-items:center; padding:12px 18px; border-bottom:1px solid #3a3f47; background:#1c1f23; font-size:12px; color:#aab0b8; }
        .fu-legend { display:flex; align-items:center; gap:5px; }
        .fu-legend i { width:10px; height:10px; border-radius:2px; display:inline-block; }
        .fu-search { flex:1; min-width:150px; background:#2a2e34; border:1px solid #3a3f47; border-radius:6px; color:#e6e6e6; padding:6px 10px; font-size:13px; }
        .fu-list { overflow:auto; flex:1; }
        .fu-table { width:100%; border-collapse:collapse; font-size:13px; }
        .fu-table th { position:sticky; top:0; background:#22252a; color:#8b929c; font-weight:600; text-align:right; padding:8px 8px; border-bottom:1px solid #3a3f47; cursor:pointer; user-select:none; white-space:nowrap; }
        .fu-table th:first-child, .fu-table td:first-child { text-align:left; padding-left:18px; }
        .fu-table th:last-child, .fu-table td:last-child { padding-right:18px; }
        .fu-table th.sorted { color:#fff; }
        .fu-table td { padding:7px 8px; border-bottom:1px solid #2e3238; text-align:right; font-variant-numeric:tabular-nums; }
        .fu-table td.fu-type { white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis; }
        @media (max-width: 760px) { .fu-stackcell { display:none; } }
        .fu-table tr:hover td { background:#2a2e34; }
        .fu-type { color:#fff; font-weight:600; }
        .fu-zero { color:#4b5058; }
        .fu-warn { color:#ff8a84; font-weight:600; }
        .fu-stack { display:flex; height:8px; width:110px; border-radius:4px; overflow:hidden; background:#33373e; margin-left:auto; }
        .fu-total td { font-weight:700; color:#fff; border-top:2px solid #3a3f47; background:#1c1f23; position:sticky; bottom:0; }
    `;

    function injectStyle() {
        if (document.getElementById('fu-style')) return;
        const style = document.createElement('style');
        style.id = 'fu-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    function summarize(vehicles, types) {
        const rows = {};
        for (const v of vehicles) {
            const t = types[v.vehicle_type];
            const name = v.vehicle_type_caption || t?.caption || `Typ ${v.vehicle_type}`;
            const row = rows[name] ??= { name, total: 0, free: 0, busy: 0, talk: 0, off: 0, empty: 0 };
            row.total++;
            row[groupOf(v.fms_real)]++;
            const max = v.max_personnel_override ?? t?.maxPersonnel ?? t?.staff?.max ?? 0;
            if (max > 0 && v.assigned_personnel_count === 0) row.empty++;
        }
        return Object.values(rows);
    }

    const COLUMNS = [
        { key: 'name', label: 'Typ', title: 'Fahrzeugtyp' },
        { key: 'total', label: 'Gesamt', title: 'Fahrzeuge gesamt' },
        ...GROUPS.map(g => ({ key: g.key, label: g.short, title: `${g.label} (Status ${g.fms.join(', ')})` })),
        { key: 'empty', label: 'Ohne Pers.', title: 'Fahrzeuge ohne zugewiesenes Personal' },
    ];

    function renderRows(rows) {
        const e = lss.escapeHtml;
        const cell = (n, warn) => `<td class="${n ? (warn ? 'fu-warn' : '') : 'fu-zero'}">${n}</td>`;
        const stack = r => `<div class="fu-stack">${GROUPS.map(g =>
            r[g.key] ? `<div style="width:${(r[g.key] / r.total) * 100}%;background:${g.color}" title="${g.label}: ${r[g.key]}"></div>` : '').join('')}</div>`;
        return rows.map(r => `
            <tr data-name="${e(r.name.toLowerCase())}">
                <td class="fu-type" title="${e(r.name)}">${e(r.name)}</td>
                <td>${r.total}</td>
                ${GROUPS.map(g => cell(r[g.key])).join('')}
                ${cell(r.empty, true)}
                <td class="fu-stackcell">${stack(r)}</td>
            </tr>`).join('');
    }

    async function start(buildingId) {
        let vehicles, types, buildings;
        try {
            [vehicles, types, buildings] = await Promise.all([lss.getJSON('/api/vehicles'), lss.getVehicleTypes(), lss.getJSON('/api/buildings')]);
        } catch (e) {
            lss.report('Fahrzeug-Übersicht', e);
            return;
        }
        if (buildingId !== null) vehicles = vehicles.filter(v => v.building_id === buildingId);
        const rows = summarize(vehicles, types);
        const total = summarize(vehicles.map(v => ({ ...v, vehicle_type_caption: 'Gesamt' })), types)[0]
            ?? { name: 'Gesamt', total: 0, free: 0, busy: 0, talk: 0, off: 0, empty: 0 };
        const buildingName = buildings.find(b => b.id === buildingId)?.caption;

        injectStyle();
        const panel = lss.openPanel({
            title: buildingName ? `Fahrzeuge: ${buildingName}` : 'Fahrzeug-Übersicht',
            count: `${vehicles.length} Fahrzeuge · ${rows.length} Typen`,
            body: `
                <div class="fu-bar">
                    ${GROUPS.map(g => `<span class="fu-legend"><i style="background:${g.color}"></i>${/^S\d$/.test(g.short) ? `${g.short} ${g.label}` : g.label}</span>`).join('')}
                    <input class="fu-search" type="search" placeholder="Fahrzeugtyp suchen …">
                </div>
                <div class="fu-list">
                    <table class="fu-table">
                        <thead><tr>${COLUMNS.map(c => `<th data-sort="${c.key}" title="${c.title}">${c.label}</th>`).join('')}<th class="fu-stackcell"></th></tr></thead>
                        <tbody></tbody>
                        <tfoot class="fu-total">${renderRows([total])}</tfoot>
                    </table>
                </div>`,
        });
        const root = panel.root;
        const tbody = root.querySelector('tbody');

        // Sortierung per Klick auf die Spaltenüberschrift; erneuter Klick dreht die Richtung
        let sortKey = 'total', desc = true;
        const render = () => {
            const sorted = [...rows].sort((a, b) => {
                const cmp = sortKey === 'name' ? a.name.localeCompare(b.name) : a[sortKey] - b[sortKey];
                return (desc ? -cmp : cmp) || a.name.localeCompare(b.name);
            });
            tbody.innerHTML = renderRows(sorted);
            root.querySelectorAll('th[data-sort]').forEach(th => {
                const active = th.dataset.sort === sortKey;
                th.classList.toggle('sorted', active);
                th.textContent = COLUMNS.find(c => c.key === th.dataset.sort).label + (active ? (desc ? ' ▾' : ' ▴') : '');
            });
            filter();
        };
        const search = root.querySelector('.fu-search');
        const filter = () => {
            const q = search.value.trim().toLowerCase();
            tbody.querySelectorAll('tr').forEach(tr => { tr.hidden = !tr.dataset.name.includes(q); });
        };
        root.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
            if (sortKey === th.dataset.sort) desc = !desc;
            else { sortKey = th.dataset.sort; desc = sortKey !== 'name'; }
            render();
        });
        search.addEventListener('input', filter);
        render();
    }

    lss.actions.vehicleOverview = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '🚑 Fahrzeug-Übersicht', scope: 'building', order: 40, run: id => start(id) });
    lss.addTool({ label: '🚑 Fahrzeug-Übersicht (alle Wachen)', scope: 'all', order: 40, run: () => start(null) });
})();

// ===== personal-werben.js =====
// LSS Personalwerbung starten
// Startet an Wachen mit Personalmangel die Werbephase mit der längsten Dauer.
// Coin-Optionen ("Direkt einstellen") werden nie benutzt.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Pause zwischen zwei Wachen in ms, damit der Server nicht überlastet wird
    const DELAY = 300;

    const isHiring = b => b.hiring_automatic || (b.hiring_phase ?? 0) > 0;

    // Wie viel Personal braucht die Wache? Das Ziel aus dem Spiel oder die volle Besetzung aller Fahrzeuge
    function personnelNeed(b, vehicles, types) {
        const seats = vehicles.reduce((s, v) => {
            const t = types[v.vehicle_type];
            return s + (v.max_personnel_override ?? t?.maxPersonnel ?? t?.staff?.max ?? 0);
        }, 0);
        return Math.max(b.personal_count_target ?? 0, seats);
    }

    // buildingIds = null: alle Wachen mit Personalmangel; sonst genau diese Wachen
    async function buildPlan(buildingIds) {
        const [buildings, vehicles, types] = await Promise.all([lss.getJSON('/api/buildings'), lss.getJSON('/api/vehicles'), lss.getVehicleTypes()]);
        const byBuilding = {};
        for (const v of vehicles) (byBuilding[v.building_id] ??= []).push(v);
        return buildings
            .filter(b => buildingIds ? buildingIds.includes(b.id) : !isHiring(b) && b.personal_count < personnelNeed(b, byBuilding[b.id] ?? [], types))
            .map(b => ({ b, need: personnelNeed(b, byBuilding[b.id] ?? [], types) }))
            .sort((x, y) => x.b.caption.localeCompare(y.b.caption));
    }

    // Werbe-Links von der Werbeseite der Wache lesen
    async function hireOptions(buildingId) {
        const r = await fetch(`/buildings/${buildingId}/hire`, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        const links = [...doc.querySelectorAll('a[href*="/hire_do/"]')].map(a => ({
            href: a.getAttribute('href'),
            days: Number(a.getAttribute('href').match(/\/hire_do\/(\d+)$/)?.[1] ?? NaN),
            label: a.textContent.trim().replace(/\s+/g, ' '),
        }));
        return {
            running: links.some(l => l.days === 0),
            // Nur Tage-Optionen, nie etwas mit Coins
            options: links.filter(l => l.days > 0 && !/coin/i.test(l.label + l.href)).sort((a, b) => b.days - a.days),
        };
    }

    function showDialog(plan) {
        lss.openDialog({
            title: 'Personalwerbung starten',
            count: `${plan.length} Wache${plan.length === 1 ? '' : 'n'}`,
            rows: plan.map(p => ({ left: p.b.caption, right: `${p.b.personal_count} / ${p.need} Personal` })),
            empty: 'Keine Wache mit Personalmangel ohne laufende Werbung.',
            hint: 'Startet jeweils die längste Werbephase. Coins werden nie ausgegeben.',
            startLabel: 'Werbung starten',
            async run(ui) {
                let started = 0, skipped = 0, failed = 0;
                for (let i = 0; i < plan.length && !ui.cancelled(); i++) {
                    const { b } = plan[i];
                    ui.busy(i);
                    try {
                        const { running, options } = await hireOptions(b.id);
                        if (running) {
                            ui.done(i, 'skip', '–', 'Werbung läuft schon');
                            ui.setRight(i, 'Werbung läuft schon');
                            skipped++;
                        } else if (!options.length) {
                            throw new Error('Keine Werbe-Option auf der Seite gefunden');
                        } else {
                            const r = await fetch(options[0].href, { credentials: 'include' });
                            if (!r.ok) throw new Error(`HTTP ${r.status}`);
                            ui.done(i, 'ok', '✓');
                            ui.setRight(i, options[0].label || `${options[0].days} Tage`);
                            started++;
                        }
                    } catch (e) {
                        ui.done(i, 'err', '!', e.message);
                        failed++;
                    }
                    ui.progress(i + 1, `${i + 1} von ${plan.length} Wachen${failed ? ` · ${failed} Fehler` : ''}`);
                    await lss.sleep(DELAY);
                }
                return `Fertig! Werbung an ${started} Wache${started === 1 ? '' : 'n'} gestartet${skipped ? `, ${skipped} liefen schon` : ''}${failed ? `, ${failed} Fehler` : ''}.`;
            },
        });
    }

    async function start(buildingIds) {
        try {
            showDialog(await buildPlan(buildingIds));
        } catch (e) {
            lss.report('Personalwerbung', e);
        }
    }

    lss.actions.hire = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '📣 Personalwerbung starten', scope: 'building', order: 35, run: id => start([id]) });
    lss.addTool({ label: '📣 Personalwerbung (alle mit Personalmangel)', scope: 'all', order: 35, run: () => start(null) });
})();

// ===== auslastung.js =====
// LSS Krankenhaus- und Zellen-Auslastung
// Liest von jeder Krankenhaus- und Polizeiseite, wie viele Betten bzw. Zellen belegt sind.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const HOSPITAL = 4;
    // Gebäudetypen mit Zellen und wie viele Zellen sie ohne Ausbau haben
    const CELL_TYPES = { 6: 0, 16: 1, 19: 0, 29: 0 };
    // So viele Gebäudeseiten werden gleichzeitig geladen
    const PARALLEL = 4;

    const STYLE = `
        .al-summary { display:flex; gap:10px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid #3a3f47; background:#1c1f23; }
        .al-tile { flex:1; min-width:200px; background:#2a2e34; border:1px solid #3a3f47; border-radius:8px; padding:10px 14px; }
        .al-tile b { display:block; font-size:22px; color:#fff; font-variant-numeric:tabular-nums; }
        .al-tile span { color:#8b929c; font-size:12px; }
        .al-list { overflow:auto; flex:1; padding:6px 0 12px; }
        .al-section { color:#8b929c; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:12px 18px 6px; }
        .al-row { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 70px 46px; align-items:center; gap:12px; padding:7px 18px; font-size:13px; border-bottom:1px solid #2e3238; }
        .al-row:hover { background:#2a2e34; }
        .al-name { color:#fff !important; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration:none; }
        .al-name:hover { text-decoration:underline; }
        .al-meter { height:8px; border-radius:4px; background:#33373e; overflow:hidden; }
        .al-meter > div { height:100%; border-radius:4px; transition:width .3s; }
        .al-num { text-align:right; color:#e6e6e6; font-variant-numeric:tabular-nums; }
        .al-pct { text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }
        .al-muted { color:#8b929c; }
        .al-loading { padding:30px; text-align:center; color:#8b929c; }
    `;

    function injectStyle() {
        if (document.getElementById('al-style')) return;
        const style = document.createElement('style');
        style.id = 'al-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const color = pct => pct >= 90 ? '#c9302c' : pct >= 70 ? '#e6a23c' : '#2ea043';

    async function loadPage(id) {
        const r = await fetch(`/buildings/${id}`, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return new DOMParser().parseFromString(await r.text(), 'text/html');
    }

    // "Derzeit liegen 4 Patienten in der Notaufnahme ... maximal 30 Patienten aufnehmen."
    function readHospital(doc) {
        const text = doc.body.textContent.replace(/\s+/g, ' ');
        const m = text.match(/(\d+)\s+Patienten[^.]*\.[^.]*?maximal\s+(\d+)\s+Patienten/i);
        return m ? { used: Number(m[1]), max: Number(m[2]) } : null;
    }

    // Belegte Zellen: bisher kein Beispiel mit Gefangenen gesehen, deshalb vorsichtig nach Text suchen
    function readCells(doc) {
        const text = doc.body.textContent.replace(/\s+/g, ' ');
        const m = text.match(/(\d+)\s+(?:Gefangene|Häftlinge|Personen in Gewahrsam)/i);
        return m ? Number(m[1]) : null;
    }

    function cellCapacity(b) {
        const built = (b.extensions ?? []).filter(e => /zelle/i.test(e.caption) && e.available && e.enabled).length;
        return CELL_TYPES[b.building_type] + built;
    }

    async function pool(items, worker, onEach) {
        let next = 0;
        await Promise.all(Array.from({ length: PARALLEL }, async () => {
            while (next < items.length) {
                const item = items[next++];
                try { await worker(item); } catch (e) { item.error = e.message; }
                onEach();
            }
        }));
    }

    function rowHtml(r) {
        const e = lss.escapeHtml;
        const known = r.used != null && r.max > 0;
        const pct = known ? Math.round((r.used / r.max) * 100) : null;
        return `
            <div class="al-row">
                <a class="al-name lightbox-open" href="/buildings/${r.b.id}">${e(r.b.caption)}</a>
                <div class="al-meter">${known ? `<div style="width:${Math.min(pct, 100)}%;background:${color(pct)}"></div>` : ''}</div>
                <span class="al-num">${known ? `${r.used} / ${r.max}` : `<span class="al-muted" title="${e(r.error || 'Belegung nicht lesbar')}">? / ${r.max ?? '?'}</span>`}</span>
                <span class="al-pct" style="color:${known ? color(pct) : '#8b929c'}">${known ? `${pct}%` : ''}</span>
            </div>`;
    }

    function tile(label, list) {
        const known = list.filter(r => r.used != null);
        const used = known.reduce((s, r) => s + r.used, 0);
        const max = known.reduce((s, r) => s + r.max, 0);
        const pct = max ? Math.round((used / max) * 100) : 0;
        return `<div class="al-tile"><span>${label}</span><b style="color:${max ? color(pct) : '#fff'}">${used} / ${max}</b><span>${max ? `${pct}% belegt` : 'keine Daten'}${known.length < list.length ? ` · ${list.length - known.length} nicht lesbar` : ''}</span></div>`;
    }

    async function start() {
        let buildings;
        try {
            buildings = await lss.getJSON('/api/buildings');
        } catch (e) {
            lss.report('Auslastung', e);
            return;
        }
        const hospitals = buildings.filter(b => b.building_type === HOSPITAL).map(b => ({ b, used: null, max: null }));
        const cells = buildings.filter(b => b.building_type in CELL_TYPES && cellCapacity(b) > 0).map(b => ({ b, used: null, max: cellCapacity(b) }));
        const total = hospitals.length + cells.length;

        injectStyle();
        const panel = lss.openPanel({
            title: 'Krankenhaus- & Zellen-Auslastung',
            count: `${hospitals.length} Krankenhäuser · ${cells.length} mit Zellen`,
            body: '<div class="al-summary"></div><div class="al-list"><div class="al-loading">Lade Gebäude … 0 von ' + total + '</div></div>',
        });
        const list = panel.root.querySelector('.al-list');
        let done = 0;

        await pool([...hospitals, ...cells], async r => {
            const doc = await loadPage(r.b.id);
            if (r.b.building_type === HOSPITAL) {
                const h = readHospital(doc);
                if (!h) throw new Error('Bettenanzeige nicht gefunden');
                r.used = h.used;
                r.max = h.max;
            } else {
                r.used = readCells(doc);
            }
        }, () => {
            const loading = list.querySelector('.al-loading');
            if (loading) loading.textContent = `Lade Gebäude … ${++done} von ${total}`;
        });

        const byLoad = (a, b) => (b.used ?? -1) / (b.max || 1) - (a.used ?? -1) / (a.max || 1) || a.b.caption.localeCompare(b.b.caption);
        panel.root.querySelector('.al-summary').innerHTML = tile('🏥 Betten belegt', hospitals) + tile('🚔 Zellen belegt', cells);
        list.innerHTML = `
            ${hospitals.length ? `<div class="al-section">Krankenhäuser</div>${hospitals.sort(byLoad).map(rowHtml).join('')}` : ''}
            ${cells.length ? `<div class="al-section">Zellen</div>${cells.sort(byLoad).map(rowHtml).join('')}` : ''}
            ${total ? '' : '<div class="al-loading">Keine Krankenhäuser oder Zellen gefunden.</div>'}`;
        list.addEventListener('click', e => { if (e.target.closest('.al-name')) panel.close(); });
    }

    lss.actions.occupancy = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '🏥 Krankenhaus- & Zellen-Auslastung', scope: 'all', order: 45, run: start });
})();

// ===== einsatz-helfer.js =====
// LSS Einsatz-Helfer
// Zeigt im Alarmfenster, was der Einsatz braucht, was schon vor Ort ist, anfährt oder ausgewählt ist,
// und was noch fehlt. Datenquelle: /einsaetze.json des Spiels (einmal am Tag geladen).
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Bei Änderungen am gespeicherten Format die Nummer erhöhen, damit neu geladen wird
    const CACHE_KEY = 'einsatzHelfer.missions.v3';
    const CACHE_HOURS = 24;

    // Fahrzeuggruppen (Typ-Nummern aus der LSSM-API). Nach bestem Wissen zugeordnet;
    // bei Abweichungen im Spiel hier anpassen.
    const LF = [0, 1, 6, 7, 8, 9, 30, 37, 88, 89, 90, 107, 163];
    const RW = [4, 30, 47, 90, 162, 163];
    const FUSTW = [32, 103, 184];

    // Anforderung → Bezeichnung und Fahrzeugtypen, die sie erfüllen
    const REQ = {
        firetrucks: ['Löschfahrzeuge', LF],
        battalion_chief_vehicles: ['ELW 1', [3, 34, 78, 128, 129]],
        mobile_command_vehicles: ['ELW 2', [34, 78, 129]],
        platform_trucks: ['Drehleitern', [2, 85]],
        heavy_rescue_vehicles: ['Rüstwagen', RW],
        mobile_air_vehicles: ['GW-Atemschutz', [5, 48]],
        water_tankers: ['Schlauchwagen', [11, 13, 14, 15, 16, 62, 143]],
        gwoil: ['GW-Öl', [10, 49]],
        gwmess: ['GW-Messtechnik', [12]],
        hazmat_vehicles: ['GW-Gefahrgut', [27, 77]],
        hazmat_dekon: ['Dekon-P', [53, 54]],
        height_rescue_units: ['GW-Höhenrettung', [33, 155, 158]],
        fwk: ['Feuerwehrkran', [57]],
        ventilation: ['Lüfter', [114, 115, 116]],
        brush_truck: ['Waldbrand-TLF', [187, 188, 189]],
        wildfire_equipment: ['Waldbrand-Ausrüstung', [190, 191, 192]],
        railway_fire: ['Schienen-Fahrzeuge', [162, 163, 164]],
        arff: ['Flugfeldlöschfahrzeuge', [75]],
        rettungstreppe: ['Rettungstreppen', [76]],
        gw_werkfeuerwehr: ['GW-Werkfeuerwehr', [83]],
        ulf: ['ULF mit Löscharm', [84]],
        teleskopmast: ['Teleskopmasten', [85]],
        turboloescher: ['Turbolöscher', [86]],
        helicopter_bucket: ['Außenlastbehälter', [96]],
        drone: ['Drohnen', [126, 127, 128, 129]],
        oneof_fire_engine_or_rescue: ['Löschfahrzeug oder Rüstwagen', [...LF, ...RW]],
        oneof_fire_engine_or_rescue_or_oil_equipment: ['LF, RW oder GW-Öl', [...LF, ...RW, 10, 49]],
        ambulances: ['RTW', [28, 73, 74]],
        nef: ['NEF', [29, 74, 31, 149]],
        helicopter: ['RTH', [31, 157]],
        gw_san: ['GW-San', [60]],
        seg_elw: ['ELW 1 (SEG)', [59]],
        police_cars: ['Funkstreifenwagen', FUSTW],
        police_motorcycle: ['Polizeimotorräder', [95]],
        civil_patrolcar: ['Zivilstreifenwagen', [98]],
        highway_police: ['FuStW (Autobahnpolizei)', [184]],
        oneof_police_patrol_or_motorcycle: ['FuStW oder Motorrad', [...FUSTW, 95]],
        oneof_police_patrol_or_civil_patrol: ['FuStW oder Zivilstreife', [...FUSTW, 98]],
        oneof_police_patrol_or_civil_patrol_or_motorcycle: ['FuStW, Zivilstreife oder Motorrad', [...FUSTW, 95, 98]],
        police_service_group_leader: ['FuStW (DGL)', [103]],
        police_speaker: ['Lautsprecherwagen', [165]],
        k9: ['Diensthundeführer', [94]],
        police_horse: ['Reiterstaffel', [134, 135, 136]],
        grukw: ['GruKw', [50]],
        lebefkw: ['leBefKw', [35]],
        gefkw: ['GefKw', [52]],
        fukw: ['FüKW (Polizei)', [51]],
        wasserwerfer: ['Wasserwerfer', [72]],
        police_helicopters: ['Polizeihubschrauber', [61, 156]],
        mek: ['MEK-Fahrzeuge', [81, 82]],
        sek: ['SEK-Fahrzeuge', [79, 80]],
        thw_gkw: ['GKW', [39]],
        thw_mtwtz: ['MTW-TZ', [40]],
        thw_mzkw: ['MzGW (FGr N)', [41]],
        thw_lkw: ['LKW K 9', [42]],
        thw_brmg_r: ['BRmG R', [43]],
        thw_dle: ['Anhänger Drucklufterzeugung (Anh DLE)', [44]],
        heavy_rescue: ['MzGW SB', [109]],
        thw_command: ['FüKW (THW)', [144]],
        thw_command_2: ['FüKomKW', [145]],
        thw_command_trailer: ['Anh FüLa', [146]],
        thw_command_3: ['FmKW', [147]],
        thw_command_4: ['MTW-FGr K', [148]],
        energy_supply: ['NEA 50', [110, 111, 175, 179]],
        energy_supply_2: ['NEA 200', [112, 113, 180]],
        water_damage_pump: ['Schmutzwasserpumpen', [101]],
        thw_bridge_construction_equipment: ['MzGW (FGr BrB)', [181]],
        thw_bridge_construction_crane: ['Mobilkran', [182]],
        thw_bridge_construction_trailer: ['Anh Plattform', [183]],
        disaster_response_technology_equipment: ['GW-TeSi', [171]],
        disaster_response_technology_crew: ['MTW-TeSi', [173]],
        disaster_response_technology_trailer: ['Anh TeSi', [174]],
        rescue_dog_units: ['Rettungshunde', [91, 92]],
        boats: ['Boote', [66, 70, 71]],
        diver_units: ['Taucher', [63, 69]],
        mountain: ['GW-Bergrettung', [149, 150]],
        mountain_height_rescue: ['Höhenrettung (Berg)', [155, 158]],
        mountain_command: ['ELW Bergrettung', [151]],
        mountain_snow: ['Schneefahrzeuge', [154]],
        mountain_atv: ['ATV', [152]],
        mountain_equipment: ['Bergrettungs-Ausrüstung', []],
        coastal_helicopter: ['Hubschrauber (Seenot)', [161]],
        coastal_boat_large: ['Seenotrettungskreuzer', [159]],
        oneof_coastal_rescue_boat_or_boat_large: ['Seenotrettungsboot/-kreuzer', [159, 160]],
        animal_rescue: ['Tierrettung', [185, 186]],
        pump: ['Pumpen', []],
        min_pump_speed: ['Mindest-Pumpleistung (l/min)', []],
        lift: ['Hubrettung', []],
        patient_transport: ['Krankentransport', []],
        patient_other_treatment: ['Sonstige Behandlung', []],
    };

    // Mindestpersonal pro Organisation; welche Gebäude zu welcher Organisation gehören
    const ORGS = {
        fire: { label: 'Personal (Feuerwehr)', buildings: [0, 18] },
        ambulance: { label: 'Personal (Rettungsdienst)', buildings: [2, 5, 12, 20] },
        police: { label: 'Personal (Polizei)', buildings: [6, 11, 13, 17, 19, 24, 29] },
        thw: { label: 'Personal (THW)', buildings: [9] },
    };

    // Organisation eines Fahrzeugtyps; Rettungsdienst und Polizei zuerst, weil z.B. ein RTW auch an Feuerwachen stehen kann
    function orgOf(type) {
        const at = type?.possibleBuildings ?? [];
        return ['ambulance', 'police', 'thw', 'fire'].find(o => ORGS[o].buildings.some(b => at.includes(b))) ?? null;
    }

    const STYLE = `
        .eh-box { margin:10px 0; background:#22252a; color:#e6e6e6; border:1px solid #3a3f47; border-radius:8px; overflow:hidden; font-size:13px; }
        .eh-head { display:flex; align-items:center; gap:10px; padding:8px 12px; background:linear-gradient(135deg,var(--lssr-accent,#c9302c),var(--lssr-accent-dark,#8f1f1c)); color:#fff; cursor:pointer; user-select:none; }
        .eh-head b { flex:1; font-size:14px; }
        .eh-pill { background:rgba(255,255,255,.2); border-radius:999px; padding:1px 9px; font-size:12px; font-weight:600; white-space:nowrap; }
        .eh-pill.ok { background:#2ea043; } .eh-pill.miss { background:#fff; color:#c9302c; }
        .eh-box.collapsed .eh-body { display:none; }
        .eh-table { width:100%; border-collapse:collapse; }
        .eh-table th { color:#8b929c; font-weight:600; font-size:11px; text-transform:uppercase; text-align:right; padding:6px 10px; border-bottom:1px solid #3a3f47; }
        .eh-table th:first-child, .eh-table td:first-child { text-align:left; padding-left:12px; }
        .eh-table td { padding:5px 10px; border-bottom:1px solid #2e3238; text-align:right; font-variant-numeric:tabular-nums; }
        .eh-table tr.miss td:first-child { border-left:3px solid #c9302c; padding-left:9px; }
        .eh-table tr.done td:first-child { border-left:3px solid #2ea043; padding-left:9px; }
        .eh-table tr.maybe td { color:#aab0b8; }
        .eh-zero { color:#4b5058; }
        .eh-missing { color:#ff8a84; font-weight:700; }
        .eh-ok { color:#5cd178; font-weight:700; }
        .eh-chance { color:#e6a23c; font-size:11px; margin-left:4px; }
        .eh-info { display:flex; flex-wrap:wrap; gap:6px 16px; padding:8px 12px; color:#aab0b8; border-top:1px solid #3a3f47; background:#1c1f23; }
        .eh-info b { color:#fff; }
        .eh-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:8px 12px; border-top:1px solid #3a3f47; }
        .eh-pick { background:#2ea043; color:#fff; border:0; border-radius:6px; padding:6px 14px; font-weight:600; cursor:pointer; }
        .eh-pick:hover { filter:brightness(1.15); }
        .eh-msg { color:#aab0b8; }
        .eh-msg b { color:#fff; }
    `;

    function injectStyle(doc) {
        if (doc.getElementById('eh-style')) return;
        const style = doc.createElement('style');
        style.id = 'eh-style';
        style.textContent = STYLE;
        doc.head.append(style);
    }

    // Einsatzarten aus /einsaetze.json, verkleinert und einen Tag lang in Tampermonkey zwischengespeichert
    async function getMissionTypes() {
        const cached = GM_getValue(CACHE_KEY, null);
        if (cached && Date.now() - cached.time < CACHE_HOURS * 3600e3) return cached.data;
        const list = await lss.getJSON('/einsaetze.json');
        const data = {};
        for (const m of list) {
            data[m.id] = {
                name: m.name,
                credits: m.average_credits,
                req: m.requirements ?? {},
                chances: m.chances ?? {},
                add: {
                    patients: m.additional?.possible_patient,
                    patientsMin: m.additional?.possible_patient_min,
                    prisoners: m.additional?.max_possible_prisoners,
                    duration: m.additional?.duration_text,
                    educations: m.additional?.personnel_educations,
                    followup: (m.additional?.followup_missions_ids?.length || 0) + (m.additional?.subsequent_missions_ids?.length || 0),
                    ktwInsteadOfRtw: m.additional?.allow_ktw_instead_of_rtw,
                    ktwBInsteadOfRtw: m.additional?.allow_ktw_b_instead_of_rtw,
                    specializations: m.additional?.patient_specializations,
                },
                personnel: Object.fromEntries(Object.keys(ORGS)
                    .map(o => [o, m.additional?.[`average_min_${o}_personnel`]])
                    .filter(([, n]) => n > 0)),
                // z.B. {thw: ["fire"]}: THW-Personal zählt beim Feuerwehr-Personal mit
                inclusions: m.additional?.personnel_inclusions ?? {},
            };
        }
        GM_setValue(CACHE_KEY, { time: Date.now(), data });
        return data;
    }

    // Einsatzart aus dem Link "Hilfe zu diesem Einsatz", mit Variante (z.B. "2-0" oder "1/a")
    function missionTypeKey(missions) {
        const help = document.querySelector('#mission_help, #mission-type-helper-mobile');
        if (!help) return null;
        const url = new URL(help.getAttribute('href'), location.origin);
        const id = url.pathname.match(/\/einsaetze\/(\d+)/)?.[1];
        if (!id) return null;
        const overlay = url.searchParams.get('overlay_index');
        const additive = url.searchParams.get('additive_overlays');
        const candidates = [
            overlay && additive ? `${id}-${overlay}/${additive}` : null,
            overlay ? `${id}-${overlay}` : null,
            additive ? `${id}/${additive}` : null,
            id,
        ].filter(Boolean);
        return candidates.find(k => missions[k]) ?? null;
    }

    // "1,3 km" → 1.3, "05:12" → 312; Hauptsache, kleiner heißt näher. Unlesbar → ganz hinten
    // "01 Min. 22 Sek." → 82, "1 Std. 5 Min." → 3900, "05:12" → 312, "1,3 km" → 1.3.
    // Hauptsache, kleiner heißt näher. Unlesbar → ganz hinten
    function parseDistance(text) {
        const unit = re => Number(text.match(re)?.[1] ?? 0);
        if (/min|sek|std/i.test(text)) return unit(/(\d+)\s*Std/i) * 3600 + unit(/(\d+)\s*Min/i) * 60 + unit(/(\d+)\s*Sek/i);
        const time = text.match(/(\d+):(\d{2})/);
        if (time) return Number(time[1]) * 60 + Number(time[2]);
        const num = text.match(/(\d+(?:[.,]\d+)?)/);
        return num ? Number(num[1].replace(',', '.')) : Infinity;
    }

    // Patientenzahl im Alarmfenster; null, wenn keine Angabe zu finden ist.
    // 1. Patienten-Kärtchen zählen, 2. Text "3 Patienten - 2 unbehandelte", 3. Überschrift "3 Patienten".
    // Der Text unseres eigenen Kastens ("bis zu 3 Patienten") wird dabei nicht mitgelesen.
    // Die Patienten-Kärtchen im Alarmfenster (ohne verschachtelte Doppel-Treffer)
    function patientCards() {
        return [...document.querySelectorAll('.mission_patient, div[id^="patient_"]')]
            .filter(el => !el.closest('.eh-box') && (el.classList.contains('mission_patient') || /^patient_\d+$/.test(el.id)))
            .filter((el, _, all) => !all.some(o => o !== el && o.contains(el)));
    }

    function patientsOnPage() {
        const own = el => el.closest('.eh-box');
        const cards = patientCards();
        if (cards.length) return cards.length;
        const texts = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,small,span,div,p')]
            .filter(el => !own(el) && el.children.length <= 3 && el.textContent.length < 120 && /Patient/i.test(el.textContent))
            .map(el => el.textContent.replace(/\s+/g, ' '));
        for (const re of [/(\d+)\s+Patienten?\s*-\s*\d+\s+unbehandelte/i, /^\s*(\d+)\s+Patienten?\b/i]) {
            for (const t of texts) {
                const m = t.match(re);
                if (m) return Number(m[1]);
            }
        }
        return null;
    }

    // Rote Meldung des Spiels oben im Alarmfenster: "Fehlende Fahrzeuge: 1 Drehleiter (DLK 23), 1 FwK"
    // → [{ count: 1, text: 'Drehleiter (DLK 23)' }, { count: 1, text: 'FwK' }]
    function gameMissingOnPage() {
        const el = [...document.querySelectorAll('#missing_text, .alert, div, span, p')]
            .find(x => !x.closest('.eh-box') && /Fehlende Fahrzeuge:\s*\S/i.test(x.textContent) && x.textContent.length < 600
                && ![...x.children].some(c => /Fehlende Fahrzeuge:\s*\S/i.test(c.textContent)));
        if (!el) return [];
        // Nur der Teil mit den Fahrzeugen; Sätze danach (z.B. Personal, Wasser) gehören nicht dazu
        const part = el.textContent.replace(/\s+/g, ' ').split(/Fehlende Fahrzeuge:/i)[1].split(/\.\s+[A-ZÄÖÜ]|\.$/)[0];
        return part.split(/,\s*|\s+und\s+/)
            .map(s => s.trim().match(/^(\d+)\s*x?\s+(.+)$/))
            .filter(Boolean)
            .map(m => ({ count: Number(m[1]), text: m[2].trim() }));
    }

    // Was die Patienten-Kärtchen verlangen ("Wir benötigen: LNA"). perPatient: jeder Patient braucht ein
    // eigenes Fahrzeug; sonst reicht eines für alle (z.B. ein LNA für den ganzen Einsatz).
    const PATIENT_NEEDS = [
        { re: /\bRTW\b/, label: 'RTW', typeIds: [28, 73, 74], perPatient: true },
        { re: /\bNEF\b|(?<!Leitende[rn]? )Notarzt/i, label: 'NEF', typeIds: [29, 74, 31, 149], perPatient: true },
        { re: /\bRTH\b|Hubschrauber/i, label: 'RTH', typeIds: [31, 157], perPatient: true },
        { re: /\bLNA\b|Leitende[rn]? Notarzt/i, label: 'LNA', typeIds: [55], perPatient: false },
        { re: /\bOrgL\b|Organisatorische[rn]? Leiter/i, label: 'OrgL', typeIds: [56], perPatient: false },
    ];

    // { label: Anzahl Patienten, die es verlangen }; unbekannte Wünsche unter ihrem Text.
    // Gezählt wird pro Patient (jedes Kärtchen höchstens einmal je Wunsch), nie mehr als es Patienten gibt.
    function patientNeedsOnPage() {
        const hasNeed = el => /Wir benötigen:\s*\S/i.test(el.textContent);
        const visible = el => el.getClientRects().length > 0;
        // Pro Kärtchen nur der rote Hinweis selbst (innerstes Element), nicht die kleinen Schilder darunter
        const innermost = root => [...root.querySelectorAll('div, span, p')]
            .filter(el => hasNeed(el) && ![...el.children].some(hasNeed))
            .map(el => el.textContent).join(' ');
        let groups = patientCards().filter(hasNeed).map(card => innermost(card) || card.textContent);
        if (!groups.length) {
            // Keine Kärtchen erkannt: einzelne Hinweise, jeweils das innerste sichtbare Element
            groups = [...document.querySelectorAll('div, span, p')]
                .filter(el => !el.closest('.eh-box') && hasNeed(el) && el.textContent.length < 160 && visible(el))
                .filter(el => ![...el.children].some(hasNeed))
                .map(el => el.textContent);
        }
        const needs = {};
        for (const raw of groups) {
            const seen = new Set();
            for (const part of raw.replace(/\s+/g, ' ').split(/Wir benötigen:/i).slice(1)) {
                const text = part.slice(0, 80);
                let known = false;
                for (const n of PATIENT_NEEDS) if (n.re.test(text)) { seen.add(n.label); known = true; }
                if (!known && text.trim()) seen.add(text.trim().slice(0, 40));
            }
            for (const label of seen) needs[label] = (needs[label] || 0) + 1;
        }
        const patients = patientsOnPage();
        if (patients) for (const label of Object.keys(needs)) needs[label] = Math.min(needs[label], patients);
        return needs;
    }

    // Alle Fahrzeuge in den Fahrzeuglisten des Alarmfensters, nächstes zuerst. Ein Fahrzeug kann in
    // mehreren Reitern (z.B. "Alle" und "Feuerwehr") stehen, deshalb nach Fahrzeug-ID entdoppeln.
    // ownVehicles: Fahrzeugdaten aus /api/vehicles, falls die Seite den Typ nicht direkt angibt
    function alarmList(ownVehicles) {
        const found = new Map();
        const distCol = new Map();
        document.querySelectorAll('input[type="checkbox"]').forEach(input => {
            const row = input.closest('tr');
            const table = row?.closest('table');
            if (!input.classList.contains('vehicle_checkbox') && !table?.id.startsWith('vehicle_show_table')) return;
            const id = [input.value, input.getAttribute('vehicle_id'), row?.id?.match(/\d+/)?.[0]].find(v => /^\d+$/.test(v ?? ''));
            const typeAttr = input.getAttribute('vehicle_type_id') ?? row?.querySelector('[vehicle_type_id]')?.getAttribute('vehicle_type_id');
            const type = typeAttr != null ? Number(typeAttr) : ownVehicles?.[id]?.vehicle_type;
            if (type == null || Number.isNaN(type)) return;
            const key = id ?? `${type}-${found.size}`;
            // Steht das Fahrzeug schon in einem anderen Reiter, zählt nur, ob es irgendwo angehakt ist
            if (found.has(key)) {
                if (input.checked) found.get(key).checked = true;
                return;
            }
            if (table && !distCol.has(table)) {
                distCol.set(table, [...table.querySelectorAll('thead th')].findIndex(th => /entfernung/i.test(th.textContent)));
            }
            const col = table ? distCol.get(table) : -1;
            const dist = col >= 0 ? parseDistance(row.cells[col]?.textContent ?? '') : Infinity;
            found.set(key, { id, type, input, checked: input.checked, dist });
        });
        return [...found.values()].sort((a, b) => a.dist - b.dist);
    }

    const selectedVehicles = ownVehicles => alarmList(ownVehicles).filter(v => v.checked);

    // Fahrzeugtypen zählen: vor Ort, auf Anfahrt und im Alarmfenster angehakt
    function countVehicles(selected) {
        const count = sel => {
            const c = {};
            document.querySelectorAll(sel).forEach(el => {
                const t = Number(el.getAttribute('vehicle_type_id'));
                if (!Number.isNaN(t)) c[t] = (c[t] || 0) + 1;
            });
            return c;
        };
        const picked = {};
        for (const v of selected) picked[v.type] = (picked[v.type] || 0) + 1;
        return {
            scene: count('#mission_vehicle_at_mission a[vehicle_type_id]'),
            driving: count('#mission_vehicle_driving a[vehicle_type_id]'),
            selected: picked,
        };
    }

    // Besatzung angehakter Fahrzeuge aus deinen Fahrzeugdaten; null, wenn die Daten fehlen
    function crewOfSelected(selected, ownVehicles, types) {
        if (!ownVehicles) return null;
        const crew = {};
        for (const v of selected) {
            const org = orgOf(types[v.type]);
            const n = ownVehicles[v.id]?.assigned_personnel_count ?? 0;
            if (org && n > 0) crew[org] = (crew[org] || 0) + n;
        }
        return crew;
    }

    // Besatzung pro Organisation aus der Spalte "Besatzung" der Fahrzeugtabelle
    function countCrew(tableId, types) {
        const table = document.getElementById(tableId);
        const crew = {};
        if (!table) return crew;
        const heads = [...table.querySelectorAll('thead th')];
        let col = heads.findIndex(th => th.querySelector('img[title="Besatzung"]') || /besatzung/i.test(th.textContent));
        if (col < 0) col = 3;
        table.querySelectorAll('tbody tr').forEach(row => {
            const link = row.querySelector('a[vehicle_type_id]');
            const org = link && orgOf(types[link.getAttribute('vehicle_type_id')]);
            const n = parseInt(row.cells[col]?.textContent, 10);
            if (org && n > 0) crew[org] = (crew[org] || 0) + n;
        });
        return crew;
    }

    // Personal der Organisation plus aller Organisationen, die laut Einsatz mitzählen dürfen
    const crewFor = (crew, org, inclusions) =>
        Object.entries(crew).reduce((s, [o, n]) => s + (o === org || inclusions[o]?.includes(org) ? n : 0), 0);

    const sumFor = (counts, typeIds) => typeIds.reduce((s, t) => s + (counts[t] || 0), 0);

    // Wasser bzw. Schaum der vorhandenen Fahrzeuge aus der LSSM-API
    const tankFor = (counts, types, field) =>
        Object.entries(counts).reduce((s, [t, n]) => s + (types[t]?.[field] || 0) * n, 0);

    function buildRows(m, counts, types) {
        const rows = [];
        for (const [key, needed] of Object.entries(m.req)) {
            if (key === 'personnel_educations' || typeof needed !== 'number') continue;
            if (key === 'water_needed' || key === 'foam_needed') {
                const field = key === 'water_needed' ? 'waterTank' : 'foamTank';
                rows.push({
                    label: key === 'water_needed' ? 'Wasser (Liter)' : 'Schaum (Liter)', needed, chance: null, tank: field,
                    scene: tankFor(counts.scene, types, field), driving: tankFor(counts.driving, types, field), selected: tankFor(counts.selected, types, field),
                });
                continue;
            }
            const [label, typeIds] = REQ[key] ?? [key, []];
            rows.push({
                key, label, needed, chance: m.chances[key] ?? null, unknown: !typeIds.length, typeIds,
                scene: sumFor(counts.scene, typeIds), driving: sumFor(counts.driving, typeIds), selected: sumFor(counts.selected, typeIds),
            });
        }
        // Patienten brauchen je einen RTW (oder KTW, wo das Spiel es erlaubt), sofern der Einsatz nicht
        // ohnehin feste RTW verlangt. Zahl aus dem Alarmfenster, sonst die Mindestzahl aus den Spieldaten.
        const patients = counts.patients ?? m.add.patientsMin ?? 0;
        if (patients > 0 && !('ambulances' in m.req)) {
            const typeIds = [...REQ.ambulances[1], ...(m.add.ktwInsteadOfRtw ? [38] : []), ...(m.add.ktwBInsteadOfRtw ? [58] : [])];
            rows.push({
                key: 'ambulances', label: `RTW (${patients} Patient${patients === 1 ? '' : 'en'})`, needed: patients, chance: null, typeIds,
                scene: sumFor(counts.scene, typeIds), driving: sumFor(counts.driving, typeIds), selected: sumFor(counts.selected, typeIds),
            });
        }
        // Fahrzeuge, die nur mit Wahrscheinlichkeit gebraucht werden, aber nicht in den festen Anforderungen stehen.
        // Transport-Wahrscheinlichkeiten sind kein Fahrzeug, die stehen unten in der Infozeile.
        for (const [key, chance] of Object.entries(m.chances)) {
            if (key in m.req || key === 'patient_transport' || key === 'patient_other_treatment') continue;
            const [label, typeIds] = REQ[key] ?? [key, []];
            rows.push({
                key, label, needed: 1, chance, unknown: !typeIds.length, typeIds,
                scene: sumFor(counts.scene, typeIds), driving: sumFor(counts.driving, typeIds), selected: sumFor(counts.selected, typeIds),
            });
        }
        // Rote Meldung des Spiels "Fehlende Fahrzeuge: 1 Drehleiter (DLK 23), 1 FwK": das Spiel hat entschieden,
        // dass diese Fahrzeuge wirklich gebraucht werden. Passende Zeilen werden zur festen Anforderung.
        // Einzahl/Mehrzahl angleichen: "Löschfahrzeug" = "Löschfahrzeuge", "Drehleiter" = "Drehleitern"
        const stem = w => (w.length > 4 ? w.replace(/(en|e|n|s)$/, '') : w);
        const norm = t => String(t ?? '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim().split(' ').map(stem).join(' ');
        const contains = (hay, needle) => needle && ` ${hay} `.includes(` ${needle} `);
        // Passt die Meldung zu einer Anforderung? Über den Namen, die Abkürzung in Klammern ("(LF)")
        // oder den Kurznamen eines passenden Fahrzeugtyps ("DLK 23", "FwK")
        const matches = (item, label, typeIds) => {
            const text = norm(item.text);
            const name = norm(item.text.replace(/\(.*?\)/g, ''));
            const abbr = norm(item.text.match(/\(([^)]+)\)/)?.[1]);
            const captions = typeIds.map(t => norm(types[t]?.caption)).filter(Boolean);
            return contains(text, norm(label)) || contains(norm(label), name)
                || captions.some(c => contains(text, c) || (abbr && contains(c, abbr)));
        };
        for (const item of counts.gameMissing ?? []) {
            let row = rows.find(r => r.typeIds?.length && matches(item, r.label, r.typeIds));
            // Noch keine Zeile dafür: aus der Anforderungsliste eine anlegen
            if (!row) {
                const entry = Object.entries(REQ).find(([, [label, ids]]) => ids.length && matches(item, label, ids));
                if (entry) {
                    const [key, [label, typeIds]] = entry;
                    row = {
                        key, label, needed: 0, chance: null, unknown: false, typeIds,
                        scene: sumFor(counts.scene, typeIds), driving: sumFor(counts.driving, typeIds), selected: sumFor(counts.selected, typeIds),
                    };
                    rows.push(row);
                }
            }
            if (row) {
                const firm = row.chance != null ? 0 : row.needed;
                // Das Spiel zählt nur Fahrzeuge VOR ORT; was auf Anfahrt ist, steht dort noch als fehlend
                row.needed = Math.max(firm, row.scene + item.count);
                row.chance = null;
                row.unknown = false;
                continue;
            }
            rows.push({
                label: `${item.text} (laut Spiel)`, needed: item.count, chance: null, unknown: true,
                scene: 0, driving: 0, selected: 0,
            });
        }
        // Wünsche der Patienten ("Wir benötigen: LNA"): RTW steckt schon in der Patienten-Zeile.
        // Gibt es schon eine Zeile für dasselbe Fahrzeug (z.B. NEF 30 %), wird sie zur festen Anforderung.
        for (const [label, count] of Object.entries(counts.patientNeeds ?? {})) {
            if (label === 'RTW') continue;
            const def = PATIENT_NEEDS.find(n => n.label === label);
            const typeIds = def?.typeIds ?? [];
            // Der rote Hinweis verschwindet, sobald der Patient versorgt ist. Fahrzeuge VOR ORT haben ihren
            // Patienten also schon und kommen obendrauf; Fahrzeuge auf Anfahrt decken noch offene Hinweise ab.
            const scene = sumFor(counts.scene, typeIds);
            const needed = scene + (def?.perPatient === false ? 1 : count);
            const existing = def && rows.find(r => r.label === def.label || (r.typeIds && r.typeIds.join() === typeIds.join()));
            if (existing) {
                existing.needed = Math.max(existing.chance != null ? 0 : existing.needed, needed);
                existing.chance = null;
                existing.typeIds = existing.typeIds ?? typeIds;
                continue;
            }
            rows.push({
                key: `patient_${label}`, label: `${label} (Patienten)`, needed, chance: null, unknown: !typeIds.length, typeIds,
                scene, driving: sumFor(counts.driving, typeIds), selected: sumFor(counts.selected, typeIds),
            });
        }
        // Mindestpersonal; angehakte Fahrzeuge mit ihrer zugewiesenen Besatzung (falls bekannt)
        for (const [org, needed] of Object.entries(m.personnel ?? {})) {
            rows.push({
                label: ORGS[org].label, needed, chance: null, org,
                scene: crewFor(counts.crewScene ?? {}, org, m.inclusions ?? {}),
                driving: crewFor(counts.crewDriving ?? {}, org, m.inclusions ?? {}),
                selected: counts.crewSelected ? crewFor(counts.crewSelected, org, m.inclusions ?? {}) : null,
            });
        }
        for (const r of rows) r.missing = Math.max(0, r.needed - r.scene - r.driving - (r.selected ?? 0));
        // Fehlende zuerst, Wahrscheinlichkeiten nach hinten
        return rows.sort((a, b) => (b.missing > 0) - (a.missing > 0) || (a.chance != null) - (b.chance != null) || b.needed - a.needed);
    }

    // Hakt für jede sicher fehlende Anforderung das nächste passende, noch nicht gewählte Fahrzeug an.
    // Alarmiert wird nichts, das bleibt beim Spieler. computeRows liefert die Zeilen zum aktuellen Stand.
    function pickMissing(m, types, ownVehicles, computeRows) {
        const picked = [];
        const fits = (r, v) => {
            if (r.typeIds) return r.typeIds.includes(v.type);
            if (r.tank) return (types[v.type]?.[r.tank] || 0) > 0;
            if (r.org) {
                const org = orgOf(types[v.type]);
                const allowed = org === r.org || m.inclusions?.[org]?.includes(r.org);
                return allowed && (ownVehicles?.[v.id]?.assigned_personnel_count ?? 0) > 0;
            }
            return false;
        };
        // Fahrzeug-Anforderungen zuerst, dann Wasser/Schaum, dann Personal: Fahrzeuge bringen oft beides mit
        const order = r => (r.typeIds ? 0 : r.tank ? 1 : 2);
        for (let guard = 0; guard < 80; guard++) {
            const open = computeRows()
                .filter(r => r.missing > 0 && r.chance == null && !r.unknown && (r.typeIds || r.tank || r.org))
                .sort((a, b) => order(a) - order(b));
            const free = alarmList(ownVehicles).filter(v => !v.checked);
            let choice = null;
            for (const r of open) {
                choice = free.find(v => fits(r, v));
                if (choice) break;
            }
            if (!choice) break;
            choice.input.click();
            picked.push(choice);
        }
        const stillMissing = computeRows().filter(r => r.missing > 0 && r.chance == null);
        return { picked: picked.length, stillMissing };
    }

    function render(box, m, rows, collapsed, pickMsg) {
        const e = lss.escapeHtml;
        const fmt = n => n.toLocaleString('de-DE');
        const num = n => n ? fmt(n) : '<span class="eh-zero">0</span>';
        const sure = rows.filter(r => r.chance == null && !r.unknown);
        const missingCount = sure.filter(r => r.missing > 0).length;
        const info = [
            m.credits ? `💰 <b>~${fmt(m.credits)}</b> Credits` : '',
            m.add.patients ? `🚑 bis zu <b>${m.add.patients}</b> Patienten${m.add.patientsMin ? ` (mind. ${m.add.patientsMin})` : ''}` : '',
            m.add.ktwInsteadOfRtw || m.add.ktwBInsteadOfRtw ? 'KTW statt RTW möglich' : '',
            m.chances.patient_transport != null || m.add.specializations
                ? `🏥 ${m.chances.patient_transport != null ? `Transport zu <b>${m.chances.patient_transport} %</b>` : 'Transport'}${m.add.specializations ? ` · ${e(m.add.specializations)}` : ''}`
                : '',
            m.add.prisoners ? `🚔 bis zu <b>${m.add.prisoners}</b> Gefangene` : '',
            m.add.duration ? `⏱ ${e(m.add.duration)}` : '',
            m.add.educations ? `🎓 ${Object.entries(m.add.educations).map(([k, n]) => `${n}× ${e(k)}`).join(', ')}` : '',
            m.add.followup ? '↪ Folgeeinsatz möglich' : '',
        ].filter(Boolean);

        box.className = `eh-box${collapsed ? ' collapsed' : ''}`;
        box.innerHTML = `
            <div class="eh-head">
                <b>🧭 Einsatz-Helfer: ${e(m.name)}</b>
                <span class="eh-pill ${missingCount ? 'miss' : 'ok'}">${missingCount ? `${missingCount} fehlt` : '✓ alles da'}</span>
                <span>${collapsed ? '▸' : '▾'}</span>
            </div>
            <div class="eh-body">
                ${rows.length ? `
                <table class="eh-table">
                    <thead><tr><th>Benötigt</th><th>Soll</th><th>Vor Ort</th><th>Anfahrt</th><th>Gewählt</th><th>Fehlt</th></tr></thead>
                    <tbody>${rows.map(r => `
                        <tr class="${r.chance != null ? 'maybe' : r.missing ? 'miss' : 'done'}">
                            <td>${e(r.label)}${r.chance != null ? `<span class="eh-chance">${r.chance} %</span>` : ''}${r.unknown ? ' <span class="eh-zero" title="Fahrzeugtyp nicht zugeordnet">?</span>' : ''}</td>
                            <td>${fmt(r.needed)}</td>
                            <td>${num(r.scene)}</td>
                            <td>${num(r.driving)}</td>
                            <td>${r.selected == null ? '<span class="eh-zero" title="Besatzung angehakter Fahrzeuge ist vorher nicht bekannt">–</span>' : num(r.selected)}</td>
                            <td>${!r.missing ? '<span class="eh-ok">✓</span>'
                                : r.chance != null ? `<span class="eh-chance">evtl. ${fmt(r.missing)}</span>`
                                : `<span class="eh-missing">${fmt(r.missing)}</span>`}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : '<div class="eh-info">Keine besonderen Anforderungen: ein passendes Fahrzeug reicht.</div>'}
                ${missingCount || pickMsg ? `
                <div class="eh-actions">
                    ${missingCount ? '<button type="button" class="eh-pick">✓ Fehlendes auswählen</button>' : ''}
                    ${pickMsg ? `<span class="eh-msg">${pickMsg}</span>` : ''}
                </div>` : ''}
                ${info.length ? `<div class="eh-info">${info.map(i => `<span>${i}</span>`).join('')}</div>` : ''}
            </div>`;
    }

    async function init() {
        if (!/^\/missions\/\d+/.test(location.pathname)) return;
        const anchor = document.querySelector('#missing_text') ?? document.querySelector('#missionH1');
        if (!anchor) return;

        let missions, types;
        try {
            [missions, types] = await Promise.all([getMissionTypes(), lss.getVehicleTypes()]);
        } catch (e) {
            lss.report('Einsatz-Helfer', e);
            return;
        }
        const key = missionTypeKey(missions);
        if (!key) return;
        const m = missions[key];
        // Für den Kauf-Berater: welche Einsätze bei dir vorkommen
        const missionId = location.pathname.match(/\/missions\/(\d+)/)[1];
        lss.actions.recordMission?.(missionId, key);

        injectStyle(document);
        const box = document.createElement('div');
        anchor.after(box);
        let collapsed = false;
        try { collapsed = localStorage.getItem('einsatzHelfer.collapsed') === '1'; } catch (e) { /* kein Speicher */ }

        // Eigene Fahrzeuge (für Typ und Besatzung angehakter Fahrzeuge); ohne sie zeigt "Gewählt" beim Personal "–"
        let ownVehicles = null;
        lss.getJSON('/api/vehicles')
            .then(list => { ownVehicles = Object.fromEntries(list.map(v => [String(v.id), v])); update(); })
            .catch(e => lss.report('Einsatz-Helfer (Fahrzeugdaten)', e));

        let lastState = '';
        let pickMsg = '';
        let picking = false;
        const computeRows = () => {
            const selected = selectedVehicles(ownVehicles);
            return buildRows(m, {
                ...countVehicles(selected),
                crewScene: countCrew('mission_vehicle_at_mission', types),
                crewDriving: countCrew('mission_vehicle_driving', types),
                crewSelected: crewOfSelected(selected, ownVehicles, types),
                patients: patientsOnPage(),
                patientNeeds: patientNeedsOnPage(),
                gameMissing: gameMissingOnPage(),
            }, types);
        };
        const update = () => {
            if (picking) return;
            lastState = state();
            render(box, m, computeRows(), collapsed, pickMsg);
        };
        // Kurzer Fingerabdruck von Auswahl und Fahrzeuglisten, um Änderungen zu erkennen
        const state = () => [
            selectedVehicles(ownVehicles).map(v => v.id).join(','),
            document.querySelectorAll('#mission_vehicle_at_mission tr, #mission_vehicle_driving tr').length,
            ownVehicles ? 1 : 0,
            patientsOnPage(),
            JSON.stringify(patientNeedsOnPage()),
            JSON.stringify(gameMissingOnPage()),
        ].join('|');
        box.addEventListener('click', e => {
            if (e.target.closest('.eh-pick')) {
                picking = true;
                let result;
                try {
                    result = pickMissing(m, types, ownVehicles, computeRows);
                } finally {
                    picking = false;
                }
                const e2 = lss.escapeHtml;
                const rest = result.stillMissing.map(r => e2(r.label));
                // Für den Kauf-Berater: wofür kein freies Fahrzeug da war
                result.stillMissing.filter(r => r.key).forEach(r => lss.actions.recordShortage?.(missionId, r.key));
                pickMsg = result.picked
                    ? `<b>${result.picked}</b> Fahrzeug${result.picked === 1 ? '' : 'e'} ausgewählt. Alarmieren musst du selbst.${rest.length ? ` Kein freies Fahrzeug für: ${rest.join(', ')}` : ''}`
                    : `Kein passendes freies Fahrzeug in der Liste${rest.length ? ` für: ${rest.join(', ')}` : ''}.`;
                update();
                return;
            }
            if (!e.target.closest('.eh-head')) return;
            collapsed = !collapsed;
            try { localStorage.setItem('einsatzHelfer.collapsed', collapsed ? '1' : '0'); } catch (err) { /* kein Speicher */ }
            update();
        });
        // Auswahl per Klick oder über Alarm-Knöpfe löst nicht immer ein Ereignis aus,
        // deshalb regelmäßig nachsehen und nur bei Änderungen neu zeichnen
        document.addEventListener('change', () => update());
        setInterval(() => { if (state() !== lastState) update(); }, 500);
        update();
    }

    if (lss.isWorkerFrame) return;
    // Für den Kauf-Berater: Zuordnung Anforderung → Fahrzeugtypen und die Einsatzdaten
    lss.actions.missionRequirements = REQ;
    lss.actions.missionTypes = getMissionTypes;

    lss.safe('Einsatz-Helfer', init)();
})();

// ===== dashboard.js =====
// LSS Dashboard
// Alle wichtigen Zahlen auf einen Blick: Credits, Einsätze, Fahrzeuge, Sprechwünsche, Personal,
// Probleme aus dem Wachen-Check, dazu Schnellzugriff auf die anderen Werkzeuge.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Einsatzlisten der Hauptseite (fehlen sie, wird die Kachel ausgeblendet)
    const MISSION_LISTS = {
        own: '#mission_list',
        transport: '#mission_list_krankentransporte',
        alliance: '#mission_list_alliance',
        event: '#mission_list_alliance_event',
        guard: '#mission_list_sicherheitswache',
    };

    const STYLE = `
        .db-body { overflow:auto; flex:1; padding:14px 16px 16px; display:flex; flex-direction:column; gap:14px; }
        .db-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:10px; }
        .db-tile { background:#2a2e34; border:1px solid #3a3f47; border-radius:8px; padding:10px 14px; min-width:0; }
        .db-tile.click { cursor:pointer; transition:border-color .15s; }
        .db-tile.click:hover { border-color:var(--lssr-accent,#c9302c); }
        .db-label { color:#8b929c; font-size:12px; }
        .db-value { color:#fff; font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1.25; }
        .db-value.db-small { font-size:17px; padding:4px 0; }
        .db-sub { color:#aab0b8; font-size:12px; }
        .db-sub b { color:#fff; }
        .db-red { color:#ff8a84 !important; } .db-yellow { color:#f0b75e !important; } .db-green { color:#5cd178 !important; }
        .db-bar { display:flex; height:6px; border-radius:3px; overflow:hidden; background:#33373e; margin-top:6px; }
        .db-section { color:#8b929c; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:-6px; }
        .db-list { background:#2a2e34; border:1px solid #3a3f47; border-radius:8px; max-height:180px; overflow:auto; }
        .db-list a { display:flex; justify-content:space-between; gap:10px; padding:6px 12px; border-bottom:1px solid #33373e; color:#e6e6e6 !important; text-decoration:none; font-size:13px; }
        .db-list a:last-child { border-bottom:0; }
        .db-list a:hover { background:#33373e; }
        .db-list small { color:#8b929c; white-space:nowrap; }
        .db-empty { padding:10px 12px; color:#8b929c; font-size:13px; }
        .db-tools { display:flex; flex-wrap:wrap; gap:8px; }
        .db-tools .lssr-btn { padding:7px 12px; font-size:13px; }
        .db-foot { display:flex; justify-content:space-between; align-items:center; color:#8b929c; font-size:12px; }
    `;

    function injectStyle() {
        if (document.getElementById('db-style')) return;
        const style = document.createElement('style');
        style.id = 'db-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const fmt = n => Number(n ?? 0).toLocaleString('de-DE');

    // Offene Einsätze aus der Einsatzliste der Hauptseite; Farbe = Status (rot: niemand unterwegs)
    function missionCounts() {
        const doc = window.top.document;
        const result = {};
        let found = false;
        for (const [key, sel] of Object.entries(MISSION_LISTS)) {
            const list = doc.querySelector(sel);
            if (!list) continue;
            found = true;
            const entries = [...list.querySelectorAll('.missionSideBarEntry')].filter(el => el.style.display !== 'none');
            result[key] = {
                total: entries.length,
                red: entries.filter(el => el.querySelector('.mission_panel_red')).length,
                yellow: entries.filter(el => el.querySelector('.mission_panel_yellow')).length,
                green: entries.filter(el => el.querySelector('.mission_panel_green')).length,
            };
        }
        return found ? result : null;
    }

    function tile({ label, value, sub = '', cls = '', action = '', bar = '' }) {
        return `
            <div class="db-tile${action ? ' click' : ''}"${action ? ` data-action="${action}"` : ''}>
                <div class="db-label">${label}</div>
                <div class="db-value ${cls}">${value}</div>
                ${sub ? `<div class="db-sub">${sub}</div>` : ''}
                ${bar}
            </div>`;
    }

    const stackBar = parts => {
        const total = parts.reduce((s, p) => s + p.n, 0);
        return total ? `<div class="db-bar">${parts.map(p => p.n ? `<div style="width:${(p.n / total) * 100}%;background:${p.color}" title="${p.label}: ${p.n}"></div>` : '').join('')}</div>` : '';
    };

    async function load() {
        const settled = await Promise.allSettled([
            lss.getJSON('/api/credits'),
            lss.getJSON('/api/vehicles'),
            lss.getJSON('/api/buildings'),
            lss.getVehicleTypes(),
            lss.actions.checkResults ? lss.actions.checkResults(null) : Promise.resolve(null),
        ]);
        const [credits, vehicles, buildings, types, check] = settled.map(s => s.status === 'fulfilled' ? s.value : null);
        if (!vehicles || !buildings) throw new Error(settled[1].reason?.message || settled[2].reason?.message || 'Daten fehlen');
        return { credits, vehicles, buildings, types: types ?? {}, check, missions: missionCounts() };
    }

    function renderBody(d) {
        const e = lss.escapeHtml;
        const fms = n => d.vehicles.filter(v => v.fms_real === n).length;
        const free = fms(1) + fms(2);
        const talk = d.vehicles.filter(v => v.fms_real === 5);
        const off = fms(6);
        const busy = d.vehicles.length - free - talk.length - off;
        const empty = d.vehicles.filter(v => {
            const t = d.types[v.vehicle_type];
            return (v.max_personnel_override ?? t?.maxPersonnel ?? 0) > 0 && v.assigned_personnel_count === 0;
        }).length;
        const staff = d.buildings.reduce((s, b) => s + (b.personal_count ?? 0), 0);
        const hiring = d.buildings.filter(b => b.hiring_automatic || (b.hiring_phase ?? 0) > 0).length;
        const short = d.buildings.filter(b => (b.personal_count ?? 0) < (b.personal_count_target ?? 0)).length;
        const buildingName = Object.fromEntries(d.buildings.map(b => [b.id, b.caption]));

        const tiles = [];
        if (d.credits) {
            tiles.push(tile({
                label: '💰 Credits', value: fmt(d.credits.credits_user_current),
                sub: `gesamt <b>${fmt(d.credits.credits_user_total)}</b> · ${fmt(d.credits.coins_user_current)} Coins`,
            }));
            tiles.push(tile({
                label: '🏅 Dienstgrad', value: e(d.credits.user_level_title ?? '–'), cls: 'db-small',
                sub: d.credits.user_toplist_position ? `Platz <b>${fmt(d.credits.user_toplist_position)}</b> in der Bestenliste` : '',
            }));
        }
        if (d.missions) {
            const own = d.missions.own ?? { total: 0, red: 0, yellow: 0, green: 0 };
            const others = Object.entries(d.missions).filter(([k]) => k !== 'own').reduce((s, [, v]) => s + v.total, 0);
            tiles.push(tile({
                label: '🚨 Offene Einsätze', value: fmt(own.total), cls: own.red ? 'db-red' : '',
                sub: `<b>${own.red}</b> unversorgt · <b>${own.yellow}</b> Anfahrt · <b>${own.green}</b> vor Ort${others ? ` · ${others} weitere` : ''}`,
                bar: stackBar([{ n: own.red, color: '#c9302c', label: 'unversorgt' }, { n: own.yellow, color: '#e6a23c', label: 'Anfahrt' }, { n: own.green, color: '#2ea043', label: 'vor Ort' }]),
            }));
        }
        tiles.push(tile({
            label: '🚑 Fahrzeuge frei', value: `${fmt(free)} <span class="db-sub">/ ${fmt(d.vehicles.length)}</span>`, action: 'vehicles',
            sub: `<b>${fmt(busy)}</b> im Einsatz · <b>${off}</b> außer Dienst`,
            bar: stackBar([{ n: free, color: '#2ea043', label: 'frei' }, { n: busy, color: '#c9302c', label: 'im Einsatz' }, { n: talk.length, color: '#e6a23c', label: 'Sprechwunsch' }, { n: off, color: '#6b7280', label: 'außer Dienst' }]),
        }));
        tiles.push(tile({ label: '📻 Sprechwünsche', value: fmt(talk.length), cls: talk.length ? 'db-yellow' : 'db-green', sub: 'Fahrzeuge in Status 5' }));
        tiles.push(tile({ label: '🪑 Ohne Personal', value: fmt(empty), cls: empty ? 'db-red' : 'db-green', sub: 'Fahrzeuge ohne Besatzung', action: empty ? 'assign' : '' }));
        tiles.push(tile({
            label: '👥 Personal', value: fmt(staff), action: short ? 'hire' : '',
            sub: `${short ? `<b class="db-yellow">${short}</b> Wachen unter Ziel · ` : ''}${hiring} mit Werbung`,
        }));
        if (d.check) {
            const err = d.check.filter(r => r.level === 'err').length;
            const warn = d.check.filter(r => r.level === 'warn').length;
            tiles.push(tile({
                label: '🩺 Wachen-Check', value: err ? `${err} Fehler` : warn ? `${warn} Warn.` : 'Alles ok',
                cls: err ? 'db-red' : warn ? 'db-yellow' : 'db-green', action: 'check',
                sub: `${err} Fehler · ${warn} Warnungen · ${d.check.length - err - warn} ok`,
            }));
        }

        const talkList = talk.length
            ? talk.map(v => `<a class="lightbox-open" href="/vehicles/${v.id}">${e(v.caption)}<small>${e(buildingName[v.building_id] ?? '')}</small></a>`).join('')
            : '<div class="db-empty">✔ Keine offenen Sprechwünsche.</div>';

        const tools = [
            ['check', '🩺 Wachen-Check'], ['vehicles', '🚑 Fahrzeug-Übersicht'], ['occupancy', '🏥 Auslastung'],
            ['assign', '👥 Personal zuweisen'], ['hire', '📣 Personalwerbung'], ['rename', '✎ Umbenennen'],
        ].filter(([a]) => actionFor(a));

        return `
            <div class="db-grid">${tiles.join('')}</div>
            <div class="db-section">📻 Sprechwünsche</div>
            <div class="db-list">${talkList}</div>
            ${tools.length ? `<div class="db-section">Werkzeuge</div>
            <div class="db-tools">${tools.map(([a, l]) => `<button class="lssr-btn lssr-btn-ghost" data-action="${a}">${l}</button>`).join('')}</div>` : ''}
            <div class="db-foot"><span>Stand: ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <button class="lssr-btn lssr-btn-ghost db-refresh">↻ Aktualisieren</button></div>`;
    }

    // Werkzeug-Aufrufe für Kacheln und Knöpfe; null, wenn das Werkzeug nicht geladen ist
    function actionFor(name) {
        const a = lss.actions;
        return {
            check: a.check && (() => a.check(null)),
            vehicles: a.vehicleOverview && (() => a.vehicleOverview(null)),
            occupancy: a.occupancy && (() => a.occupancy()),
            assign: a.assign && (() => a.assign(null)),
            hire: a.hire && (() => a.hire(null)),
            rename: a.rename && (() => a.rename(null)),
        }[name] || null;
    }

    async function start() {
        injectStyle();
        const panel = lss.openPanel({ title: '📊 Dashboard', count: '…', body: '<div class="db-body"><div class="db-empty">Lade Daten …</div></div>' });
        const body = panel.root.querySelector('.db-body');
        const count = panel.root.closest('.lssr-dialog').querySelector('.lssr-count');

        const refresh = async () => {
            try {
                const d = await load();
                body.innerHTML = renderBody(d);
                count.textContent = `${fmt(d.buildings.length)} Gebäude · ${fmt(d.vehicles.length)} Fahrzeuge`;
            } catch (e) {
                body.innerHTML = `<div class="db-empty">Fehler beim Laden: ${lss.escapeHtml(e.message)}</div>`;
            }
        };

        body.addEventListener('click', e => {
            if (e.target.closest('.db-refresh')) return refresh();
            if (e.target.closest('.db-list a')) return panel.close();
            const el = e.target.closest('[data-action]');
            const run = el && actionFor(el.dataset.action);
            if (run) run();
        });
        await refresh();
    }

    lss.actions.dashboard = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '📊 Dashboard', scope: 'all', order: 5, run: start });
})();

// ===== kauf-berater.js =====
// LSS Kauf-Berater: "Was soll ich als Nächstes kaufen?"
// Merkt sich, welche Einsätze bei dir vorkommen (geöffnete Einsätze und die Einsatzliste der Hauptseite)
// und wofür "Fehlendes auswählen" kein freies Fahrzeug gefunden hat. Daraus wird berechnet,
// welche Fahrzeuge oft gebraucht werden, aber bei dir knapp sind.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js und einsatz-helfer.js.

(function () {
    'use strict';

    const MISSIONS_KEY = 'kaufBerater.missions';
    const SHORTAGES_KEY = 'kaufBerater.shortages';
    const KEEP_DAYS = 14;
    const MAX_ENTRIES = 5000;
    // Wie oft die Einsatzliste der Hauptseite nach neuen Einsätzen durchsucht wird
    const SCAN_SECONDS = 60;

    // Wo man ein Fahrzeug kaufen kann: Gebäudetyp-Nummern des Spiels → kurzer Name.
    // Kleinwachen zählen wie die normale Wache, Komplexe werden nicht extra genannt.
    const BUILDING_NAMES = {
        0: 'Feuerwache', 18: 'Feuerwache', 2: 'Rettungswache', 20: 'Rettungswache', 5: 'RTH-Station',
        6: 'Polizeiwache', 19: 'Polizeiwache', 9: 'THW', 11: 'Bereitschaftspolizei', 12: 'SEG',
        13: 'Polizeihubschrauber-Station', 15: 'Wasserrettung', 17: 'Polizei-Sondereinheiten',
        21: 'Rettungshundestaffel', 24: 'Reiterstaffel', 25: 'Bergrettung', 26: 'Seenotrettung',
        28: 'Seenot-Hubschrauberstation', 29: 'Autobahnpolizei',
    };

    // Alle Wachenarten, an denen irgendein passendes Fahrzeug gekauft werden kann
    function whereToBuy(typeIds, types) {
        const names = new Set();
        for (const t of typeIds) {
            for (const b of types[t]?.possibleBuildings ?? []) if (BUILDING_NAMES[b]) names.add(BUILDING_NAMES[b]);
        }
        return [...names];
    }

    const now = () => Date.now();
    const cutoff = () => now() - KEEP_DAYS * 864e5;
    const load = key => { try { return GM_getValue(key, []); } catch (e) { return []; } };
    const save = (key, list) => {
        try { GM_setValue(key, list.filter(x => x.t >= cutoff()).slice(-MAX_ENTRIES)); } catch (e) { /* kein Speicher */ }
    };

    // Ein Einsatz zählt nur einmal, egal wie oft er geöffnet oder in der Liste gesehen wird
    function recordMission(id, type) {
        const list = load(MISSIONS_KEY);
        if (list.some(x => x.id === String(id))) return;
        list.push({ id: String(id), type: String(type), t: now() });
        save(MISSIONS_KEY, list);
    }

    // Engpass: für diese Anforderung war bei diesem Einsatz kein freies Fahrzeug da (pro Einsatz einmal)
    function recordShortage(missionId, key) {
        const list = load(SHORTAGES_KEY);
        if (list.some(x => x.id === String(missionId) && x.key === key)) return;
        list.push({ id: String(missionId), key, t: now() });
        save(SHORTAGES_KEY, list);
    }

    // Einsatzliste der Hauptseite: Einträge tragen ihre Einsatzart im Attribut mission_type_id
    function scanMissionList() {
        document.querySelectorAll('.missionSideBarEntry[mission_type_id]').forEach(el => {
            const id = el.getAttribute('mission_id') ?? el.id?.match(/\d+/)?.[0];
            const type = el.getAttribute('mission_type_id');
            if (id && type && type !== 'null') recordMission(id, type);
        });
    }

    const STYLE = `
        .kb-body { overflow:auto; flex:1; }
        .kb-intro { padding:12px 18px; color:#aab0b8; font-size:13px; border-bottom:1px solid #3a3f47; background:#1c1f23; }
        .kb-intro b { color:#fff; }
        .kb-table { width:100%; border-collapse:collapse; font-size:13px; }
        .kb-table th { position:sticky; top:0; background:#22252a; color:#8b929c; font-weight:600; font-size:11px; text-transform:uppercase; text-align:right; padding:8px 10px; border-bottom:1px solid #3a3f47; white-space:nowrap; }
        .kb-table th:first-child, .kb-table td:first-child { text-align:left; padding-left:18px; }
        .kb-table th:last-child, .kb-table td:last-child { padding-right:18px; }
        .kb-table td { padding:7px 10px; border-bottom:1px solid #2e3238; text-align:right; font-variant-numeric:tabular-nums; }
        .kb-table tr:hover td { background:#2a2e34; }
        .kb-name { color:#fff; font-weight:600; }
        .kb-where { display:block; color:#8b929c; font-size:11px; font-weight:400; margin-top:2px; }
        .kb-zero { color:#4b5058; }
        .kb-badge { display:inline-block; border-radius:999px; padding:2px 10px; font-size:11px; font-weight:700; white-space:nowrap; }
        .kb-buy { background:#c9302c; color:#fff; }
        .kb-more { background:rgba(230,162,60,.2); color:#f0b75e; }
        .kb-ok { background:rgba(46,160,67,.15); color:#5cd178; }
        .kb-short { color:#ff8a84; font-weight:700; }
        .kb-empty { padding:30px 18px; text-align:center; color:#8b929c; }
    `;

    function injectStyle() {
        if (document.getElementById('kb-style')) return;
        const style = document.createElement('style');
        style.id = 'kb-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    // Bedarf je Anforderung: in wie vielen Einsätzen gebraucht (Wahrscheinlichkeit anteilig) und wie viele auf einmal
    function analyse(missions, shortages, missionTypes, vehicles, REQ, types) {
        const stats = {};
        const get = key => stats[key] ??= { key, missions: 0, peak: 0, shortages: 0 };
        let known = 0;
        for (const rec of missions) {
            const m = missionTypes[rec.type] ?? missionTypes[rec.type.split(/[-/]/)[0]];
            if (!m) continue;
            known++;
            const keys = new Set([...Object.keys(m.req), ...Object.keys(m.chances)]);
            for (const key of keys) {
                if (!REQ[key]?.[1]?.length) continue;
                const needed = typeof m.req[key] === 'number' ? m.req[key] : 1;
                const chance = m.chances[key] != null ? m.chances[key] / 100 : 1;
                const s = get(key);
                s.missions += chance;
                s.peak = Math.max(s.peak, needed);
            }
        }
        for (const sh of shortages) if (REQ[sh.key]?.[1]?.length) get(sh.key).shortages++;

        const countByType = {};
        for (const v of vehicles) countByType[v.vehicle_type] = (countByType[v.vehicle_type] || 0) + 1;

        const rows = Object.values(stats).map(s => {
            const [label, typeIds] = REQ[s.key];
            const have = typeIds.reduce((n, t) => n + (countByType[t] || 0), 0);
            // Je mehr Einsätze pro vorhandenem Fahrzeug und je mehr Engpässe, desto dringender
            // "Zu wenige auf einmal" zählt erst, wenn es mehr als ein Einzelfall war
            const tooFew = have < s.peak && s.missions >= 2;
            const score = s.shortages * 5 + s.missions / Math.max(have, 0.5) + (tooFew ? 10 : 0);
            const verdict = have === 0 || tooFew ? 'buy' : s.shortages > 0 ? 'more' : 'ok';
            return { ...s, label, have, score, verdict, where: whereToBuy(typeIds, types) };
        });
        rows.sort((a, b) => ({ buy: 0, more: 1, ok: 2 }[a.verdict] - { buy: 0, more: 1, ok: 2 }[b.verdict]) || b.score - a.score);
        return { rows, known };
    }

    async function start() {
        const REQ = lss.actions.missionRequirements;
        if (!REQ || !lss.actions.missionTypes) throw new Error('Einsatz-Helfer ist nicht geladen');
        const [missionTypes, vehicles, types] = await Promise.all([
            lss.actions.missionTypes(), lss.getJSON('/api/vehicles'), lss.getVehicleTypes().catch(() => ({})),
        ]);
        scanMissionList();
        const missions = load(MISSIONS_KEY).filter(x => x.t >= cutoff());
        const shortages = load(SHORTAGES_KEY).filter(x => x.t >= cutoff());
        const { rows, known } = analyse(missions, shortages, missionTypes, vehicles, REQ, types);
        const since = missions.length ? new Date(Math.min(...missions.map(x => x.t))).toLocaleDateString('de-DE') : null;
        const e = lss.escapeHtml;
        const fmt = n => (Math.round(n * 10) / 10).toLocaleString('de-DE');
        const badge = { buy: '<span class="kb-badge kb-buy">Kaufen!</span>', more: '<span class="kb-badge kb-more">Mehr davon</span>', ok: '<span class="kb-badge kb-ok">reicht</span>' };

        injectStyle();
        lss.openPanel({
            title: '🛒 Was soll ich als Nächstes kaufen?',
            count: `${known} Einsätze ausgewertet`,
            body: `
                <div class="kb-intro">${known
                    ? `Grundlage: <b>${known}</b> Einsätze seit <b>${since}</b> und <b>${shortages.length}</b> Engpässe aus „Fehlendes auswählen“. Je länger du spielst, desto genauer wird die Empfehlung.`
                    : 'Noch keine Daten. Der Kauf-Berater merkt sich ab jetzt die Einsätze in deiner Einsatzliste und jeden Einsatz, den du öffnest. Schau in ein paar Stunden wieder rein.'}</div>
                <div class="kb-body">${rows.length ? `
                    <table class="kb-table">
                        <thead><tr><th>Fahrzeug</th><th title="In wie vielen Einsätzen gebraucht (Wahrscheinlichkeiten anteilig)">Einsätze</th><th title="Höchstens auf einmal gebraucht">Max.</th><th>Du hast</th><th title="Kein freies Fahrzeug bei „Fehlendes auswählen“">Engpässe</th><th></th></tr></thead>
                        <tbody>${rows.map(r => `
                            <tr>
                                <td class="kb-name">${e(r.label)}${r.where.length ? `<span class="kb-where">🏠 ${e(r.where.join(', '))}</span>` : ''}</td>
                                <td>${fmt(r.missions)}</td>
                                <td>${r.peak}</td>
                                <td class="${r.have ? '' : 'kb-short'}">${r.have}</td>
                                <td class="${r.shortages ? 'kb-short' : 'kb-zero'}">${r.shortages}</td>
                                <td>${badge[r.verdict]}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>` : '<div class="kb-empty">Noch nichts auszuwerten.</div>'}
                </div>`,
        });
    }

    lss.actions.recordMission = recordMission;
    lss.actions.recordShortage = recordShortage;
    lss.actions.buyAdvice = start;

    if (lss.isWorkerFrame) return;

    // Auf der Hauptseite regelmäßig die Einsatzliste mitschreiben
    if (window === window.top && document.querySelector('#missions, #mission_list')) {
        const scan = lss.safe('Kauf-Berater (Einsatzliste)', scanMissionList);
        scan();
        setInterval(scan, SCAN_SECONDS * 1000);
    }

    lss.addTool({ label: '🛒 Was soll ich kaufen?', scope: 'all', order: 48, run: start });
})();

// ===== sprechwunsch.js =====
// LSS Sprechwunsch-Helfer
// Patienten (Fahrzeugfenster) und Gefangene (Alarmfenster): markiert das beste Ziel (passende
// Fachabteilung, freie Plätze, kurze Entfernung, wenig Abgabe) und springt nach dem Anfahren auf Wunsch
// direkt zum nächsten Fahrzeug mit Sprechwunsch. Das Ziel wählt immer der Spieler selbst.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    // Fahrzeug, zu dem die Automatik gerade gesprungen ist
    const JUMP_KEY = 'sprechwunsch.jump';
    // Gerade bearbeitete Fahrzeuge; die API meldet sie noch ein paar Sekunden als Status 5
    const DONE_KEY = 'sprechwunsch.done';
    const DONE_SECONDS = 120;
    // Kleiner Verlauf der letzten Schritte, damit man sieht, wo die Automatik hängen bleibt
    const TRAIL_KEY = 'sprechwunsch.trail';
    // 25 % Abgabe an den Verband zählen wie 5 km Umweg
    const KM_PER_PERCENT_TAX = 0.2;
    // Links zum Anfahren: Patienten ins Krankenhaus, Gefangene in eine Zelle
    const TARGET_LINK = 'a[href*="/patient/"], a[href*="/gefangener/"], a[href*="/prisoner/"]';

    const STYLE = `
        .sw-box { margin:10px 0; background:#22252a; color:#e6e6e6; border:1px solid #3a3f47; border-radius:8px; overflow:hidden; font-size:13px; }
        .sw-head { display:flex; align-items:center; gap:10px; padding:8px 12px; background:linear-gradient(135deg,var(--lssr-accent,#c9302c),var(--lssr-accent-dark,#8f1f1c)); color:#fff; }
        .sw-head b { flex:1; font-size:14px; }
        .sw-best { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 12px; }
        .sw-best .sw-name { color:#fff; font-weight:700; font-size:15px; }
        .sw-meta { color:#aab0b8; }
        .sw-meta b { color:#fff; }
        .sw-go { margin-left:auto; background:#2ea043; color:#fff !important; border:0; border-radius:6px; padding:7px 16px; font-weight:700; text-decoration:none !important; cursor:pointer; }
        .sw-go:hover { filter:brightness(1.15); }
        .sw-foot { display:flex; align-items:center; gap:10px; padding:7px 12px; border-top:1px solid #3a3f47; background:#1c1f23; color:#aab0b8; flex-wrap:wrap; }
        .sw-foot label { margin:0; font-weight:normal; cursor:pointer; display:flex; align-items:center; gap:6px; }
        .sw-foot input { margin:0; }
        .sw-none { padding:10px 12px; color:#ff8a84; }
        tr.sw-row-best td { box-shadow:inset 0 2px 0 #2ea043, inset 0 -2px 0 #2ea043; background:rgba(46,160,67,.12) !important; }
        tr.sw-row-best td:first-child { box-shadow:inset 2px 2px 0 #2ea043, inset 0 -2px 0 #2ea043; }
        .sw-done { padding:12px; color:#5cd178; font-weight:700; }
    `;

    function injectStyle() {
        if (document.getElementById('sw-style')) return;
        const style = document.createElement('style');
        style.id = 'sw-style';
        style.textContent = STYLE;
        document.head.append(style);
    }


    // Spaltennummern anhand der Überschriften finden
    function columns(table) {
        const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim().toLowerCase());
        const find = re => heads.findIndex(h => re.test(h));
        return { dist: find(/entfernung/), free: find(/frei/), dept: find(/fachabteilung/), tax: find(/abgabe/) };
    }

    const cellText = (row, i) => (i >= 0 ? row.cells[i]?.textContent.replace(/\s+/g, ' ').trim() ?? '' : '');

    // Alle möglichen Ziele aus den Tabellen des Fensters
    function targets() {
        const list = [];
        document.querySelectorAll('table').forEach(table => {
            if (!table.querySelector(TARGET_LINK)) return;
            const col = columns(table);
            const own = /own/.test(table.id) || col.tax < 0;
            table.querySelectorAll('tbody tr').forEach(row => {
                const link = row.querySelector(TARGET_LINK);
                if (!link) return;
                const free = cellText(row, col.free).match(/(\d+)\s*\/\s*(\d+)/);
                const deptCell = col.dept >= 0 ? row.cells[col.dept] : null;
                const dept = deptCell ? !!deptCell.querySelector('.label-success') || /\bja\b/i.test(deptCell.textContent) : true;
                list.push({
                    row, link, own, dept,
                    name: (row.cells[0]?.childNodes[0]?.textContent ?? row.cells[0]?.textContent ?? '').trim(),
                    dist: parseFloat(cellText(row, col.dist).replace(',', '.')) || Infinity,
                    free: free ? Number(free[1]) : null,
                    max: free ? Number(free[2]) : null,
                    tax: parseFloat(cellText(row, col.tax)) || 0,
                });
            });
        });
        return list;
    }

    // Bestes Ziel: passende Fachabteilung und freie Plätze, dann Entfernung plus Abgabe-Umweg
    function best(list) {
        const ok = list.filter(t => t.dept && (t.free == null || t.free > 0));
        const cost = t => t.dist + t.tax * KM_PER_PERCENT_TAX;
        return ok.sort((a, b) => cost(a) - cost(b) || (b.own - a.own))[0] ?? null;
    }

    const loadDone = () => {
        try {
            const list = JSON.parse(sessionStorage.getItem(DONE_KEY) || '[]');
            return list.filter(d => Date.now() - d.t < DONE_SECONDS * 1000);
        } catch (e) { return []; }
    };
    const markDone = id => {
        try { sessionStorage.setItem(DONE_KEY, JSON.stringify([...loadDone(), { id: String(id), t: Date.now() }])); } catch (e) { /* kein Speicher */ }
    };

    // Nächstes Fahrzeug mit Sprechwunsch; frisch geladen, weil sich Status schnell ändern
    async function nextTalker(currentId) {
        const r = await fetch('/api/vehicles', { credentials: 'include' });
        if (!r.ok) throw new Error(`/api/vehicles: HTTP ${r.status}`);
        const done = new Set([String(currentId), ...loadDone().map(d => d.id)]);
        return (await r.json()).filter(v => v.fms_real === 5 && !done.has(String(v.id))).sort((a, b) => a.id - b.id)[0] ?? null;
    }

    // Immer erst ins Fahrzeugfenster: dort stehen Krankenhäuser und meist auch die Zellen. Muss die
    // Entscheidung an der Einsatzstelle fallen, springt initVehicle von dort ins Alarmfenster weiter.
    function goTo(vehicle) {
        try { sessionStorage.setItem(JUMP_KEY, JSON.stringify({ id: String(vehicle.id), t: Date.now() })); } catch (e) { /* kein Speicher */ }
        location.href = `/vehicles/${vehicle.id}`;
    }
    const jumpedTo = id => {
        try {
            const j = JSON.parse(sessionStorage.getItem(JUMP_KEY) || 'null');
            return !!j && j.id === String(id) && Date.now() - j.t < 60 * 1000;
        } catch (e) { return false; }
    };

    const trail = () => { try { return JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '[]'); } catch (e) { return []; } };
    const addTrail = text => {
        const time = new Date().toLocaleTimeString('de-DE');
        try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify([...trail(), `${time} ${text}`].slice(-8))); } catch (e) { /* kein Speicher */ }
    };

    // Fehlermeldung des Spiels aus der Antwort lesen (z.B. "Keine freien Zellen")
    function gameError(html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return doc.querySelector('.alert-danger')?.textContent.replace(/\s+/g, ' ').trim() || '';
        } catch (e) { return ''; }
    }

    const setStatus = (box, text) => {
        const el = box.querySelector('.sw-status');
        if (el) el.textContent = text;
    };

    // Ziel anfahren und danach zum nächsten Sprechwunsch springen. Ohne weiteren Sprechwunsch wird
    // dieses Fenster neu geladen, damit keine veraltete Ziel-Liste mehr zum Anklicken dasteht.
    async function approachAndNext(href, vehicleId, box) {
        setStatus(box, 'Fahre an …');
        addTrail(`Fahrzeug ${vehicleId}: fahre an`);
        const r = await fetch(href, { credentials: 'include' });
        if (!r.ok) throw new Error(`Anfahren: HTTP ${r.status}`);
        const error = gameError(await r.text().catch(() => ''));
        if (error) {
            addTrail(`Spiel meldet: ${error}`);
            throw new Error(`Das Spiel meldet: ${error}`);
        }
        markDone(vehicleId);
        // Im Alarmfenster können mehrere Fahrzeuge Gefangene haben: erst die hier erledigen
        const done = new Set(loadDone().map(d => d.id));
        const moreHere = [...document.querySelectorAll('.prison-select[data-vehicle-id]')].some(s => !done.has(s.dataset.vehicleId));
        if (moreHere) {
            addTrail('weitere Gefangene in diesem Einsatz');
            location.reload();
            return;
        }
        setStatus(box, 'Suche nächsten Sprechwunsch …');
        const next = await nextTalker(vehicleId);
        if (next) {
            setStatus(box, `Weiter zu ${next.caption ?? 'nächstem Fahrzeug'} …`);
            addTrail(`weiter zu ${next.caption ?? next.id}`);
            goTo(next);
        } else {
            addTrail('kein weiterer Sprechwunsch');
            box.innerHTML = '<div class="sw-done">✔ Alle Sprechwünsche erledigt!</div>';
            setTimeout(() => location.reload(), 1500);
        }
    }

    function helperBox({ count, choice, kind, noneText }) {
        const e = lss.escapeHtml;
        const box = document.createElement('div');
        box.className = 'sw-box';
        box.innerHTML = `
            <div class="sw-head"><b>📻 Sprechwunsch-Helfer</b><span>${count} Ziele</span></div>
            ${choice ? `
            <div class="sw-best">
                <span>⭐</span>
                <div>
                    <div class="sw-name">${e(choice.name)}${choice.own ? '' : ' <small class="sw-meta">(Verband)</small>'}</div>
                    <div class="sw-meta"><b>${Number.isFinite(choice.dist) ? choice.dist.toLocaleString('de-DE') : '?'} km</b>
                        ${choice.free != null ? ` · <b>${choice.free}${choice.max ? ` / ${choice.max}` : ''}</b> frei` : ''}
                        ${choice.tax ? ` · ${choice.tax} % Abgabe` : ''}
                        ${kind === 'Krankenhaus' ? ' · Fachabteilung ✓' : ''}</div>
                </div>
                <a class="sw-go" href="${e(choice.link.getAttribute('href'))}">${kind === 'Krankenhaus' ? '🚑' : '🚔'} Anfahren</a>
            </div>` : `<div class="sw-none">${noneText}</div>`}
            <div class="sw-foot">
                <span>⏭ Nach dem Anfahren geht es automatisch zum nächsten Sprechwunsch</span>
                <span class="sw-status" style="margin-left:auto"></span>
            </div>`;
        return box;
    }

    // Klicks auf Anfahren-Links abfangen, wenn "automatisch weiter" an ist.
    // vehicleOf(link) liefert das Fahrzeug zum Link; pro Fenster wird nur einmal angefahren.
    function interceptClicks(selector, vehicleOf, boxOf) {
        let sent = false;
        document.addEventListener('click', ev => {
            const link = ev.target.closest(selector);
            if (!link) return;
            ev.preventDefault();
            ev.stopPropagation();
            if (sent) return;
            sent = true;
            const box = boxOf(link);
            approachAndNext(link.getAttribute('href'), vehicleOf(link), box).catch(err => {
                sent = false;
                lss.report('Sprechwunsch-Helfer', err);
                setStatus(box, 'Fehler, bitte von Hand anfahren');
            });
        }, true);
    }

    // Fahrzeugfenster: Patient ins Krankenhaus
    function initVehicle() {
        const m = location.pathname.match(/^\/vehicles\/(\d+)\/?$/);
        const heading = document.querySelector('#h2_sprechwunsch');
        if (!m || !heading) return;
        const vehicleId = m[1];
        // Krankenhäuser stehen in Tabellen, Zellen als Knöpfe ("Zelle wählen")
        let list = targets();
        if (!list.length) list = prisonButtons(document);
        if (!list.length) {
            // Automatisch hergesprungen, aber hier gibt es nichts zu wählen: weiter zur Einsatzstelle
            const area = heading.closest('.alert') ?? heading.parentElement;
            const mission = area?.querySelector('a[href*="/missions/"]');
            if (mission && jumpedTo(vehicleId)) {
                try { sessionStorage.removeItem(JUMP_KEY); } catch (e) { /* kein Speicher */ }
                location.href = mission.getAttribute('href');
            }
            return;
        }
        const choice = best(list);
        const kind = list[0].link.href.includes('/patient/') ? 'Krankenhaus' : 'Zelle';

        injectStyle();
        const box = helperBox({
            count: list.length, choice, kind,
            noneText: `Kein ${kind === 'Krankenhaus' ? 'Krankenhaus mit passender Fachabteilung und freien Betten' : 'Ziel mit freien Zellen'} gefunden.`,
        });
        (heading.closest('.alert') ?? heading).after(box);
        choice?.row?.classList.add('sw-row-best');
        if (choice && !choice.row) choice.link.style.outline = '3px solid #2ea043';
        interceptClicks(`${TARGET_LINK}, a[data-prison-id], .sw-go`, () => vehicleId, () => box);
    }

    // "Polizeistation Heringen(Freie Zellen: 2, Entfernung: 0,71 km, Abgabe an Besitzer: 0%)"
    const PRISON_TEXT = /^(.*?)\s*\(\s*Freie Zellen:\s*(\d+)\s*,\s*Entfernung:\s*([\d.,]+)\s*km(?:\s*,\s*Abgabe an Besitzer:\s*(\d+)\s*%)?\s*\)/i;

    // Zellen-Knöpfe eines Fahrzeugs; alles nach der Überschrift "Verbandszellen" gehört dem Verband
    function prisonTargets(select) {
        const list = [];
        let own = true;
        for (const el of select.children) {
            if (/^H\d$/.test(el.tagName) && /verband/i.test(el.textContent)) own = false;
            if (!el.matches('a[data-prison-id]')) continue;
            const m = el.textContent.replace(/\s+/g, ' ').trim().match(PRISON_TEXT);
            if (!m) continue;
            list.push({
                link: el, row: null, own, dept: true, name: m[1].trim(),
                free: Number(m[2]), max: null,
                dist: parseFloat(m[3].replace(',', '.')),
                tax: Number(m[4] ?? 0),
            });
        }
        return list;
    }

    // Zellen-Knöpfe im Fahrzeugfenster; alles hinter der Überschrift "Verbandszellen" gehört dem Verband
    function prisonButtons(root) {
        const verband = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,b,strong,p,div,span,label')]
            .find(el => !el.children.length && /^\s*Verbandszellen\s*:?\s*$/i.test(el.textContent));
        const list = [];
        const seen = new Set();
        root.querySelectorAll('a[data-prison-id], a[href*="/gefangener/"], a[href*="/prisoner/"]').forEach(el => {
            if (seen.has(el) || el.closest('.sw-box')) return;
            seen.add(el);
            const href = el.getAttribute('href') || '';
            if (!href || href === '#') return;
            const m = el.textContent.replace(/\s+/g, ' ').trim().match(PRISON_TEXT);
            if (!m) return;
            const own = !verband || !(verband.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
            list.push({
                link: el, row: null, own, dept: true, name: m[1].trim(),
                free: Number(m[2]), max: null,
                dist: parseFloat(m[3].replace(',', '.')),
                tax: Number(m[4] ?? 0),
            });
        });
        return list;
    }

    // Alarmfenster: Gefangene in eine Zelle (ein Block pro Polizeifahrzeug mit Gefangenen)
    function initMission() {
        if (!/^\/missions\/\d+/.test(location.pathname)) return;
        const selects = [...document.querySelectorAll('.prison-select[data-vehicle-id]')];
        if (!selects.length) return;
        injectStyle();
        for (const select of selects) {
            const list = prisonTargets(select);
            if (!list.length) continue;
            const choice = best(list);
            const box = helperBox({ count: list.length, choice, kind: 'Zelle', noneText: 'Keine Zelle mit freien Plätzen gefunden.' });
            box.dataset.vehicleId = select.dataset.vehicleId;
            select.before(box);
            if (choice) choice.link.style.outline = '3px solid #2ea043';
        }
        interceptClicks(
            '.prison-select a[data-prison-id], .sw-box[data-vehicle-id] .sw-go',
            link => link.closest('[data-vehicle-id]').dataset.vehicleId,
            link => {
                const id = link.closest('[data-vehicle-id]').dataset.vehicleId;
                return document.querySelector(`.sw-box[data-vehicle-id="${id}"]`) ?? document.createElement('div');
            },
        );
    }

    // Nach einem automatischen Sprung: Wenn hier nichts zu wählen ist, das sagen und Verlauf zeigen,
    // statt kommentarlos stehen zu bleiben. Hat das Fahrzeug gar keinen Sprechwunsch mehr, geht es weiter.
    async function checkLanding() {
        let jump = null;
        try { jump = JSON.parse(sessionStorage.getItem(JUMP_KEY) || 'null'); } catch (e) { /* egal */ }
        if (!jump || Date.now() - jump.t > 60 * 1000 || document.querySelector('.sw-box')) return;
        const m = location.pathname.match(/^\/vehicles\/(\d+)\/?$/);
        if (m && m[1] === jump.id && !document.querySelector('#h2_sprechwunsch')) {
            addTrail(`Fahrzeug ${jump.id} hat keinen Sprechwunsch mehr`);
            markDone(jump.id);
            const next = await nextTalker(jump.id);
            if (next) { addTrail(`weiter zu ${next.caption ?? next.id}`); goTo(next); return; }
        }
        try { sessionStorage.removeItem(JUMP_KEY); } catch (e) { /* kein Speicher */ }
        injectStyle();
        const note = document.createElement('div');
        note.className = 'sw-box';
        note.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100000;max-width:380px;margin:0';
        note.innerHTML = `<div class="sw-head"><b>📻 Sprechwunsch-Helfer</b><span class="sw-x" style="cursor:pointer">✕</span></div>
            <div class="sw-none">Hier gibt es nichts zum Anfahren.</div>
            <div class="sw-foot" style="display:block;font-size:12px">${trail().map(t => lss.escapeHtml(t)).join('<br>')}</div>`;
        note.querySelector('.sw-x').onclick = () => note.remove();
        document.body.append(note);
    }

    if (lss.isWorkerFrame) return;
    lss.safe('Sprechwunsch-Helfer', initVehicle)();
    lss.safe('Sprechwunsch-Helfer (Gefangene)', initMission)();
    setTimeout(lss.safe('Sprechwunsch-Helfer (Sprung)', checkLanding), 800);
})();

// ===== fahrzeugnamen-karte.js =====
// LSS Fahrzeugnamen auf der Karte ausblenden
// Das Spiel blendet die Namen manchmal wieder ein, obwohl sie in den Einstellungen aus sind
// (die Spiel-Variable vehicle_label steht dann auf true). Dieses Skript hält sie dauerhaft aus.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const KEY = 'lss.hideVehicleLabels';
    const isOn = () => { try { return GM_getValue(KEY, true); } catch (e) { return true; } };

    // Läuft direkt in der Spielseite, weil Tampermonkey die Spiel-Variablen sonst nicht ändern kann.
    // Schaut alle 2 Sekunden nach und nimmt nur die festen Namensschilder der Fahrzeuge weg.
    const PAGE_CODE = `(function () {
        function vehicleLayers() {
            var list = [];
            if (Array.isArray(window.vehicle_markers)) list = window.vehicle_markers.slice();
            if (window.map && typeof window.map.eachLayer === 'function') {
                window.map.eachLayer(function (l) { if (l && l.vehicle_id !== undefined && list.indexOf(l) < 0) list.push(l); });
            }
            return list;
        }
        function enforce() {
            if (document.documentElement.getAttribute('data-lss-hide-labels') !== '1') return;
            if (window.vehicle_label) window.vehicle_label = false;
            if (window.vehicle_label_backup) window.vehicle_label_backup = false;
            vehicleLayers().forEach(function (m) {
                var t = m && typeof m.getTooltip === 'function' && m.getTooltip();
                if (t && t.options && t.options.permanent) m.unbindTooltip();
            });
        }
        enforce();
        setInterval(enforce, 2000);
    })();`;

    function apply(on) {
        document.documentElement.setAttribute('data-lss-hide-labels', on ? '1' : '0');
    }

    function note(text) {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100000;background:#22252a;color:#e6e6e6;border:1px solid #3a3f47;border-left:4px solid var(--lssr-accent,#c9302c);border-radius:8px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.5);font:13px "Helvetica Neue",Arial,sans-serif;max-width:340px';
        el.textContent = text;
        document.body.append(el);
        setTimeout(() => el.remove(), 4000);
    }

    function toggle() {
        const on = !isOn();
        try { GM_setValue(KEY, on); } catch (e) { /* kein Speicher */ }
        apply(on);
        note(on
            ? '🏷️ Fahrzeugnamen auf der Karte bleiben jetzt ausgeblendet.'
            : '🏷️ Fahrzeugnamen werden nicht mehr erzwungen ausgeblendet. Nach dem Neuladen gilt wieder die Spiel-Einstellung.');
    }

    lss.actions.toggleVehicleLabels = toggle;

    if (lss.isWorkerFrame || window !== window.top) return;

    lss.addTool({ label: '🏷️ Fahrzeugnamen auf Karte ein/aus', scope: 'all', order: 85, run: toggle });

    // Nur auf der Hauptseite mit Karte
    if (!document.getElementById('map')) return;
    apply(isOn());
    const script = document.createElement('script');
    script.textContent = PAGE_CODE;
    (document.head || document.documentElement).append(script);
    script.remove();
})();

// ===== schnellstart.js =====
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

// ===== changelog.js =====
// LSS Changelog: "Was ist neu?"
// Neue Einträge oben ergänzen. Nach einem Update erscheint einmal ein Hinweis mit Link zum Changelog.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const SEEN_KEY = 'lss.changelogSeen';

    // Neueste zuerst; version muss bei jedem neuen Eintrag größer werden
    const CHANGELOG = [
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

/* exported LSS_BUILD */
var LSS_BUILD = {"built":"2026-11-08T19:58:20.279Z","files":[["gemeinsam.js",4],["themes.js",482],["fahrzeuge-umbenennen.js",561],["personal-zuweisen.js",661],["personal-verschieben.js",1082],["wachen-check.js",1358],["fahrzeug-uebersicht.js",1586],["personal-werben.js",1741],["auslastung.js",1848],["einsatz-helfer.js",2000],["dashboard.js",2702],["kauf-berater.js",2925],["sprechwunsch.js",3117],["fahrzeugnamen-karte.js",3473],["schnellstart.js",3545],["changelog.js",3624]]};
