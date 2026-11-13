// LSS "Fahrzeuge zurück"-Erinnerung
// Schaut alle paar Minuten nach (nur auf der Hauptseite) und zeigt unten links einen kleinen Hinweis, wenn
//  - Fahrzeuge schon lange am Einsatz stehen (Status 4), oder
//  - eine Wache gerade kein einziges einsatzbereites Fahrzeug mehr hat.
// Es wird nichts zurückgerufen oder alarmiert, der Hinweis verlinkt nur auf Fahrzeug, Einsatz und Wache.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const SINCE_KEY = 'fahrzeugeZurueck.since';   // { Fahrzeug-ID: Zeitpunkt, seit dem es in Status 4 ist }
    const HIDDEN_KEY = 'fahrzeugeZurueck.hidden'; // Fingerabdruck der ausgeblendeten Hinweise
    const CHECK_MINUTES = 2;
    const LONG_MINUTES = 60;                      // ab so lange am Einsatz gilt ein Fahrzeug als "lange"
    const READY = [1, 2];                         // einsatzbereit: frei auf Funk, auf Wache

    const STYLE = `
        .fz-badge { position:fixed; left:12px; bottom:12px; z-index:9998; display:flex; align-items:center; gap:8px; background:#3a3220; color:#ffe7a8;
            border:1px solid #7a5a1f; border-radius:8px; padding:6px 10px; font-size:13px; font-weight:600; box-shadow:0 4px 14px rgba(0,0,0,.4); cursor:pointer; }
        .fz-badge:hover { background:#4a4028; }
        .fz-badge .fz-x { color:#c9b07a; font-weight:400; padding:0 2px; }
        .fz-list { overflow:auto; flex:1; padding:6px 0 12px; }
        .fz-section { color:#8b929c; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:12px 18px 6px; }
        .fz-row { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) 110px; align-items:center; gap:12px; padding:7px 18px; font-size:13px; border-bottom:1px solid #2e3238; }
        .fz-row:hover { background:#2a2e34; }
        .fz-row a { color:#fff !important; font-weight:600; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fz-row a:hover { text-decoration:underline; }
        .fz-muted { color:#8b929c; }
        .fz-time { text-align:right; color:#ffcf70; font-variant-numeric:tabular-nums; }
        .fz-empty { padding:30px; text-align:center; color:#8b929c; }
        .fz-foot { padding:8px 18px; color:#8b929c; font-size:11px; border-top:1px solid #3a3f47; }
    `;

    function injectStyle() {
        if (document.getElementById('fz-style')) return;
        const style = document.createElement('style');
        style.id = 'fz-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    const load = (key, fallback) => { try { return GM_getValue(key, fallback); } catch (e) { return fallback; } };
    const save = (key, value) => { try { GM_setValue(key, value); } catch (e) { /* kein Speicher */ } };
    const minutes = ms => Math.floor(ms / 60000);
    const duration = ms => {
        const m = minutes(ms);
        return m >= 60 ? `${Math.floor(m / 60)} Std. ${m % 60} Min.` : `${m} Min.`;
    };

    // Lädt Fahrzeuge und Wachen, merkt sich, seit wann Fahrzeuge in Status 4 sind, und liefert die Hinweise
    async function check() {
        const [vehicles, buildings] = await Promise.all([lss.getJSON('/api/vehicles'), lss.getJSON('/api/buildings')]);
        const now = Date.now();
        const old = load(SINCE_KEY, {});
        const since = {};
        for (const v of vehicles) if (v.fms_real === 4) since[v.id] = old[v.id] ?? now;
        save(SINCE_KEY, since);

        const names = Object.fromEntries(buildings.map(b => [b.id, b.caption]));
        const long = vehicles
            .filter(v => v.fms_real === 4 && now - since[v.id] >= LONG_MINUTES * 60000)
            .map(v => ({ v, ms: now - since[v.id] }))
            .sort((a, b) => b.ms - a.ms);

        const byBuilding = new Map();
        for (const v of vehicles) {
            if (!byBuilding.has(v.building_id)) byBuilding.set(v.building_id, []);
            byBuilding.get(v.building_id).push(v);
        }
        const empty = [...byBuilding.entries()]
            .filter(([, list]) => list.length > 0 && !list.some(v => READY.includes(v.fms_real)))
            .map(([id, list]) => ({ id, name: names[id] ?? `Wache ${id}`, count: list.length,
                out: list.filter(v => v.fms_real === 6).length }))
            .filter(b => b.out < b.count) // nur außer Dienst (Status 6) ist kein Einsatzgeschehen
            .sort((a, b) => a.name.localeCompare(b.name));

        return { long, empty, names, firstRun: Object.keys(old).length === 0 };
    }

    const fingerprint = r => [...r.long.map(x => `v${x.v.id}`), ...r.empty.map(b => `b${b.id}`)].sort().join(',');

    function showPanel(result) {
        injectStyle();
        const e = lss.escapeHtml;
        const { long, empty, names } = result;
        const panel = lss.openPanel({
            title: 'Fahrzeuge zurück?',
            count: `${long.length} lange am Einsatz · ${empty.length} Wachen leer`,
            body: `<div class="fz-list">
                <div class="fz-section">Länger als ${LONG_MINUTES} Min. am Einsatz (${long.length})</div>
                ${long.length ? long.map(({ v, ms }) => `
                    <div class="fz-row">
                        <a class="lightbox-open" href="/vehicles/${v.id}">${e(v.caption)}</a>
                        ${v.target_type === 'mission' && v.target_id
                            ? `<a class="lightbox-open" href="/missions/${v.target_id}">➜ zum Einsatz</a>`
                            : `<span class="fz-muted">${e(names[v.building_id] ?? '')}</span>`}
                        <span class="fz-time">seit ${duration(ms)}</span>
                    </div>`).join('') : '<div class="fz-empty">✔ Kein Fahrzeug steht auffällig lange am Einsatz.</div>'}
                <div class="fz-section">Wachen ohne einsatzbereites Fahrzeug (${empty.length})</div>
                ${empty.length ? empty.map(b => `
                    <div class="fz-row">
                        <a class="lightbox-open" href="/buildings/${b.id}">${e(b.name)}</a>
                        <span class="fz-muted">${b.count === 1 ? 'das einzige Fahrzeug ist' : `alle ${b.count} Fahrzeuge sind`} unterwegs${b.out ? `, davon ${b.out} außer Dienst` : ''}</span>
                        <span></span>
                    </div>`).join('') : '<div class="fz-empty">✔ Jede Wache hat noch ein Fahrzeug frei.</div>'}
            </div>
            <div class="fz-foot">Die Zeit am Einsatz wird nur gemessen, solange das Spiel offen ist, ist also eher zu kurz als zu lang.
                Zurückrufen musst du im Spiel selbst.</div>`,
        });
        panel.root.addEventListener('click', ev => { if (ev.target.closest('a.lightbox-open')) panel.close(); });
    }

    let badge = null;
    function showBadge(result) {
        const total = result.long.length + result.empty.length;
        const fp = fingerprint(result);
        if (!total || load(HIDDEN_KEY, '') === fp) {
            badge?.remove();
            badge = null;
            return;
        }
        injectStyle();
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'fz-badge';
            document.body.append(badge);
        }
        const parts = [
            result.long.length ? `${result.long.length} lange am Einsatz` : '',
            result.empty.length ? `${result.empty.length} Wache${result.empty.length === 1 ? '' : 'n'} leer` : '',
        ].filter(Boolean);
        badge.innerHTML = `⏰ <span>${parts.join(' · ')}</span><span class="fz-x" title="Ausblenden, bis sich etwas ändert">✕</span>`;
        badge.onclick = ev => {
            if (ev.target.closest('.fz-x')) {
                save(HIDDEN_KEY, fp);
                badge.remove();
                badge = null;
                return;
            }
            showPanel(result);
        };
    }

    async function tick() {
        const result = await check();
        showBadge(result);
        return result;
    }

    async function start() {
        showPanel(await check());
    }

    lss.actions.vehiclesBack = start;

    if (lss.isWorkerFrame || window !== window.top) return;
    lss.addTool({ label: '⏰ Fahrzeuge zurück? (lange am Einsatz, leere Wachen)', scope: 'all', order: 47, run: start });

    // Nur auf der Hauptseite mit Karte regelmäßig nachsehen
    if (location.pathname === '/' && document.querySelector('#missions, .missionSideBarEntry, #map')) {
        const run = lss.safe('Fahrzeuge zurück', tick);
        setTimeout(run, 20000);
        setInterval(run, CHECK_MINUTES * 60000);
    }
})();
