/* =========================================================================
   Kilker Etxea — Agenda (js/agenda.js)

   Pinta los eventos del Google Calendar de la asociación en la sección
   de agenda de cada página (la que lleva el atributo data-agenda-section).
   Los datos los da js/calendar.js (KECalendar), que debe cargarse ANTES
   que este archivo.

   Qué hace:
   - Al cargar la página: pinta los próximos eventos (getUpcoming).
   - Al pulsar el botón de pasados: carga getPast una sola vez y a partir
     de ahí el botón muestra/oculta el bloque.
   - El idioma sale del atributo lang de la página (<html lang="es|eu">),
     así que el mismo archivo sirve para las dos versiones. Todos los
     textos visibles (estado vacío, error, botón) viven en el HTML de
     cada página, en su idioma.

   Seguridad: los textos de los eventos (título, lugar, descripción) los
   escribe cualquiera con acceso al calendario y pueden traer HTML. Aquí
   TODO texto entra al DOM vía textContent — nunca innerHTML — cumpliendo
   el contrato de sanitización documentado en js/calendar.js.
   ========================================================================= */

(function () {
  'use strict';

  // Cuántos eventos se muestran en cada lista (próximos y pasados).
  var MAX_EVENTS = 6;

  // Las descripciones largas se recortan a este número de caracteres.
  var DESC_MAX_CHARS = 180;

  var lang = document.documentElement.lang === 'eu' ? 'eu' : 'es';

  function init() {
    var section = document.querySelector('[data-agenda-section]');
    if (!section || !window.KECalendar) return;

    var upcomingBlock = section.querySelector('[data-agenda="upcoming"]');
    var pastBlock = section.querySelector('[data-agenda="past"]');
    var pastToggle = section.querySelector('[data-agenda-past-toggle]');

    /* ── Próximos: se cargan nada más abrir la página ── */
    if (upcomingBlock) {
      fetchEvents('upcoming').then(function (events) {
        renderInto(upcomingBlock, events);
      });
    }

    /* ── Pasados: solo bajo demanda, al pulsar el botón ── */
    var pastLoaded = false;

    if (pastToggle && pastBlock) {
      pastToggle.addEventListener('click', function () {
        var willShow = pastBlock.hidden;
        pastBlock.hidden = !willShow;
        pastToggle.setAttribute('aria-expanded', String(willShow));

        if (!willShow || pastLoaded) return;
        pastLoaded = true;
        fetchEvents('past').then(function (events) {
          renderInto(pastBlock, events);
        });
      });
    }
  }

  // Pide los eventos a KECalendar — o a los datos de prueba si están
  // activados (ver bloque comentado al final del archivo).
  function fetchEvents(kind) {
    var mock = window.KEC_AGENDA_MOCK;
    if (mock) {
      return Promise.resolve(mock[kind === 'past' ? 'past' : 'upcoming'] || []);
    }
    return kind === 'past'
      ? KECalendar.getPast(MAX_EVENTS)
      : KECalendar.getUpcoming(MAX_EVENTS);
  }

  // Pinta una lista de eventos en su bloque, o destapa el mensaje de
  // estado que toque (error de carga / agenda vacía). Los mensajes ya
  // están escritos en el HTML de cada página, en su idioma.
  function renderInto(block, events) {
    var list = block.querySelector('[data-agenda-list]');
    var emptyNote = block.querySelector('[data-agenda-empty]');
    var errorNote = block.querySelector('[data-agenda-error]');

    // kecError: marca que deja KECalendar cuando la API no respondió
    if (events && events.kecError) {
      if (errorNote) errorNote.hidden = false;
      return;
    }
    if (!events || !events.length || !list) {
      if (emptyNote) emptyNote.hidden = false;
      return;
    }
    for (var i = 0; i < events.length; i++) {
      list.appendChild(buildCard(events[i]));
    }
  }

  // Monta la tarjeta de un evento: fecha (antetítulo), título, hora y
  // lugar si existen, y descripción recortada. Los eventos de día
  // completo no traen hora (timeLabel viene vacío) y no se muestra.
  function buildCard(event) {
    var f = KECalendar.formatEvent(event, lang);

    var card = document.createElement('article');
    card.className = 'agenda-card';

    if (f.dateLabel) card.appendChild(el('p', 'agenda-card-date', f.dateLabel));
    if (f.title) card.appendChild(el('h3', 'agenda-card-title', f.title));

    var metaParts = [];
    if (f.timeLabel) metaParts.push(f.timeLabel);
    if (f.location) metaParts.push(f.location);
    if (metaParts.length) {
      card.appendChild(el('p', 'agenda-card-meta', metaParts.join(' · ')));
    }

    var desc = truncate(plainText(f.description), DESC_MAX_CHARS);
    if (desc) card.appendChild(el('p', 'agenda-card-desc', desc));

    return card;
  }

  // Crea un elemento con su clase y su texto. El texto entra SIEMPRE por
  // textContent: el navegador lo trata como texto plano, nunca como HTML.
  function el(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  // Google Calendar guarda las descripciones con HTML (<b>, <a>, <br>…).
  // Si las metiéramos tal cual por textContent se verían las etiquetas
  // escritas. Esto las convierte a texto plano de forma segura: DOMParser
  // crea un documento INERTE (no ejecuta scripts ni carga nada, y nunca
  // se conecta a la página) del que solo se extrae el texto.
  function plainText(value) {
    var text = String(value === null || value === undefined ? '' : value);
    if (!text) return '';
    // Los saltos y cierres de bloque (<br>, </p>, </li>…) desaparecerían
    // sin dejar hueco y pegarían palabras ("…Instagram.Trae…"): se
    // cambian por un espacio antes de extraer el texto.
    text = text.replace(/<\/?(br|p|div|li|ul|ol|h[1-6])[^>]*>/gi, ' ');
    try {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      return (doc.body && doc.body.textContent) || '';
    } catch (err) {
      // Sin DOMParser (rarísimo): al menos quitamos las etiquetas
      return text.replace(/<[^>]*>/g, ' ');
    }
  }

  // Recorta un texto largo por la última palabra completa y añade "…".
  // También colapsa los saltos de línea y espacios repetidos que suelen
  // quedar al convertir el HTML de la descripción.
  function truncate(text, max) {
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    var cut = text.slice(0, max);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
    return cut + '…';
  }

  // El script va al final del body, así que el DOM ya existe; la
  // comprobación de readyState cubre el caso de cargarlo de otra forma.
  // Esperar a DOMContentLoaded permite además que el bloque de datos de
  // prueba de aquí abajo se ejecute antes que init().
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ═══════════════════════════════════════════════════════════════════════
   DATOS DE PRUEBA — solo para revisar el diseño de la sección
   ═══════════════════════════════════════════════════════════════════════

   El calendario real puede estar vacío (o sin conexión). Para ver la
   agenda con contenido sin depender de Google:

     1. ACTIVAR: borra las dos líneas marcadas más abajo — la que empieza
        por "/* ACTIVAR:" y la que dice "FIN DE LOS DATOS DE PRUEBA".
     2. Recarga la página: estos datos sustituyen a la API en las dos
        listas (próximos y pasados).
     3. IMPORTANTE: vuelve a dejar las dos líneas (o deshaz el cambio
        con git) antes de publicar.

   Con listas vacías (upcoming: [] / past: []) se puede revisar también
   el estado vacío. Los eventos imitan el formato exacto de la API.
   ═══════════════════════════════════════════════════════════════════════ */

/* ACTIVAR: borra esta línea entera…
window.KEC_AGENDA_MOCK = {
  upcoming: [
    {
      summary: 'Soinu Laborategia: sintes DIY',
      location: 'Kilker Etxea, Olabeaga',
      description: 'Sesión abierta de cacharreo: montamos un oscilador desde cero y lo hacemos sonar. Trae cascos si tienes; el resto lo ponemos nosotras.',
      start: { dateTime: '2026-07-24T19:00:00+02:00' },
      end: { dateTime: '2026-07-24T21:00:00+02:00' }
    },
    {
      summary: 'Serigrafia irekia',
      location: 'Kilker Etxea',
      description: 'Taller abierto de serigrafía. <b>Plazas limitadas</b>: apúntate en el local o por Instagram.<br>Trae una camiseta o tela clara y estampa tu diseño. Tintas y pantallas incluidas. Al acabar, vermú y vinilos en la sala grande hasta que el cuerpo aguante.',
      start: { date: '2026-08-02' },
      end: { date: '2026-08-03' }
    },
    {
      summary: 'Perrafest: batzar irekia',
      start: { dateTime: '2026-08-15T18:30:00+02:00' },
      end: { dateTime: '2026-08-15T20:00:00+02:00' }
    }
  ],
  past: [
    {
      summary: 'Teknikari Kari: soinu zuzena',
      location: 'Kilker Etxea, Olabeaga',
      description: 'Mesa, microfonía y montaje de PA para conciertos pequeños.',
      start: { dateTime: '2026-06-20T18:00:00+02:00' },
      end: { dateTime: '2026-06-20T20:30:00+02:00' }
    },
    {
      summary: 'Olabeagako Jaiak: kalejira',
      start: { date: '2026-06-06' },
      end: { date: '2026-06-07' }
    }
  ]
};
…y borra también esta línea (FIN DE LOS DATOS DE PRUEBA) */
