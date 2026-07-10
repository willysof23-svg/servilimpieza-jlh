# Backend JLH CMS — Google Sheets + Apps Script

Esta es la "base de datos" del sitio: una hoja de Google Sheets que cualquiera puede
editar, más un pequeño programa (Apps Script) que conecta esa hoja con la página web.

## 1. Crear la hoja de cálculo

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
2. Nómbrala, por ejemplo, **"JLH CMS DB"**.

## 2. Pegar el código

1. En la hoja, ve a **Extensiones > Apps Script**.
2. Borra el contenido de `Code.gs` que aparece por defecto y pega **todo** el
   contenido del archivo [`Code.gs`](./Code.gs) de esta carpeta.
3. Guarda (ícono de disquete o Ctrl+S).

## 3. Crear la carpeta de Drive para los archivos

1. En [drive.google.com](https://drive.google.com), crea una carpeta llamada
   **"JLH_CMS_Media"**.
2. Ábrela y copia el ID de la carpeta desde la URL (la parte después de
   `/folders/`).

## 4. Configurar el token y la carpeta

1. Vuelve a la hoja de cálculo y **recarga la página** (para que aparezca el
   menú "🧹 JLH Admin" en la barra superior).
2. Ve a **🧹 JLH Admin > 0. Configurar token admin y carpeta de Drive**.
3. Escribe una clave secreta a tu gusto (esto es la "contraseña" que usará
   `admin.html`) y pega el ID de la carpeta de Drive del paso 3.

## 5. Crear las hojas y migrar el contenido actual

1. **🧹 JLH Admin > 1. Crear hojas y encabezados**.
2. **🧹 JLH Admin > 2. Migrar contenido inicial (texto)** — esto llena
   Servicios, Precios, Ciudades, Testimonios y Config con el contenido que
   hoy está escrito directamente en el sitio, para que no se pierda nada.

## 6. Migrar las imágenes/video actuales

1. Dentro de `JLH_CMS_Media`, crea una subcarpeta por sección, por ejemplo:
   `logo`, `resultados`, `cobertura`, `galeria`.
2. Sube ahí las imágenes/video correspondientes (las 6 imágenes ya usadas en
   el sitio están en `assets/images/img-01.png` ... `img-06.png` de este
   proyecto; los archivos nuevos —`jlhcampaña2.mp4`, `jlhantesydespvarios.jpg`,
   `jlhgatoyperrito.jpg`— van en la subcarpeta que corresponda, por ejemplo
   `galeria`).
3. **🧹 JLH Admin > 3. Sincronizar medios desde carpeta de Drive**, pega el ID
   de `JLH_CMS_Media` cuando lo pida.
4. Esto crea automáticamente una fila en la hoja **Media** por cada archivo
   nuevo que encuentre. Revisa esa hoja y ajusta la columna `orden` o
   `alt_text` si quieres.

## 7. Publicar como aplicación web

1. En el editor de Apps Script: **Desplegar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. "Ejecutar como": **Yo (tu cuenta)**.
4. "Quién tiene acceso": **Cualquier usuario**.
5. Haz clic en **Desplegar** y autoriza los permisos que pida (son tu propia
   hoja y tu propio Drive).
6. Copia la **URL de la aplicación web** que te entrega — la vas a necesitar
   en `js/content-loader.js` y en `admin.html`.

## Notas importantes

- **Nunca compartas el token admin** fuera del equipo que administra el sitio
  — quien lo tenga puede editar/borrar contenido desde `admin.html`.
- Cada vez que cambies el código de `Code.gs`, tienes que **crear una nueva
  versión** del despliegue (Desplegar > Gestionar implementaciones > lápiz de
  editar > Versión: Nueva > Implementar) para que los cambios se reflejen en
  la URL pública. Editar el código sin esto no actualiza el sitio en vivo.
- La hoja de cálculo ES la base de datos: puedes editar/eliminar filas
  directamente ahí en cualquier momento sin pasar por `admin.html`.
