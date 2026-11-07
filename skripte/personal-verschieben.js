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
