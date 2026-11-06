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
            alert(`Fahrzeug-Übersicht: Fehler beim Laden der Daten\n${e.message}`);
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
