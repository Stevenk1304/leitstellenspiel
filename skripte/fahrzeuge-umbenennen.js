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
            alert(`Fahrzeuge umbenennen: Fehler beim Laden der Daten\n${e.message}`);
        }
    }

    if (lss.isWorkerFrame) return;

    // Menüeintrag im Tampermonkey-Menü: alle Wachen auf einmal
    if (window === window.top) GM_registerMenuCommand('Alle Fahrzeuge umbenennen', () => start(null));

    // Knopf auf der Gebäudeseite: nur diese Wache
    const match = location.pathname.match(/^\/buildings\/(\d+)\/?$/);
    const table = document.querySelector('#vehicle_table');
    if (match && table) {
        lss.addPageButton(table, '✎ Fahrzeuge dieser Wache umbenennen', () => start(Number(match[1])));
    }
})();
