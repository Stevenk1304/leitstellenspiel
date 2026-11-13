// LSS Fahrzeug-Suche
// Suchfeld für alle eigenen Fahrzeuge: z.B. "FwK" oder "Feuerwehrkran" findet jeden Feuerwehrkran mit Wache,
// Status und dem Einsatz, in dem er gerade ist. Ein Klick öffnet Fahrzeug, Wache oder Einsatz im Spielfenster.
// Liest nur, alarmiert nichts.
// Wird über tampermonkey-loader.user.js geladen, braucht gemeinsam.js.

(function () {
    'use strict';

    const MAX_RESULTS = 200;

    const FMS = {
        1: ['Frei (Funk)', '#2ea043'],
        2: ['Frei (Wache)', '#2ea043'],
        3: ['Anfahrt', '#e6a23c'],
        4: ['Am Einsatz', '#c9302c'],
        5: ['Sprechwunsch', '#3b82f6'],
        6: ['Außer Dienst', '#6b7280'],
        7: ['Patient an Bord', '#e6a23c'],
        8: ['Am Ziel', '#c9302c'],
        9: ['Wartet', '#8b929c'],
    };

    // Unterwegs = an oder auf dem Weg zu einem Einsatz bzw. mit Patient/Gefangenem; Rückfahrt zählt nicht
    const isBusy = v => v.target_type === 'mission' || [3, 4, 7, 8].includes(v.fms_real);

    const STYLE = `
        .fs-top { display:flex; gap:10px; align-items:center; padding:12px 18px; border-bottom:1px solid #3a3f47; background:#1c1f23; }
        .fs-input { flex:1; background:#2a2e34; border:1px solid #3a3f47; border-radius:6px; color:#e6e6e6; padding:8px 12px; font-size:14px; }
        .fs-only { color:#aab0b8; font-size:12px; white-space:nowrap; }
        .fs-list { overflow:auto; flex:1; padding:4px 0 12px; }
        .fs-row { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 110px minmax(0,1.2fr); align-items:center; gap:12px; padding:7px 18px; font-size:13px; border-bottom:1px solid #2e3238; }
        .fs-row:hover { background:#2a2e34; }
        .fs-row a { color:#fff !important; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; }
        .fs-row a:hover { text-decoration:underline; }
        .fs-veh { font-weight:600; }
        .fs-type { color:#8b929c; font-size:11px; }
        .fs-state { font-weight:600; font-size:12px; }
        .fs-muted { color:#6b7280; }
        .fs-head { color:#8b929c; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
        .fs-head:hover { background:none; }
        .fs-empty { padding:30px; text-align:center; color:#8b929c; }
    `;

    function injectStyle() {
        if (document.getElementById('fs-style')) return;
        const style = document.createElement('style');
        style.id = 'fs-style';
        style.textContent = STYLE;
        document.head.append(style);
    }

    // Umlaute und Sonderzeichen angleichen, damit "fwk", "FwK" und "Feuerwehr-Kran" gleich behandelt werden
    const norm = s => String(s ?? '').toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, ' ').trim();

    // Einsatzname aus der Einsatzliste der Hauptseite, falls der Einsatz dort steht
    function missionCaption(id) {
        const entry = document.getElementById(`mission_${id}`);
        if (!entry) return null;
        try { return JSON.parse(entry.getAttribute('data-sortable-by') || '{}').caption || null; } catch (e) { return null; }
    }

    async function start() {
        injectStyle();
        const panel = lss.openPanel({
            title: 'Fahrzeug-Suche',
            count: 'lädt …',
            body: `<div class="fs-top">
                    <input class="fs-input" type="search" placeholder="z.B. FwK, Feuerwehrkran, RTW Bielen, ELW 2 …" autocomplete="off">
                    <label class="fs-only"><input type="checkbox" class="fs-busy"> nur im Einsatz</label>
                </div>
                <div class="fs-list"><div class="fs-empty">Lade Fahrzeuge …</div></div>`,
        });
        const root = panel.root;
        const count = root.closest('.lssr-dialog').querySelector('.lssr-count');
        const input = root.querySelector('.fs-input');
        const busyOnly = root.querySelector('.fs-busy');
        const list = root.querySelector('.fs-list');
        input.focus();

        const [vehicles, buildings, types] = await Promise.all([
            lss.getJSON('/api/vehicles'), lss.getJSON('/api/buildings'), lss.getVehicleTypes().catch(() => ({})),
        ]);
        const buildingName = Object.fromEntries(buildings.map(b => [b.id, b.caption]));

        // Lange Namen je Fahrzeugtyp aus der Anforderungsliste des Einsatz-Helfers (z.B. 57 → "Feuerwehrkran")
        const longNames = {};
        for (const [label, ids] of Object.values(lss.actions.missionRequirements ?? {})) {
            for (const id of ids) if (typeof id === 'number') (longNames[id] ??= new Set()).add(label);
        }
        const items = vehicles.map(v => {
            const typeName = types[v.vehicle_type]?.caption ?? `Typ ${v.vehicle_type}`;
            const extra = [...(longNames[v.vehicle_type] ?? [])];
            return {
                v, typeName,
                building: buildingName[v.building_id] ?? '',
                hay: ` ${norm([v.caption, typeName, ...extra, buildingName[v.building_id]].join(' '))} `,
                typeKey: norm(typeName),
            };
        });

        const e = lss.escapeHtml;
        const rowHtml = it => {
            const { v } = it;
            const [state, color] = FMS[v.fms_real] ?? [`Status ${v.fms_real}`, '#8b929c'];
            let where = '<span class="fs-muted">–</span>';
            if (v.target_type === 'mission' && v.target_id) {
                const cap = missionCaption(v.target_id);
                where = `<a class="lightbox-open" href="/missions/${v.target_id}">🚨 ${e(cap ?? 'Einsatz öffnen')}</a>`;
            } else if (v.target_type === 'building' && v.target_id === v.building_id) {
                where = '<span class="fs-muted">↩ Rückfahrt zur Wache</span>';
            } else if (v.target_type === 'building' && v.target_id) {
                where = `<a class="lightbox-open" href="/buildings/${v.target_id}">🏥 ${e(buildingName[v.target_id] ?? 'Ziel-Gebäude')}</a>`;
            }
            return `<div class="fs-row">
                <div><a class="lightbox-open fs-veh" href="/vehicles/${v.id}">${e(v.caption)}</a><span class="fs-type">${e(it.typeName)}</span></div>
                <a class="lightbox-open" href="/buildings/${v.building_id}">${e(it.building)}</a>
                <span class="fs-state" style="color:${color}">${v.fms_real} · ${e(state)}</span>
                ${where}
            </div>`;
        };

        const draw = () => {
            const words = norm(input.value).split(' ').filter(Boolean);
            if (!words.length) {
                list.innerHTML = '<div class="fs-empty">Tippe einen Fahrzeugtyp, Namen oder eine Wache ein.</div>';
                count.textContent = `${vehicles.length} Fahrzeuge`;
                return;
            }
            const q = words.join(' ');
            let hits = items.filter(it => words.every(w => it.hay.includes(w)));
            if (busyOnly.checked) hits = hits.filter(it => isBusy(it.v));
            // Passender Fahrzeugtyp zuerst, dann im Einsatz vor frei, dann nach Name
            hits.sort((a, b) => (b.typeKey === q) - (a.typeKey === q)
                || isBusy(b.v) - isBusy(a.v)
                || a.v.caption.localeCompare(b.v.caption, 'de', { numeric: true }));
            const busy = hits.filter(it => isBusy(it.v)).length;
            count.textContent = `${hits.length} gefunden · ${busy} unterwegs`;
            list.innerHTML = hits.length
                ? `<div class="fs-row fs-head"><span>Fahrzeug</span><span>Wache</span><span>Status</span><span>Gerade bei</span></div>
                   ${hits.slice(0, MAX_RESULTS).map(rowHtml).join('')}
                   ${hits.length > MAX_RESULTS ? `<div class="fs-empty">… und ${hits.length - MAX_RESULTS} weitere. Suche genauer eingrenzen.</div>` : ''}`
                : '<div class="fs-empty">Nichts gefunden.</div>';
        };
        input.addEventListener('input', draw);
        busyOnly.addEventListener('change', draw);
        draw();
        // Erst nach dem Klick schließen: das Spiel öffnet das Fenster nur, solange der Link noch auf der Seite ist
        list.addEventListener('click', ev => { if (ev.target.closest('a.lightbox-open')) setTimeout(panel.close, 0); });
    }

    lss.actions.vehicleSearch = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '🔎 Fahrzeug-Suche', scope: 'all', order: 39, run: start });
})();
