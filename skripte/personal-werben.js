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
            alert(`Personalwerbung: Fehler beim Laden der Daten\n${e.message}`);
        }
    }

    lss.actions.hire = start;

    if (lss.isWorkerFrame) return;

    lss.addTool({ label: '📣 Personalwerbung starten', scope: 'building', order: 35, run: id => start([id]) });
    lss.addTool({ label: '📣 Personalwerbung (alle mit Personalmangel)', scope: 'all', order: 35, run: () => start(null) });
})();
