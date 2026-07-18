/**
 * content-loader.js — ServiLimpieza JLH
 *
 * Trae el contenido (servicios, precios, ciudades, testimonios, medios,
 * configuración) desde la hoja de Google Sheets vía el Apps Script Web App,
 * y lo deja disponible en window.__CMS_DATA__ para que el sitio lo use.
 *
 * Diseño a propósito conservador: si la red falla, si la URL todavía no está
 * configurada, o si la hoja está vacía, el sitio sigue mostrando el contenido
 * de siempre (el que ya existe escrito en index.html) sin ningún error visible
 * para el visitante. Nunca se "rompe" la página por este script.
 */
(function () {
  'use strict';

  // Reemplaza esta URL por la que entrega "Desplegar > Nueva implementación"
  // en el Apps Script (ver backend/README.md, paso 7).
  const API_URL = 'https://script.google.com/macros/s/AKfycbyPAvUOwCsF1aV973Cym-ajdHGnuB6t0iFdCG7uOPmRXfk2kb5pZ5krRCrgiUEkVhOfVg/exec';

  /**
   * cargarDatosCMS — pide el JSON público al Apps Script (doGet), lo guarda
   * en window.__CMS_DATA__ y avisa al resto del sitio con el evento
   * 'cms:data-ready' para que vuelva a pintarse con el contenido real.
   * Recibe: nada. Retorna: Promise<void>. Llamada por: el IIFE al final de
   * este archivo, apenas se carga la página.
   */
  function cargarDatosCMS() {
    if (!API_URL || API_URL.indexOf('TU_DEPLOYMENT_ID') !== -1) {
      console.warn('[JLH CMS] content-loader.js: falta configurar API_URL. El sitio sigue mostrando el contenido de respaldo.');
      return Promise.resolve();
    }
    return fetch(API_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status))))
      .then((data) => {
        window.__CMS_DATA__ = data;
        window.dispatchEvent(new CustomEvent('cms:data-ready'));
        ultimosMediaRows = data.media || [];
        renderGaleria_(ultimosMediaRows);
      })
      .catch((err) => {
        console.warn('[JLH CMS] No se pudo cargar el contenido dinámico, se muestra el contenido de respaldo.', err);
      });
  }

  // Última copia conocida de la hoja Media, para poder reconstruir la
  // Galería al vuelo si el clic en "Galería" la encuentra ausente.
  let ultimosMediaRows = [];

  // Promesa de la carga de datos en curso. El clic en "Galería" la espera
  // antes de intentar desplazarse, para no fallar si el usuario hace clic
  // en el primer segundo, antes de que responda Google (ver
  // interceptarClicGaleria_).
  let cargaCMSPromise = null;

  /**
   * renderGaleria_ — construye la sección "Galería" (fotos/video adicionales,
   * ej. antes-y-después sueltos) a partir de las filas de Media cuya
   * "seccion" es "galeria". Se agrega como último hijo de <body>, fuera del
   * árbol que controla el framework de la página, para no interferir con sus
   * animaciones ni su re-render. Si no hay elementos de galería, no crea nada.
   * Recibe: mediaRows (Array de filas de la hoja Media). Retorna: nada.
   * Llamada por: cargarDatosCMS().
   */
  function renderGaleria_(mediaRows) {
    const items = mediaRows
      .filter((m) => m.seccion === 'galeria')
      .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    if (!items.length) return;

    document.getElementById('galeria-jlh')?.remove(); // evita duplicados si se llama más de una vez

    const section = document.createElement('section');
    section.id = 'galeria-jlh';
    // position:absolute (no estático): #dc-root tiene una altura CSS fija
    // (~alto de pantalla) pero su contenido real es mucho más largo y se
    // desborda visualmente sin agrandar esa caja. Si esta sección se agrega
    // en flujo normal, el navegador la ubica justo después de esa caja de
    // ~1 pantalla, no después del contenido real, quedando encimada a mitad
    // de página. posicionarGaleriaJLH_() calcula la coordenada real donde
    // termina el contenido y la aplica aquí.
    section.style.cssText = 'position:absolute;left:0;width:100%;padding:96px 6%;background:#f0f4ff;';

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:48px;';
    header.innerHTML = `
      <div style="display:inline-block;background:linear-gradient(135deg,#29b6f6,#00e676);color:white;font-size:0.72rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:7px 18px;border-radius:50px;margin-bottom:14px;">MÁS EVIDENCIA</div>
      <h2 style="font-family:'Montserrat',sans-serif;font-size:clamp(1.7rem,3.5vw,2.7rem);font-weight:900;line-height:1.2;color:#1a2e6e;margin:0;">Galería de <em style="font-style:normal;color:#1565c0;">Trabajos</em></h2>
    `;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px;max-width:1200px;margin:0 auto;';

    items.forEach((item) => {
      const card = document.createElement('div');
      card.style.cssText = 'border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.15);background:white;';

      let mediaEl;
      if (item.tipo === 'video') {
        // Google bloquea con su política de seguridad que su visor de video
        // se muestre incrustado (iframe) en un sitio externo, así que se
        // abre en pestaña nueva en vez de reproducirse incrustado.
        mediaEl = document.createElement('a');
        mediaEl.href = item.url;
        mediaEl.target = '_blank';
        mediaEl.rel = 'noopener';
        mediaEl.style.cssText = 'display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;background:#1a2e6e;color:white;font-weight:800;text-decoration:none;font-family:Montserrat,sans-serif;font-size:1rem;gap:8px;';
        mediaEl.innerHTML = '▶ Ver video';
      } else if (item.tipo === 'pdf') {
        mediaEl = document.createElement('a');
        mediaEl.href = item.url;
        mediaEl.target = '_blank';
        mediaEl.rel = 'noopener';
        mediaEl.style.cssText = 'display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;background:#e3f2fd;color:#1565c0;font-weight:800;text-decoration:none;font-family:Montserrat,sans-serif;';
        mediaEl.textContent = '📄 Ver PDF: ' + (item.nombre || 'documento');
      } else {
        mediaEl = document.createElement('img');
        mediaEl.src = item.url;
        mediaEl.alt = item.alt_text || item.nombre || '';
        mediaEl.loading = 'lazy';
        mediaEl.style.cssText = 'width:100%;display:block;aspect-ratio:4/3;object-fit:cover;';
      }
      card.appendChild(mediaEl);

      if (item.nombre) {
        const caption = document.createElement('div');
        caption.style.cssText = 'padding:14px 16px;font-family:Montserrat,sans-serif;font-weight:700;font-size:0.92rem;color:#1a2e6e;';
        caption.textContent = item.nombre;
        card.appendChild(caption);
      }

      grid.appendChild(card);
    });

    section.appendChild(grid);
    document.body.appendChild(section);
    posicionarGaleriaJLH_(section);
    protegerGaleria_(section);
  }

  /**
   * posicionarGaleriaJLH_ — calcula la coordenada Y real (del documento) donde
   * termina el contenido de #dc-root (usando su scrollHeight, que sí refleja
   * el contenido desbordado aunque la caja del elemento sea más chica) y
   * ubica ahí la sección de Galería. Sin esto, la sección quedaría encimada
   * sobre "Servicios" en vez de al final de la página (ver comentario en
   * renderGaleria_). Recibe: section (el <section id="galeria-jlh"> ya
   * creado). Retorna: nada. Llamada por: renderGaleria_() y protegerGaleria_()
   * (al reinsertar, o cuando cambia el tamaño del contenido/ventana).
   */
  function posicionarGaleriaJLH_(section) {
    const raiz = document.getElementById('dc-root') || document.body.firstElementChild;
    if (!raiz || raiz === section) return;
    const rect = raiz.getBoundingClientRect();
    const topDocumento = rect.top + window.scrollY + raiz.scrollHeight;
    section.style.top = topDocumento + 'px';
  }

  /**
   * protegerGaleria_ — vigila que la sección de Galería siga presente en la
   * página. El framework original re-dibuja periódicamente su propia parte
   * del sitio (ej. el carrusel de testimonios) y en ese proceso puede borrar
   * elementos que agregamos por fuera de su control; si eso pasa, esta
   * función la vuelve a insertar de inmediato. Recibe: section (el elemento
   * <section> ya construido). Retorna: nada. Llamada por: renderGaleria_().
   */
  function protegerGaleria_(section) {
    const observer = new MutationObserver(() => {
      if (!document.body.contains(section)) {
        document.body.appendChild(section);
      }
      posicionarGaleriaJLH_(section);
    });
    observer.observe(document.body, { childList: true });

    // Reposiciona si cambia el tamaño de la ventana (ej. girar el celular)
    // o si cambia el alto del contenido real dentro de #dc-root (ej. al
    // terminar de cargar imágenes), para que la Galería no quede mal
    // ubicada en ningún dispositivo (PC, tablet, móvil).
    window.addEventListener('resize', () => posicionarGaleriaJLH_(section));
    const raiz = document.getElementById('dc-root') || document.body.firstElementChild;
    if (raiz && window.ResizeObserver) {
      new ResizeObserver(() => posicionarGaleriaJLH_(section)).observe(raiz);
    }
  }

  /**
   * interceptarClicGaleria_ — controla a mano el clic en el enlace "Galería"
   * del menú, en vez de dejar que el navegador use su salto de ancla nativo.
   * Dos problemas que resuelve: (1) el framework original vuelve a dibujar
   * partes de la página y puede quitar la sección de Galería justo antes del
   * clic; (2) si se hace clic muy rápido (antes de 1-2 segundos desde que
   * carga la página), los datos de Google todavía no llegaron y la sección
   * ni siquiera existe todavía. Por eso esta función ESPERA a que la carga
   * de datos termine (cargaCMSPromise) antes de construir/buscar la sección
   * y desplazarse. Recibe: nada. Retorna: nada. Llamada por: el IIFE al
   * final de este archivo.
   */
  function interceptarClicGaleria_() {
    // capture:true — se ejecuta ANTES que cualquier otro manejador de clic
    // que pudiera detener la propagación del evento, para que esto nunca
    // dependa de que ningún otro código "deje pasar" el clic.
    document.addEventListener('click', async (e) => {
      const link = e.target.closest('a[href="#galeria-jlh"]');
      if (!link) return;
      e.preventDefault();

      if (cargaCMSPromise) await cargaCMSPromise; // espera si Google aún no ha respondido

      if (!document.getElementById('galeria-jlh')) {
        renderGaleria_(ultimosMediaRows);
      }
      const el = document.getElementById('galeria-jlh');
      if (!el) return; // no hay elementos de galería configurados hoy: no hay a dónde ir
      // Coordenada calculada al vuelo (no se confía en un valor guardado
      // previamente) para que siempre apunte a la posición real actual.
      const y = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, true);
  }

  interceptarClicGaleria_();
  cargaCMSPromise = cargarDatosCMS();
})();
