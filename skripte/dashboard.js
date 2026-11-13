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
            if (e.target.closest('.db-list a')) return void setTimeout(panel.close, 0);
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
