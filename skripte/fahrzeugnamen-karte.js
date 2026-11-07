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
