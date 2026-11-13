/* Feuerwehr Beladung – Lernseite. Ohne Build-Schritt, reines JavaScript.
 *
 * Aufbau in Ebenen:
 *   1 Fahrzeugübersicht (in die Seite eingebettet)
 *   2 Fahrzeug im Vollbild
 *   3 Fach im Vollbild
 *   4 Gerät als Karte über dem Foto
 * Quiz und Lernstand sind eigene Vollbild-Seiten. Die Ebene steht in der Adresse (#fwb/…),
 * damit die Zurück-Taste des Geräts genau eine Ebene nach oben führt.
 */
(function () {
	'use strict';

	const cfg = window.FWB_APP;
	const wurzel = document.getElementById('fwb-app');
	if (!cfg || !wurzel) return;

	const S = {
		fahrzeuge: [],
		geladen: new Map(),
		lern: { entschieden: false, speichern: false, fahrzeuge: {}, verlauf: [] },
		quiz: null,
		quizWunsch: null,
		marken: true,
		zustand: {}, // gemerktes Bild je Fach, damit „Zurück" nicht auf ein altes Bild springt
		animation: '',
		laedt: true,
		fehler: '',
	};
	let R = { seite: 'liste' }; // aktuelle Ebene, aus der Adresse gelesen
	let fz = null; // aktuelles Fahrzeug

	const SICHER_AB = 2; // richtige Antworten in Folge, ab denen ein Gerät als sicher gilt
	const RUNDE = 10;

	const ZEICHEN = {
		bogen: '<path d="M7 16a9 9 0 1 1 3 6.7"/><path d="M5 10v6h6"/>',
		'bogen-zurueck': '<path d="M25 16a9 9 0 1 0-3 6.7"/><path d="M27 10v6h-6"/>',
		runter: '<path d="M16 6v19"/><path d="M8 17l8 8 8-8"/>',
		hoch: '<path d="M16 26V7"/><path d="M8 15l8-8 8 8"/>',
		links: '<path d="M26 16H7"/><path d="M15 8l-8 8 8 8"/>',
		rechts: '<path d="M6 16h19"/><path d="M17 8l8 8-8 8"/>',
		zurueck: '<path d="M20 6l-10 10 10 10"/>',
		zu: '<path d="M8 8l16 16M24 8L8 24"/>',
		info: '<circle cx="16" cy="16" r="11"/><path d="M16 15v7"/><path d="M16 10v.5"/>',
		suche: '<circle cx="14" cy="14" r="8"/><path d="M20 20l7 7"/>',
		quiz: '<path d="M11 12a5 5 0 1 1 7.5 4.3c-1.6 1-2.5 1.9-2.5 3.7"/><path d="M16 25v.5"/>',
		ansicht: '<path d="M6 12h17l-4-4"/><path d="M26 20H9l4 4"/>',
		liste: '<path d="M11 9h15M11 16h15M11 23h15"/><path d="M6 9h.5M6 16h.5M6 23h.5"/>',
		auge: '<path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z"/><circle cx="16" cy="16" r="3.5"/>',
		lernstand: '<path d="M6 26V15M13 26V7M20 26V18M27 26V11"/>',
	};

	/* ---------- Hilfen ---------- */

	function h(tag, attrs, ...kinder) {
		const e = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs || {})) {
			if (v == null || v === false) continue;
			if (k === 'class') e.className = v;
			else if (k === 'style') Object.assign(e.style, v);
			else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
			else if (['value', 'checked', 'disabled'].includes(k)) e[k] = v;
			else e.setAttribute(k, v === true ? '' : v);
		}
		for (const c of kinder.flat(Infinity)) {
			if (c == null || c === false) continue;
			e.append(c.nodeType ? c : document.createTextNode(String(c)));
		}
		return e;
	}

	function zeichen(name) {
		const s = h('span', { class: 'fwb-zeichen', 'aria-hidden': 'true' });
		s.innerHTML = '<svg viewBox="0 0 32 32">' + (ZEICHEN[name] || '') + '</svg>';
		return s;
	}

	const knopf = (text, beiKlick, klasse) => h('button', { type: 'button', class: 'fwb-knopf' + (klasse ? ' ' + klasse : ''), onclick: beiKlick }, text);

	async function api(pfadTeil, methode = 'GET', daten) {
		const antwort = await fetch(cfg.rest + pfadTeil, {
			method: methode,
			credentials: 'same-origin',
			headers: Object.assign({ 'X-WP-Nonce': cfg.nonce }, daten ? { 'Content-Type': 'application/json' } : {}),
			body: daten ? JSON.stringify(daten) : undefined,
		});
		if (!antwort.ok) throw new Error(antwort.status === 403 || antwort.status === 401 ? 'Du bist nicht mehr angemeldet. Bitte lade die Seite neu.' : 'Der Server hat mit Status ' + antwort.status + ' geantwortet.');
		return antwort.json();
	}

	const mische = (a) => {
		a = a.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	};

	const datum = (t) => new Date(t * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	const rechteck = (r) => ({ left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' });

	/* ---------- Daten ---------- */

	/** Baut Nachschlagetabellen für ein geladenes Fahrzeug. */
	function bereite(f) {
		const d = f.daten;
		f.geraet = new Map(d.geraete.map((g) => [g.id, g]));
		f.orte = new Map(); // Gerät → [{ fach, zustand }]
		f.nummer = new Map(); // Fach → (Gerät → laufende Nummer)
		d.faecher.forEach((fach) => {
			const nummern = new Map();
			fach.zustaende.forEach((z) =>
				z.hotspots.forEach((hs) => {
					if (hs.typ !== 'geraet') return;
					if (!nummern.has(hs.geraet)) nummern.set(hs.geraet, nummern.size + 1);
					if (!f.orte.has(hs.geraet)) f.orte.set(hs.geraet, []);
					f.orte.get(hs.geraet).push({ fach, zustand: z });
				})
			);
			f.nummer.set(fach.id, nummern);
		});
		return f;
	}

	const bild = (id) => (fz && id ? fz.bilder[id] || null : null);
	const fachVon = (id) => fz.daten.faecher.find((f) => f.id === id) || null;
	const faecherVon = (geraetId) => [...new Set((fz.orte.get(geraetId) || []).map((o) => o.fach))];
	const standVon = (geraetId) => ((S.lern.fahrzeuge || {})[fz.id] || {})[geraetId] || null;
	const ortText = (g, fach) => (fach.name || '?') + (g.ort ? ' › ' + g.ort : '');
	const quizGeraete = () => fz.daten.geraete.filter((g) => faecherVon(g.id).length);

	/* ---------- Ebenen und Adresse ---------- */

	function lies() {
		let t;
		try {
			t = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
		} catch (e) {
			t = [];
		}
		if (t[0] !== 'fwb') return { seite: 'liste' };
		if (t[1] === 'lernstand') return { seite: 'lernstand' };
		if (t[1] !== 'fz' || !/^\d+$/.test(t[2] || '')) return { seite: 'liste' };
		const r = { seite: 'fz', fz: +t[2] };
		let i = 3;
		if (t[i] === 'quiz') return Object.assign(r, { seite: 'quiz' });
		if (t[i] === 'ansicht' && t[i + 1]) {
			r.ansicht = t[i + 1];
			i += 2;
		}
		if (t[i] === 'info' || t[i] === 'suche') r.blatt = t[i];
		if (t[i] === 'fach' && t[i + 1]) {
			Object.assign(r, { seite: 'fach', fach: t[i + 1], zustand: t[i + 2] || '' });
			if (t[i + 3] === 'liste') r.blatt = 'liste';
			if (t[i + 3] === 'g' && t[i + 4]) Object.assign(r, { blatt: 'geraet', geraet: t[i + 4] });
		}
		return r;
	}

	function pfad(r) {
		if (r.seite === 'liste') return '';
		if (r.seite === 'lernstand') return 'fwb/lernstand';
		let p = 'fwb/fz/' + r.fz;
		if (r.seite === 'quiz') return p + '/quiz';
		if (r.seite === 'fz') return p + (r.ansicht ? '/ansicht/' + r.ansicht : '') + (r.blatt ? '/' + r.blatt : '');
		p += '/fach/' + r.fach + '/' + (r.zustand || '-');
		if (r.blatt === 'liste') p += '/liste';
		if (r.blatt === 'geraet') p += '/g/' + r.geraet;
		return p;
	}

	const tiefe = () => (history.state && history.state.fwb) || 0;

	/** Wechselt die Ebene. Mit ersetzen=true entsteht kein neuer Schritt für die Zurück-Taste. */
	function gehe(r, ersetzen) {
		const ziel = pfad(r);
		const url = ziel ? '#' + ziel : location.pathname + location.search;
		if (ersetzen) history.replaceState({ fwb: tiefe() }, '', url);
		else history.pushState({ fwb: tiefe() + 1 }, '', url);
		anwenden();
	}

	/** Eine Ebene nach oben: über den Verlauf, wenn der Schritt von hier stammt, sonst direkt. */
	function hoch(eltern) {
		if (tiefe() > 0) history.back();
		else gehe(eltern, true);
	}

	async function anwenden() {
		R = lies();
		if (R.seite === 'liste' || R.seite === 'lernstand') {
			fz = null;
			zeichne();
			return;
		}
		if (!S.geladen.has(R.fz)) {
			const id = R.fz;
			fz = null;
			zeichne();
			try {
				S.geladen.set(id, bereite(await api('/fahrzeuge/' + id)));
			} catch (e) {
				S.fehler = 'Das Fahrzeug konnte nicht geladen werden. ' + e.message;
				history.replaceState({ fwb: 0 }, '', location.pathname + location.search);
			}
			R = lies();
			if (R.seite === 'liste' || R.seite === 'lernstand' || !S.geladen.has(R.fz)) {
				fz = null;
				zeichne();
				return;
			}
		}
		fz = S.geladen.get(R.fz);
		if (R.seite === 'fach') {
			const f = fachVon(R.fach);
			if (!f || !f.zustaende.length) R = { seite: 'fz', fz: fz.id };
			else {
				const merk = fz.id + '/' + f.id;
				const finde = (id) => f.zustaende.find((z) => z.id === id);
				R.zustand = (finde(S.zustand[merk]) || finde(R.zustand) || f.zustaende[0]).id;
				S.zustand[merk] = R.zustand;
				if (R.blatt === 'geraet' && !fz.geraet.has(R.geraet)) R.blatt = null;
				if (location.hash !== '#' + pfad(R)) history.replaceState({ fwb: tiefe() }, '', '#' + pfad(R));
			}
		}
		zeichne();
	}

	function oeffneFach(fachId, zustandId, geraetId, ersetzen) {
		S.animation = geraetId ? '' : 'rollladen';
		const fach = fachVon(fachId);
		if (fach && fach.zustaende.length) S.zustand[fz.id + '/' + fachId] = zustandId || fach.zustaende[0].id;
		gehe({ seite: 'fach', fz: fz.id, fach: fachId, zustand: zustandId || '', blatt: geraetId ? 'geraet' : null, geraet: geraetId }, ersetzen);
	}

	/** Öffnet das Fach mit der Karte des Geräts. ausSuche: Das Fach ersetzt die Suche, die Karte ist ein eigener Schritt. */
	function oeffneGeraet(geraetId, ausSuche) {
		const ort = (fz.orte.get(geraetId) || [])[0];
		if (!ort) return;
		if (ausSuche) {
			oeffneFach(ort.fach.id, ort.zustand.id, null, true);
			S.animation = '';
		}
		oeffneFach(ort.fach.id, ort.zustand.id, geraetId, false);
	}

	/* ---------- Bausteine ---------- */

	/** Foto mit Markierungen, das die Bühne ausfüllt, ohne verzerrt zu werden. */
	function buehne(b, kinder, leerText, zusatzKlasse) {
		const verh = b ? b.w / b.h : 4 / 3;
		const flaeche = h('div', { class: 'fwb-bild' + (b ? '' : ' fwb-bild-leer'), style: { aspectRatio: String(verh) } });
		flaeche.style.setProperty('--fwb-verh', String(verh));
		if (b) flaeche.append(h('img', { src: b.url, alt: '' }));
		else flaeche.append(h('span', { class: 'fwb-bild-hinweis' }, leerText || 'Foto folgt'));
		flaeche.append(...kinder.filter(Boolean));
		return h('div', { class: 'fwb-buehne' + (zusatzKlasse ? ' ' + zusatzKlasse : '') }, flaeche);
	}

	function fusszeile(knoepfe) {
		knoepfe = knoepfe.filter(Boolean);
		return knoepfe.length ? h('footer', { class: 'fwb-fuss' }, knoepfe) : null;
	}

	function fussknopf(symbol, text, beiKlick) {
		return h('button', { type: 'button', class: 'fwb-fussknopf', onclick: beiKlick }, zeichen(symbol), h('span', {}, text));
	}

	/**
	 * Karte über dem Foto. Am Handy kommt sie von unten, am Rechner steht sie rechts.
	 * modal=true legt einen Schleier über das Foto, sonst bleibt das Foto bedienbar.
	 */
	function blatt(titel, inhalt, beiSchliessen, modal) {
		const karte = h(
			'section',
			{ class: 'fwb-blatt' + (modal ? ' fwb-blatt-modal' : ''), role: 'dialog', 'aria-label': titel },
			h('div', { class: 'fwb-blatt-kopf' }, h('h3', {}, titel), h('button', { type: 'button', class: 'fwb-rund fwb-rund-hell', 'aria-label': 'Schließen', onclick: beiSchliessen }, zeichen('zu'))),
			h('div', { class: 'fwb-blatt-inhalt' }, inhalt)
		);
		return { karte, schleier: modal ? h('div', { class: 'fwb-schleier', onclick: beiSchliessen }) : null };
	}

	function steckbrief() {
		const info = fz.daten.info;
		const felder = info.felder.filter((f) => f.wert);
		const foto = bild(info.bild);
		return [
			foto ? h('img', { class: 'fwb-steckbrief-foto', src: foto.url, alt: 'Foto ' + fz.titel }) : null,
			info.kurz ? h('p', { class: 'fwb-kurz' }, info.kurz) : null,
			felder.length ? h('dl', { class: 'fwb-fakten' }, felder.map((f) => h('div', {}, h('dt', {}, f.label), h('dd', {}, f.wert)))) : null,
			!felder.length && !info.kurz && !foto ? h('p', { class: 'fwb-hinweis' }, 'Zu diesem Fahrzeug sind noch keine Daten hinterlegt.') : null,
			cfg.bearbeiten ? h('p', {}, h('a', { class: 'fwb-link', href: cfg.bearbeiten + fz.id }, 'Fahrzeug im Backend bearbeiten')) : null,
		];
	}

	function geraetInhalt(g, f) {
		const foto = bild(g.bild);
		const zeilen = [
			['Menge', g.menge],
			['Was ist das?', g.beschreibung],
			['Im Einsatz', g.einsatz],
		].filter((z) => z[1]);
		return [
			h('p', { class: 'fwb-ueber' }, ortText(g, f) + ' · Nr. ' + fz.nummer.get(f.id).get(g.id)),
			foto ? h('img', { class: 'fwb-geraet-foto', src: foto.url, alt: g.name }) : null,
			zeilen.length ? h('dl', { class: 'fwb-geraet-daten' }, zeilen.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : h('p', { class: 'fwb-hinweis' }, 'Zu diesem Gerät ist noch nichts hinterlegt.'),
		];
	}

	/* ---------- Ebene 1: Fahrzeugübersicht ---------- */

	function uebersicht() {
		if (S.laedt && !S.fahrzeuge.length) return h('p', { class: 'fwb-laden' }, 'Beladung wird geladen …');
		if (!S.fahrzeuge.length) return h('p', { class: 'fwb-leer' }, 'Es ist noch kein Fahrzeug angelegt.');
		return h(
			'div',
			{ class: 'fwb-uebersicht' },
			h('div', { class: 'fwb-uebersicht-kopf' }, h('p', { class: 'fwb-hinweis' }, 'Wähle ein Fahrzeug.'), h('button', { type: 'button', class: 'fwb-knopf fwb-mit-zeichen', onclick: () => gehe({ seite: 'lernstand' }) }, zeichen('lernstand'), 'Mein Lernstand')),
			h(
				'div',
				{ class: 'fwb-fahrzeuge' },
				S.fahrzeuge.map((f) =>
					h(
						'button',
						{ type: 'button', class: 'fwb-fahrzeugkarte', onclick: () => gehe({ seite: 'fz', fz: f.id }) },
						f.bild ? h('img', { src: f.bild.url, alt: '' }) : h('span', { class: 'fwb-fahrzeugkarte-leer', 'aria-hidden': 'true' }),
						h(
							'span',
							{ class: 'fwb-fahrzeugkarte-text' },
							h('strong', {}, f.titel),
							f.entwurf ? h('span', { class: 'fwb-marke' }, 'Entwurf') : null,
							f.felder.filter((x) => x.wert).map((x) => h('small', {}, x.label + ': ' + x.wert))
						)
					)
				)
			)
		);
	}

	/* ---------- Ebene 2: Fahrzeug im Vollbild ---------- */

	function sucheErgebnis(q) {
		q = q.trim().toLowerCase();
		const faecher = fz.daten.faecher.filter((f) => !q || (f.name + ' ' + f.titel).toLowerCase().includes(q));
		const geraete = q ? fz.daten.geraete.filter((g) => g.name.toLowerCase().includes(q)) : [];
		const teile = [];
		if (geraete.length) {
			teile.push(
				h('p', { class: 'fwb-ueber' }, 'Geräte'),
				h(
					'ul',
					{ class: 'fwb-treffer' },
					geraete.map((g) => {
						const orte = faecherVon(g.id);
						return h('li', {}, h('button', { type: 'button', disabled: !orte.length, onclick: () => oeffneGeraet(g.id, true) }, h('strong', {}, g.name), h('span', {}, orte.length ? orte.map((f) => ortText(g, f)).join(' · ') : 'noch nicht eingezeichnet')));
					})
				)
			);
		}
		if (faecher.length) {
			teile.push(
				h('p', { class: 'fwb-ueber' }, q ? 'Fächer' : 'Alle Fächer'),
				h(
					'ul',
					{ class: 'fwb-treffer' },
					faecher.map((f) => h('li', {}, h('button', { type: 'button', onclick: () => oeffneFach(f.id, '', null, R.blatt === 'suche') }, h('strong', {}, f.name || '?'), h('span', {}, (f.titel ? f.titel + ' · ' : '') + fz.nummer.get(f.id).size + ' Geräte'))))
				)
			);
		}
		if (!teile.length) teile.push(h('p', { class: 'fwb-hinweis' }, 'Nichts gefunden.'));
		return teile;
	}

	function fahrzeugSeite() {
		const d = fz.daten;
		const a = d.ansichten.find((x) => x.id === R.ansicht) || d.ansichten[0] || null;
		const basis = { seite: 'fz', fz: fz.id, ansicht: a && a !== d.ansichten[0] ? a.id : null };
		let haupt;

		if (a) {
			haupt = buehne(
				bild(a.bild),
				a.faecher.map((r) => {
					const f = fachVon(r.fach);
					return f ? h('button', { type: 'button', class: 'fwb-hs fwb-hs-fach', style: rechteck(r), 'aria-label': 'Fach ' + f.name + (f.titel ? ', ' + f.titel : '') + ' öffnen', onclick: () => oeffneFach(f.id) }, h('span', { class: 'fwb-hs-name' }, f.name)) : null;
				}),
				'Foto „' + (a.name || 'Ansicht') + '" folgt',
				'fwb-buehne-breit'
			);
		} else if (d.faecher.length) {
			haupt = h('div', { class: 'fwb-seite' }, h('div', { class: 'fwb-karte' }, h('p', { class: 'fwb-hinweis' }, 'Für dieses Fahrzeug gibt es noch kein Außenfoto. Wähle ein Fach aus der Liste.'), sucheErgebnis('')));
		} else {
			haupt = h('div', { class: 'fwb-seite' }, h('div', { class: 'fwb-karte' }, h('p', {}, 'Für dieses Fahrzeug ist noch keine Beladung hinterlegt.')));
		}

		let karte = null;
		if (R.blatt === 'info') karte = blatt(fz.titel, steckbrief(), () => hoch(basis), true);
		if (R.blatt === 'suche') {
			const ergebnis = h('div', { class: 'fwb-suchergebnis' }, sucheErgebnis(''));
			const feld = h('input', { type: 'search', class: 'fwb-suche', placeholder: 'Gerät oder Fach suchen …', 'aria-label': 'Gerät oder Fach suchen', oninput: (ev) => ergebnis.replaceChildren(...sucheErgebnis(ev.target.value)) });
			karte = blatt('Suche', [feld, ergebnis], () => hoch(basis), true);
			setTimeout(() => feld.focus({ preventScroll: true }), 50);
		}

		const naechste = a && d.ansichten.length > 1 ? d.ansichten[(d.ansichten.indexOf(a) + 1) % d.ansichten.length] : null;
		return {
			titel: fz.titel,
			unter: a ? a.name : '',
			marke: fz.entwurf ? 'Entwurf' : '',
			zurueck: () => hoch({ seite: 'liste' }),
			haupt,
			fuss: fusszeile([
				naechste ? fussknopf('ansicht', naechste.name || 'Ansicht', () => gehe({ seite: 'fz', fz: fz.id, ansicht: naechste === d.ansichten[0] ? null : naechste.id }, true)) : null,
				fussknopf('info', 'Info', () => gehe(Object.assign({}, basis, { blatt: 'info' }))),
				fussknopf('suche', 'Suche', () => gehe(Object.assign({}, basis, { blatt: 'suche' }))),
				fussknopf('quiz', 'Quiz', () => gehe({ seite: 'quiz', fz: fz.id })),
			]),
			blatt: karte,
		};
	}

	/* ---------- Ebene 3 und 4: Fach im Vollbild, Gerät als Karte ---------- */

	function fachSeite() {
		const f = fachVon(R.fach);
		const z = f.zustaende.find((x) => x.id === R.zustand);
		const nummern = fz.nummer.get(f.id);
		const foto = bild(z.bild);
		const animation = S.animation;
		S.animation = '';
		const basis = { seite: 'fach', fz: fz.id, fach: f.id, zustand: z.id };
		const gewaehlt = R.blatt === 'geraet' ? R.geraet : null;
		const zeigeGeraet = (id) => gehe(Object.assign({}, basis, { blatt: 'geraet', geraet: id }), !!R.blatt);

		const schalter = [];
		const hotspots = z.hotspots.map((hs) => {
			if (hs.typ === 'schalter') {
				const ziel = f.zustaende.find((x) => x.id === hs.ziel);
				const text = hs.label || (ziel ? ziel.name : 'Umschalten');
				const schalte = () => {
					S.animation = 'blende';
					S.zustand[fz.id + '/' + f.id] = ziel.id;
					const bleibt = gewaehlt && ziel.hotspots.some((x) => x.geraet === gewaehlt);
					// Liegt das gewählte Gerät nicht auf dem neuen Bild, schließt sich seine Karte.
					if (R.blatt && !bleibt && tiefe() > 0) history.back();
					else gehe({ seite: 'fach', fz: fz.id, fach: f.id, zustand: ziel.id, blatt: bleibt ? 'geraet' : null, geraet: bleibt ? gewaehlt : null }, true);
				};
				schalter.push(fussknopf(hs.symbol, text, schalte));
				return h('button', { type: 'button', class: 'fwb-schalter', style: { left: hs.x + hs.w / 2 + '%', top: hs.y + hs.h / 2 + '%' }, 'aria-label': text, title: text, onclick: schalte }, zeichen(hs.symbol));
			}
			const g = fz.geraet.get(hs.geraet);
			return h(
				'button',
				{ type: 'button', class: 'fwb-hs fwb-hs-geraet' + (gewaehlt === g.id ? ' fwb-akt' : ''), style: rechteck(hs), 'aria-label': nummern.get(g.id) + ': ' + g.name, onclick: () => zeigeGeraet(g.id) },
				h('span', { class: 'fwb-hs-nr' }, nummern.get(g.id)),
				foto ? null : h('span', { class: 'fwb-hs-name' }, g.name)
			);
		});

		let karte = null;
		if (gewaehlt) {
			const g = fz.geraet.get(gewaehlt);
			karte = blatt(g.name, geraetInhalt(g, f), () => hoch(basis), false);
		} else if (R.blatt === 'liste') {
			const gruppen = new Map();
			z.hotspots.forEach((hs) => {
				if (hs.typ !== 'geraet') return;
				const g = fz.geraet.get(hs.geraet);
				const ort = g.ort || 'Im Fach';
				if (!gruppen.has(ort)) gruppen.set(ort, new Set());
				gruppen.get(ort).add(g);
			});
			karte = blatt(
				'Geräte in ' + (f.name || 'diesem Fach'),
				gruppen.size
					? [...gruppen].map(([ort, geraete]) => [
							h('p', { class: 'fwb-ueber' }, ort),
							h('ul', { class: 'fwb-treffer' }, [...geraete].map((g) => h('li', {}, h('button', { type: 'button', onclick: () => zeigeGeraet(g.id) }, h('strong', {}, nummern.get(g.id) + ' · ' + g.name), g.menge ? h('span', {}, g.menge) : null)))),
					  ])
					: h('p', { class: 'fwb-hinweis' }, 'Auf diesem Bild ist noch nichts eingezeichnet.'),
				() => hoch(basis),
				true
			);
		}

		return {
			titel: f.name || 'Fach',
			unter: [f.titel, f.zustaende.length > 1 ? z.name : ''].filter(Boolean).join(' · '),
			zurueck: () => hoch({ seite: 'fz', fz: fz.id }),
			haupt: buehne(
				foto,
				[...hotspots, animation === 'rollladen' ? h('div', { class: 'fwb-rollladen', 'aria-hidden': 'true' }) : null],
				'Foto „' + (z.name || f.name) + '" folgt',
				(S.marken ? '' : 'fwb-ohne-marken ') + (animation === 'blende' ? 'fwb-blende' : '')
			),
			fuss: fusszeile([
				fussknopf('liste', 'Geräteliste', () => gehe(Object.assign({}, basis, { blatt: 'liste' }), !!R.blatt)),
				fussknopf('auge', S.marken ? 'Markierungen aus' : 'Markierungen an', () => {
					S.marken = !S.marken;
					zeichne();
				}),
				...schalter,
			]),
			blatt: karte,
		};
	}

	/* ---------- Quiz ---------- */

	function neuesQuiz(nurIds) {
		let pool = quizGeraete();
		if (nurIds) pool = pool.filter((g) => nurIds.has(g.id));
		// Unsichere und neue Geräte kommen mit höherer Wahrscheinlichkeit dran.
		const gewichtet = pool.map((g) => {
			const e = standVon(g.id);
			let gewicht = e ? 1 + e.f * 1.5 : 2.5;
			if (e && e.s >= SICHER_AB) gewicht *= 0.35;
			return { g, schluessel: Math.pow(Math.random(), 1 / gewicht) };
		});
		gewichtet.sort((a, b) => b.schluessel - a.schluessel);
		const auswahl = gewichtet.slice(0, nurIds ? pool.length : RUNDE).map((x) => x.g.id);
		return { fz: fz.id, queue: mische(auswahl), richtig: 0, gefragt: 0, fehler: new Set(), wiederholt: new Set(), antwort: null, fertig: false, ansicht: null };
	}

	function starteQuiz(nurIds) {
		S.quiz = neuesQuiz(nurIds);
		zeichne();
	}

	function beantworte(fachId) {
		const q = S.quiz;
		if (q.antwort) return;
		const geraetId = q.queue.shift();
		const richtige = faecherVon(geraetId);
		const richtig = richtige.some((f) => f.id === fachId);
		q.gefragt++;
		if (richtig) q.richtig++;
		else {
			q.fehler.add(geraetId);
			if (!q.wiederholt.has(geraetId)) {
				q.wiederholt.add(geraetId);
				q.queue.splice(Math.min(3, q.queue.length), 0, geraetId);
			}
		}
		q.antwort = { geraetId, fachId, richtig };

		// Die Ansicht zeigen, auf der das richtige Fach liegt.
		const aktuell = fz.daten.ansichten.find((a) => a.id === q.ansicht) || fz.daten.ansichten[0];
		const liegtAuf = (a) => a && a.faecher.some((r) => richtige.some((f) => f.id === r.fach));
		if (!liegtAuf(aktuell)) {
			const andere = fz.daten.ansichten.find(liegtAuf);
			if (andere) q.ansicht = andere.id;
		}

		if (S.lern.speichern) {
			const alle = S.lern.fahrzeuge;
			const eintraege = (alle[fz.id] = alle[fz.id] || {});
			const e = (eintraege[geraetId] = eintraege[geraetId] || { r: 0, f: 0, s: 0 });
			if (richtig) {
				e.r++;
				e.s++;
			} else {
				e.f++;
				e.s = 0;
			}
			api('/lernstand/antwort', 'POST', { fahrzeug: fz.id, geraet: geraetId, richtig }).catch(() => {});
		}
		zeichne();
		const weiter = wurzel.querySelector('.fwb-weiter');
		if (weiter) weiter.focus({ preventScroll: true });
	}

	function naechsteFrage() {
		const q = S.quiz;
		q.antwort = null;
		if (!q.queue.length) {
			q.fertig = true;
			if (S.lern.speichern) {
				api('/lernstand/runde', 'POST', { fahrzeug: fz.id, richtig: q.richtig, gesamt: q.gefragt })
					.then((l) => {
						S.lern = l;
					})
					.catch(() => {});
			}
		}
		zeichne();
	}

	function quizSeite() {
		const d = fz.daten;
		const kopf = { titel: 'Quiz', unter: fz.titel, zurueck: () => hoch({ seite: 'fz', fz: fz.id }) };
		const seite = (...inhalt) => Object.assign(kopf, { haupt: h('div', { class: 'fwb-seite' }, h('div', { class: 'fwb-karte' }, inhalt)) });

		if (quizGeraete().length < 1 || d.faecher.length < 2) return seite(h('p', {}, 'Für ein Quiz braucht das Fahrzeug mindestens zwei Fächer mit eingezeichneten Geräten.'));

		if (!S.lern.entschieden) {
			const setze = async (speichern) => {
				try {
					S.lern = await api('/lernstand/einstellung', 'POST', { speichern });
				} catch (e) {
					S.lern.entschieden = true;
				}
				zeichne();
			};
			return seite(
				h('h3', {}, 'Soll dein Lernfortschritt gespeichert werden?'),
				h('p', {}, 'Dann merkt sich die Seite, welche Geräte du sicher kannst, und fragt unsichere öfter ab. Nur du siehst deinen Lernstand. Du kannst die Speicherung unter „Mein Lernstand" jederzeit ausschalten oder alles zurücksetzen.'),
				h('div', { class: 'fwb-knopfreihe' }, knopf('Ja, speichern', () => setze(true), 'fwb-primaer'), knopf('Nein, ohne Speichern üben', () => setze(false)))
			);
		}

		if (!S.quiz || S.quiz.fz !== fz.id) {
			let nur = null;
			if (S.quizWunsch === fz.id) {
				nur = new Set(
					quizGeraete()
						.filter((g) => {
							const e = standVon(g.id);
							return e && e.s < SICHER_AB;
						})
						.map((g) => g.id)
				);
			}
			S.quizWunsch = null;
			S.quiz = neuesQuiz(nur && nur.size ? nur : null);
		}
		const q = S.quiz;

		if (q.fertig) {
			const fehler = [...q.fehler].map((id) => fz.geraet.get(id));
			return seite(
				h('p', { class: 'fwb-ueber' }, 'Runde beendet'),
				h('h3', { class: 'fwb-ergebnis' }, q.richtig + ' von ' + q.gefragt + ' richtig'),
				fehler.length
					? [h('p', {}, 'Hier hakt es noch:'), h('ul', { class: 'fwb-fehlerliste' }, fehler.map((g) => h('li', {}, h('button', { type: 'button', class: 'fwb-link', onclick: () => oeffneGeraet(g.id) }, g.name), ' → ' + faecherVon(g.id).map((f) => ortText(g, f)).join(' · '))))]
					: h('p', {}, 'Keine Fehler. Stark!'),
				h('div', { class: 'fwb-knopfreihe' }, knopf('Neue Runde', () => starteQuiz(), 'fwb-primaer'), fehler.length ? knopf('Nur die Fehler üben', () => starteQuiz(new Set(q.fehler))) : null),
				S.lern.speichern ? null : h('p', { class: 'fwb-hinweis' }, 'Dein Lernfortschritt wird nicht gespeichert.')
			);
		}

		const a = q.antwort;
		const g = fz.geraet.get(a ? a.geraetId : q.queue[0]);
		const richtige = faecherVon(g.id);
		const gesamt = q.gefragt + q.queue.length;
		const ansicht = d.ansichten.find((x) => x.id === q.ansicht) || d.ansichten[0] || null;
		const aufFoto = new Set(d.ansichten.flatMap((x) => x.faecher.map((r) => r.fach)));
		const ohneFoto = d.faecher.filter((f) => !aufFoto.has(f.id));
		const zustand = (f) => (a && richtige.includes(f) ? ' fwb-ok' : a && a.fachId === f.id ? ' fwb-falsch' : '');

		const frage = h(
			'div',
			{ class: 'fwb-fragekopf' },
			h('div', { class: 'fwb-balken' }, h('i', { style: { width: (q.gefragt / gesamt) * 100 + '%' } })),
			h('p', { class: 'fwb-ueber' }, 'Frage ' + Math.min(q.gefragt + (a ? 0 : 1), gesamt) + ' von ' + gesamt + ' · ' + q.richtig + ' richtig'),
			h('h3', { class: 'fwb-frage' }, 'In welchem Fach liegt ', h('strong', {}, g.name), '?'),
			d.ansichten.length > 1 || ohneFoto.length
				? h(
						'div',
						{ class: 'fwb-wahl' },
						d.ansichten.length > 1
							? d.ansichten.map((x) =>
									h(
										'button',
										{
											type: 'button',
											class: 'fwb-chip' + (x === ansicht ? ' fwb-akt' : ''),
											onclick: () => {
												q.ansicht = x.id;
												zeichne();
											},
										},
										x.name || 'Ansicht'
									)
							  )
							: null,
						ohneFoto.map((f) => h('button', { type: 'button', class: 'fwb-chip fwb-chip-fach' + zustand(f), disabled: !!a, onclick: () => beantworte(f.id) }, f.name || '?'))
				  )
				: null
		);

		const flaeche = ansicht
			? buehne(
					bild(ansicht.bild),
					ansicht.faecher.map((r) => {
						const f = fachVon(r.fach);
						return f ? h('button', { type: 'button', class: 'fwb-hs fwb-hs-fach' + zustand(f), style: rechteck(r), disabled: !!a, 'aria-label': 'Fach ' + f.name, onclick: () => beantworte(f.id) }, h('span', { class: 'fwb-hs-name' }, f.name)) : null;
					}),
					'Foto „' + (ansicht.name || 'Ansicht') + '" folgt',
					'fwb-buehne-breit'
			  )
			: h('div', { class: 'fwb-seite' });

		let rueck = null;
		if (a) {
			rueck = blatt(
				a.richtig ? 'Richtig!' : 'Leider nein, nicht in ' + (fachVon(a.fachId).name || '?') + '.',
				[
					h('p', {}, g.name + ' liegt in ' + richtige.map((f) => ortText(g, f) + (f.titel ? ' (' + f.titel + ')' : '')).join(' und in ') + '.' + (a.richtig || !q.queue.includes(g.id) ? '' : ' Die Frage kommt gleich noch einmal.')),
					h('div', { class: 'fwb-knopfreihe' }, knopf(q.queue.length ? 'Weiter' : 'Zum Ergebnis', naechsteFrage, 'fwb-primaer fwb-weiter'), knopf('Im Fach zeigen', () => oeffneGeraet(g.id))),
				],
				naechsteFrage,
				false
			);
			rueck.karte.classList.add(a.richtig ? 'fwb-blatt-ok' : 'fwb-blatt-falsch');
		}

		return Object.assign(kopf, { haupt: [frage, flaeche], blatt: rueck });
	}

	/* ---------- Mein Lernstand ---------- */

	function lernstandSeite() {
		const an = S.lern.speichern;
		const setze = async (speichern) => {
			if (!speichern && !window.confirm('Speicherung ausschalten? Dein gespeicherter Lernstand und der Verlauf werden dabei gelöscht.')) {
				zeichne();
				return;
			}
			try {
				S.lern = await api('/lernstand/einstellung', 'POST', { speichern });
			} catch (e) {
				S.fehler = e.message;
			}
			zeichne();
		};
		const loesche = async (fahrzeug, frage) => {
			if (!window.confirm(frage)) return;
			try {
				S.lern = await api('/lernstand/zuruecksetzen', 'POST', { fahrzeug });
				S.quiz = null;
			} catch (e) {
				S.fehler = e.message;
			}
			zeichne();
		};

		const teile = [
			h(
				'div',
				{ class: 'fwb-karte' },
				h('label', { class: 'fwb-schalterzeile' }, h('input', { type: 'checkbox', checked: an, onchange: (ev) => setze(ev.target.checked) }), h('span', {}, h('strong', {}, 'Meinen Lernfortschritt speichern'), h('small', {}, 'Nur du siehst deinen Lernstand. Im Verwaltungsbereich der Seite wird er nicht angezeigt.')))
			),
		];

		if (!an) {
			teile.push(h('p', { class: 'fwb-hinweis' }, 'Die Speicherung ist ausgeschaltet. Du kannst das Quiz trotzdem nutzen, es wird nur nichts festgehalten.'));
		} else {
			S.fahrzeuge.forEach((f) => {
				const eintraege = Object.values((S.lern.fahrzeuge || {})[f.id] || {});
				const sicher = eintraege.filter((e) => e.s >= SICHER_AB).length;
				const unsicher = eintraege.length - sicher;
				const gesamt = Math.max(f.lernbar || 0, eintraege.length);
				teile.push(
					h(
						'div',
						{ class: 'fwb-karte' },
						h('p', { class: 'fwb-ueber' }, f.titel),
						h('h3', { class: 'fwb-ergebnis' }, sicher + ' von ' + gesamt + ' Geräten sicher'),
						h('div', { class: 'fwb-balken fwb-balken-gross' }, h('i', { style: { width: (gesamt ? (sicher / gesamt) * 100 : 0) + '%' } })),
						h('p', { class: 'fwb-hinweis' }, 'Ein Gerät gilt als sicher, wenn du es ' + SICHER_AB + '-mal in Folge richtig zugeordnet hast. Geübt: ' + eintraege.length + ' · noch nicht sicher: ' + unsicher + ' · noch nie gefragt: ' + (gesamt - eintraege.length)),
						h(
							'div',
							{ class: 'fwb-knopfreihe' },
							unsicher
								? knopf(
										'Unsichere Geräte üben',
										() => {
											S.quizWunsch = f.id;
											S.quiz = null;
											gehe({ seite: 'quiz', fz: f.id });
										},
										'fwb-primaer'
								  )
								: null,
							eintraege.length ? knopf('Zurücksetzen', () => loesche(f.id, 'Lernstand und Verlauf für „' + f.titel + '" zurücksetzen?')) : null
						)
					)
				);
			});

			const titel = new Map(S.fahrzeuge.map((f) => [f.id, f.titel]));
			teile.push(
				h(
					'div',
					{ class: 'fwb-karte' },
					h('h3', {}, 'Verlauf'),
					S.lern.verlauf.length
						? h(
								'table',
								{ class: 'fwb-verlauf' },
								h('thead', {}, h('tr', {}, h('th', {}, 'Datum'), h('th', {}, 'Fahrzeug'), h('th', {}, 'Ergebnis'))),
								h('tbody', {}, S.lern.verlauf.slice(0, 15).map((v) => h('tr', {}, h('td', {}, datum(v.t)), h('td', {}, titel.get(v.fz) || '–'), h('td', {}, v.r + ' von ' + v.g + ' (' + Math.round((v.r / v.g) * 100) + ' %)'))))
						  )
						: h('p', { class: 'fwb-hinweis' }, 'Noch keine abgeschlossene Quizrunde.'),
					S.lern.verlauf.length || Object.keys(S.lern.fahrzeuge || {}).length ? h('div', { class: 'fwb-knopfreihe' }, knopf('Alles zurücksetzen', () => loesche(0, 'Lernstand und Verlauf für alle Fahrzeuge zurücksetzen?'))) : null
				)
			);
		}

		return { titel: 'Mein Lernstand', unter: '', zurueck: () => hoch({ seite: 'liste' }), haupt: h('div', { class: 'fwb-seite' }, teile) };
	}

	/* ---------- Rahmen ---------- */

	function vollbild(seite) {
		const b = seite.blatt;
		return h(
			'div',
			{ class: 'fwb-voll' + (b && !b.schleier ? ' fwb-mit-karte' : ''), 'data-seite': R.seite },
			h(
				'header',
				{ class: 'fwb-bar' },
				h('button', { type: 'button', class: 'fwb-rund', 'aria-label': 'Zurück', onclick: seite.zurueck }, zeichen('zurueck')),
				h('div', { class: 'fwb-bar-text' }, h('h2', {}, seite.titel, seite.marke ? h('span', { class: 'fwb-marke' }, seite.marke) : null), seite.unter ? h('p', {}, seite.unter) : null)
			),
			S.fehler ? h('p', { class: 'fwb-fehler', role: 'alert' }, S.fehler) : null,
			h('main', { class: 'fwb-haupt' }, seite.haupt),
			b && !b.schleier ? b.karte : null,
			seite.fuss || null,
			b && b.schleier ? [b.schleier, b.karte] : null
		);
	}

	function zeichne() {
		const offen = R.seite !== 'liste';
		document.documentElement.classList.toggle('fwb-vollbild', offen);

		const alt = wurzel.querySelector('.fwb-voll');
		const alteBuehne = alt && alt.dataset.seite === R.seite ? alt.querySelector('.fwb-buehne') : null;
		const rollen = alteBuehne ? [alteBuehne.scrollLeft, alteBuehne.scrollTop] : null;

		const teile = [];
		if (!offen && S.fehler) teile.push(h('p', { class: 'fwb-fehler', role: 'alert' }, S.fehler));
		teile.push(uebersicht());

		if (offen) {
			let seite;
			if (R.seite === 'lernstand') seite = lernstandSeite();
			else if (!fz) seite = { titel: 'Beladung', unter: '', zurueck: () => hoch({ seite: 'liste' }), haupt: h('div', { class: 'fwb-seite' }, h('p', { class: 'fwb-hinweis' }, 'Fahrzeug wird geladen …')) };
			else if (R.seite === 'quiz') seite = quizSeite();
			else if (R.seite === 'fach') seite = fachSeite();
			else seite = fahrzeugSeite();
			teile.push(vollbild(seite));
		}
		wurzel.replaceChildren(...teile);
		S.fehler = '';

		const neueBuehne = wurzel.querySelector('.fwb-buehne');
		if (rollen && neueBuehne) {
			neueBuehne.scrollLeft = rollen[0];
			neueBuehne.scrollTop = rollen[1];
		}
		// Breites Foto am schmalen Bildschirm: einmal zeigen, dass es sich seitlich schieben lässt.
		if (neueBuehne && !S.geschoben && neueBuehne.scrollWidth > neueBuehne.clientWidth + 8) {
			const hinweis = h('span', { class: 'fwb-schiebehinweis', 'aria-hidden': 'true' }, zeichen('ansicht'), 'Foto seitlich schieben');
			neueBuehne.parentNode.append(hinweis);
			neueBuehne.addEventListener(
				'scroll',
				() => {
					S.geschoben = true;
					hinweis.remove();
				},
				{ once: true, passive: true }
			);
		}
	}

	window.addEventListener('popstate', anwenden);
	document.addEventListener('keydown', (ev) => {
		if (ev.key !== 'Escape' || R.seite === 'liste') return;
		const knopfZu = wurzel.querySelector('.fwb-blatt .fwb-rund') || wurzel.querySelector('.fwb-bar .fwb-rund');
		if (knopfZu) knopfZu.click();
	});

	async function start() {
		zeichne();
		try {
			const [fahrzeuge, lern] = await Promise.all([api('/fahrzeuge'), api('/lernstand')]);
			S.fahrzeuge = fahrzeuge;
			S.lern = lern;
		} catch (e) {
			S.fehler = 'Die Beladung konnte nicht geladen werden. ' + e.message;
		}
		S.laedt = false;
		if (!location.hash.startsWith('#fwb') && cfg.fahrzeug && S.fahrzeuge.some((f) => f.id === cfg.fahrzeug)) history.replaceState({ fwb: 0 }, '', '#fwb/fz/' + cfg.fahrzeug);
		anwenden();
	}

	start();
})();
