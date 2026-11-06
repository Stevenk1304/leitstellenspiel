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
