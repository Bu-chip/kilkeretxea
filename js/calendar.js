/* =========================================================================
   Kilker Etxea — Módulo de calendario (js/calendar.js)

   Lee los eventos del Google Calendar público de la asociación usando la
   API REST v3 de Google Calendar, sin ninguna librería externa.

   Se expone como objeto global `KECalendar` (sin ES modules, para máxima
   compatibilidad con el setup actual de la web):

     KECalendar.getUpcoming(maxResults)
         → Promise con los próximos eventos desde ahora, en orden
           ascendente (el más cercano primero). Si algo falla, resuelve
           con un array vacío (nunca rompe la página).

     KECalendar.getPast(maxResults)
         → Promise con los eventos ya pasados, en orden descendente
           (el más reciente primero). Igual: si falla, array vacío.

     KECalendar.formatEvent(event, lang)
         → Convierte un evento crudo de la API en un objeto normalizado:
           { title, dateLabel, timeLabel, location, description }
           con las fechas formateadas en "es" o "eu".
           En eventos de día completo, timeLabel es "" (cadena vacía).

     KECalendar.escapeHtml(texto)
         → Escapa caracteres HTML peligrosos (& < > " ').

   ┌─────────────────────────────────────────────────────────────────────┐
   │ ⚠️  SEGURIDAD — LEER ANTES DE PINTAR EVENTOS EN LA PÁGINA           │
   │                                                                     │
   │ El título, la ubicación y la descripción de un evento los escribe   │
   │ una persona en Google Calendar y PUEDEN CONTENER HTML. Este módulo  │
   │ devuelve esos textos tal cual (sin escapar), así que quien los use  │
   │ debe SIEMPRE hacer una de estas dos cosas:                          │
   │                                                                     │
   │   1. Insertarlos con `elemento.textContent = valor;`  (recomendado) │
   │   2. O, si construyes HTML con cadenas (innerHTML), pasar CADA      │
   │      campo por `KECalendar.escapeHtml(valor)` antes.                │
   │                                                                     │
   │ Nunca hagas `innerHTML = evento.summary` (ni ningún otro campo)     │
   │ sin escapar: es una puerta abierta a inyección de código (XSS).     │
   └─────────────────────────────────────────────────────────────────────┘
   ========================================================================= */

(function (window) {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════
     CONFIGURACIÓN — esto es lo único que hay que tocar en el día a día
     ════════════════════════════════════════════════════════════════════ */

  // ID del calendario público de Kilker Etxea.
  // Se encuentra en Google Calendar → rueda de Ajustes → clic en el
  // calendario (columna izquierda) → "Integrar el calendario" → "ID del
  // calendario". Si algún día se crea un calendario nuevo, basta con
  // pegar aquí su ID.
  var CALENDAR_ID =
    '8028de6ccc82fb2a49eb761d647264871803373008c49613a244a0792dc24e73@group.calendar.google.com';

  // Clave de API de Google (Google Cloud Console → APIs y servicios →
  // Credenciales). Es una clave de SOLO LECTURA para datos ya públicos,
  // por eso puede ir en el código de la web; conviene tenerla restringida
  // por dominio (HTTP referrer) en la consola de Google para que nadie
  // más pueda usarla desde otra web.
  var API_KEY = 'AIzaSyCAH95flEz7MR3h1i5XacFphzfmSsEG8lk';

  // Zona horaria en la que se muestran las fechas y horas de los eventos.
  var TIMEZONE = 'Europe/Madrid';

  /* ── Ajustes internos (normalmente no hace falta tocarlos) ── */

  // Cuánto tiempo se reutiliza la respuesta guardada antes de volver a
  // preguntar a Google: 1 hora, en milisegundos.
  var CACHE_TTL_MS = 60 * 60 * 1000;

  // Prefijo de las claves usadas en sessionStorage, para no chocar con
  // otras cosas que se guarden ahí.
  var CACHE_PREFIX = 'kecalendar:';

  // Al pedir eventos pasados solo se mira hacia atrás este número de
  // meses. Evita descargar todo el histórico del calendario.
  var PAST_WINDOW_MONTHS = 12;

  // Tamaño de página al pedir eventos a la API (Google admite hasta 2500
  // por página; su valor por defecto es 250, que aquí sobra) y máximo de
  // páginas que se encadenan por petición. 4 × 250 = 1000 eventos: de sobra.
  var PAGE_SIZE = 250;
  var MAX_PAGES = 4;

  // Valor por defecto de maxResults si quien llama no indica ninguno.
  var DEFAULT_MAX_RESULTS = 10;

  var API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/';

  /* ════════════════════════════════════════════════════════════════════
     UTILIDADES INTERNAS
     ════════════════════════════════════════════════════════════════════ */

  // Escapa los 5 caracteres especiales de HTML. Usar sobre CUALQUIER
  // campo de evento que se vaya a insertar vía innerHTML (ver aviso de
  // seguridad en la cabecera del archivo).
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Deja maxResults como un entero razonable entre 1 y PAGE_SIZE.
  function normalizeMaxResults(maxResults) {
    var n = parseInt(maxResults, 10);
    if (isNaN(n) || n < 1) return DEFAULT_MAX_RESULTS;
    return Math.min(n, PAGE_SIZE);
  }

  // Construye la URL del endpoint de eventos con sus parámetros.
  // El ID del calendario lleva una "@", por eso se pasa por
  // encodeURIComponent.
  function buildUrl(params) {
    var query = [];
    for (var key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    }
    return API_BASE + encodeURIComponent(CALENDAR_ID) + '/events?' + query.join('&');
  }

  /* ── Caché en sessionStorage ──
     Guardamos { ts: <momento de guardado>, events: [...] } y lo
     reutilizamos durante CACHE_TTL_MS. Todo va envuelto en try/catch:
     sessionStorage puede no existir o lanzar error (navegación privada,
     cookies bloqueadas, cuota llena...) y en ese caso simplemente
     seguimos sin caché. */

  function cacheGet(key) {
    try {
      var raw = window.sessionStorage.getItem(key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || typeof entry.ts !== 'number' || !Array.isArray(entry.events)) {
        return null;
      }
      if (Date.now() - entry.ts > CACHE_TTL_MS) return null; // caducado
      return entry.events;
    } catch (err) {
      return null;
    }
  }

  function cacheSet(key, events) {
    try {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ ts: Date.now(), events: events })
      );
    } catch (err) {
      // Sin caché: no pasa nada, solo se pedirá a Google más a menudo.
    }
  }

  /* ── Peticiones a la API ── */

  // Hace un GET al endpoint de eventos y devuelve una Promise con
  // { items: [...], nextPageToken: '...' | undefined }.
  function requestPage(params) {
    return window.fetch(buildUrl(params)).then(function (response) {
      if (!response.ok) {
        throw new Error('Google Calendar API respondió HTTP ' + response.status);
      }
      return response.json();
    }).then(function (data) {
      return {
        items: data && Array.isArray(data.items) ? data.items : [],
        nextPageToken: data ? data.nextPageToken : undefined
      };
    });
  }

  // Encadena páginas de resultados y devuelve todos los eventos juntos,
  // en el orden ascendente en que los da Google.
  //
  // OJO: la API avisa de que una página puede llegar INCOMPLETA (menos
  // eventos que maxResults, o incluso ninguno, aunque haya más), y que
  // eso se detecta porque viene nextPageToken. Por eso aquí se sigue el
  // token hasta reunir `enough` eventos (o hasta que Google no dé más
  // páginas), con el tope de seguridad MAX_PAGES.
  //
  // `enough`: nº de eventos con el que ya podemos parar; si se omite,
  // se descarga todo lo que haya (hasta MAX_PAGES páginas).
  function requestAllPages(params, enough) {
    var target = typeof enough === 'number' ? enough : Infinity;
    var all = [];

    function nextPage(pageToken, pagesLeft) {
      var pageParams = {};
      for (var key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
          pageParams[key] = params[key];
        }
      }
      if (pageToken) pageParams.pageToken = pageToken;

      return requestPage(pageParams).then(function (page) {
        all = all.concat(page.items);
        if (page.nextPageToken && pagesLeft > 1 && all.length < target) {
          return nextPage(page.nextPageToken, pagesLeft - 1);
        }
        return all;
      });
    }

    return nextPage(null, MAX_PAGES);
  }

  // Momento de FIN de un evento, en milisegundos. Sirve para saber si un
  // evento ya ha terminado de verdad:
  //   - Con hora: end.dateTime.
  //   - Día completo: end.date es EXCLUSIVO (un evento del día 15 trae
  //     end.date = "…-16"), es decir, apunta justo a la medianoche en la
  //     que el evento termina. Lo anclamos a medianoche UTC (1-2 h más
  //     tarde que la de Madrid): margen inofensivo para este uso.
  //   - Sin end (caso raro): se usa el inicio para no perder el evento.
  // Si nada es parseable devuelve 0 (= "hace mucho", cuenta como pasado).
  function eventEndMs(event) {
    var safeEvent = event || {};
    var end = safeEvent.end || {};
    var start = safeEvent.start || {};
    var date = null;

    if (end.dateTime) {
      date = new Date(end.dateTime);
    } else if (end.date) {
      date = new Date(String(end.date) + 'T00:00:00Z');
    } else if (start.dateTime) {
      date = new Date(start.dateTime);
    } else if (start.date) {
      date = new Date(String(start.date) + 'T00:00:00Z');
    }

    return date && !isNaN(date.getTime()) ? date.getTime() : 0;
  }

  /* ════════════════════════════════════════════════════════════════════
     API PÚBLICA
     ════════════════════════════════════════════════════════════════════ */

  /**
   * Próximos eventos a partir de ahora, en orden ascendente
   * (el más cercano en el tiempo primero).
   *
   * Incluye los eventos que están ocurriendo ahora mismo (la API filtra
   * por hora de FIN, así que un evento ya empezado pero no terminado
   * también aparece).
   *
   * @param {number} [maxResults=10]  Cuántos eventos como máximo.
   * @returns {Promise<Array>}  Eventos crudos de la API (pasar cada uno
   *                            por formatEvent antes de mostrarlo).
   *                            Si hay cualquier error: array vacío.
   */
  function getUpcoming(maxResults) {
    var max = normalizeMaxResults(maxResults);
    var cacheKey = CACHE_PREFIX + 'upcoming:' + max;

    var cached = cacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);

    return requestAllPages({
      key: API_KEY,
      // singleEvents=true expande los eventos recurrentes en citas
      // individuales; es OBLIGATORIO para poder usar orderBy=startTime.
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: TIMEZONE,
      timeMin: new Date().toISOString(),
      maxResults: String(max)
    }, max).then(function (events) {
      // Si Google entregó alguna página incompleta, requestAllPages ya
      // habrá pedido más; aquí solo recortamos al máximo solicitado.
      var upcoming = events.slice(0, max);
      cacheSet(cacheKey, upcoming);
      return upcoming;
    }).catch(function (err) {
      console.warn('[KECalendar] No se pudieron cargar los próximos eventos:', err);
      return [];
    });
  }

  /**
   * Eventos ya pasados (terminados), en orden descendente
   * (el más reciente primero). Solo mira PAST_WINDOW_MONTHS meses atrás.
   *
   * Nota técnica 1: la API de Google solo ordena ascendente, así que no
   * vale con pedir "los N últimos". Hay que descargar la ventana de
   * pasados completa (paginando si hace falta), invertir el array y
   * quedarse con los N primeros. Si solo pidiéramos maxResults=N con
   * orden ascendente, Google devolvería los N MÁS ANTIGUOS de la
   * ventana, que es justo lo contrario de lo que se quiere.
   *
   * Nota técnica 2: timeMax filtra por hora de INICIO, así que Google
   * también devuelve aquí los eventos que ya han empezado pero siguen
   * en marcha. Esos se descartan filtrando por hora de FIN en cliente:
   * un evento en curso pertenece a "próximos" (getUpcoming ya lo
   * incluye), no a "pasados". Sin este filtro saldría duplicado en las
   * dos listas mientras está ocurriendo.
   *
   * @param {number} [maxResults=10]  Cuántos eventos como máximo.
   * @returns {Promise<Array>}  Eventos crudos de la API (pasar cada uno
   *                            por formatEvent antes de mostrarlo).
   *                            Si hay cualquier error: array vacío.
   */
  function getPast(maxResults) {
    var max = normalizeMaxResults(maxResults);
    var cacheKey = CACHE_PREFIX + 'past:' + max;

    var cached = cacheGet(cacheKey);
    if (cached) return Promise.resolve(cached);

    var now = new Date();
    var windowStart = new Date(now.getTime());
    windowStart.setMonth(windowStart.getMonth() - PAST_WINDOW_MONTHS);

    return requestAllPages({
      key: API_KEY,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: TIMEZONE,
      timeMin: windowStart.toISOString(),
      timeMax: now.toISOString(),
      maxResults: String(PAGE_SIZE)
    }).then(function (events) {
      // Fuera los que aún no han terminado (ver nota técnica 2)...
      var nowMs = now.getTime();
      var finished = events.filter(function (ev) {
        return eventEndMs(ev) <= nowMs;
      });
      // ...ascendente → descendente, y nos quedamos con los N más recientes.
      var recent = finished.reverse().slice(0, max);
      cacheSet(cacheKey, recent);
      return recent;
    }).catch(function (err) {
      console.warn('[KECalendar] No se pudieron cargar los eventos pasados:', err);
      return [];
    });
  }

  /* ── Formateo de fechas ── */

  // Los eventos de DÍA COMPLETO llegan con start.date = "2026-07-15"
  // (solo fecha, sin hora ni zona). Para que ese "15" siga siendo día 15
  // se mire desde donde se mire, lo anclamos al mediodía UTC: formateado
  // en Europe/Madrid (UTC+1 o UTC+2) siempre cae en el mismo día.
  function parseAllDayDate(dateStr) {
    var date = new Date(String(dateStr) + 'T12:00:00Z');
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Convierte un evento crudo de la API en un objeto listo para pintar.
   *
   * @param {Object} event  Evento tal como lo devuelve la API
   *                        (elemento de getUpcoming / getPast).
   * @param {string} lang   "es" o "eu" (cualquier otro valor → "es").
   * @returns {{title: string, dateLabel: string, timeLabel: string,
   *            location: string, description: string}}
   *   - title:       título del evento ("" si no tiene).
   *   - dateLabel:   fecha larga localizada, p. ej.
   *                  es → "miércoles, 15 de julio de 2026"
   *                  eu → "2026(e)ko uztailaren 15(a), asteazkena"
   *   - timeLabel:   hora de inicio "19:30" en Europe/Madrid, o ""
   *                  (cadena vacía) si el evento es de día completo.
   *   - location:    ubicación ("" si no tiene).
   *   - description: descripción ("" si no tiene).
   *
   * ⚠️ Los textos NO vienen escapados: insertarlos con textContent o
   *    pasarlos por KECalendar.escapeHtml (ver cabecera del archivo).
   */
  function formatEvent(event, lang) {
    var locale = lang === 'eu' ? 'eu' : 'es';
    var safeEvent = event || {};
    var start = safeEvent.start || {};

    // Día completo → la API manda start.date; con hora → start.dateTime.
    var isAllDay = !start.dateTime;
    var startDate = isAllDay
      ? parseAllDayDate(start.date)
      : new Date(start.dateTime);
    if (startDate && isNaN(startDate.getTime())) startDate = null;

    var dateLabel = '';
    var timeLabel = '';

    if (startDate) {
      try {
        dateLabel = new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: TIMEZONE
        }).format(startDate);

        if (!isAllDay) {
          timeLabel = new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: TIMEZONE
          }).format(startDate);
        }
      } catch (err) {
        // Navegador sin soporte de Intl/zona horaria: dejamos al menos
        // la fecha en crudo (AAAA-MM-DD) antes que no mostrar nada.
        dateLabel = String(start.date || start.dateTime || '').slice(0, 10);
      }
    }

    return {
      title: safeEvent.summary || '',
      dateLabel: dateLabel,
      timeLabel: timeLabel,
      location: safeEvent.location || '',
      description: safeEvent.description || ''
    };
  }

  /* ── Exposición global ── */
  window.KECalendar = {
    getUpcoming: getUpcoming,
    getPast: getPast,
    formatEvent: formatEvent,
    escapeHtml: escapeHtml
  };
})(window);
