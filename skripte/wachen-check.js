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
            alert(`Wachen-Check: Fehler beim Laden der Daten\n${e.message}`);
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
