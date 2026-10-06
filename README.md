# J.A.R.V.I.S. — App de escritorio + control remoto

Asistente de IA de escritorio inteligente, con control remoto desde el celular.

- **La app** vive en tu Mac: chatea, abre aplicaciones, lee tu calendario, busca/imprime archivos, escucha tu voz.
- **El remoto** es un sitio web que abres en el celular: manda comandos de voz y texto y JARVIS los ejecuta en tu Mac. Si la app no está abierta sale el aviso y te dice abrirla.

## En un vistazo

| | App de escritorio | Control remoto |
|---|---|---|
| Dónde se usa | en el Mac, ventana o `.app` | en el navegador del celular |
| Cómo llegas | abres la app | `https://ultimatejr.github.io/jarvis/remote/` |
| Requiere internet | solo para la IA (Groq) | sí, para hablar con la Mac |

## Requisitos (una sola vez)

1. Instala **Node.js** si no lo tienes: https://nodejs.org (elige la versión LTS).
2. Abre la Terminal y entra a esta carpeta:
   ```bash
   cd ruta/a/jarvis-electron
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```

- Chatear contigo usando Groq (IA gratuita y muy rapida).
- Abrir aplicaciones reales de tu Mac (Spotify, Safari, Mail, Notas, Calendario, etc.)
- Escucharte por voz (microfono) y responderte en el chat.
- Guardar tu API key de forma permanente en tu computadora (no en la nube, no en el navegador).

## Requisitos (una sola vez)

1. Instala **Node.js** si no lo tienes: https://nodejs.org (elige la version LTS).
2. Abre la Terminal y entra a esta carpeta:
   ```bash
   cd ruta/a/jarvis-electron
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```

## Probarla mientras la desarrollas

```bash
npm start
```

Esto abre la app en una ventana. Útil para probar cambios.

### Probando el control remoto sin la app todavía

Si no tienes la app corriendo, el sitio remoto muestra un aviso "J.A.R.V.I.S. está dormido" y te pide abrir la app en la Mac. Cuando la abres, el remoto dice "EN LÍNEA" automáticamente en unos segundos.

## El sitio remoto ya está publicado

El directorio `remote/` es el sitio del control remoto. Este repositorio lo
publica automáticamente en:

```
https://ultimatejr.github.io/jarvis/remote/
```

Solo agarra ese enlace en el navegador del celular, conéctalo a tu Worker de
Cloudflare (con la misma URL y el mismo secreto que configuraste en ⚙) y listo.

Si quieres que el remoto se actualice automáticamente cada vez que haces
modify aquí, GitHub Pages lo hace solo; no hay que rebuild ni volver a subir.

## Crear la app instalable (.dmg) que abres con doble clic

```bash
npm run dist
```

Esto genera un archivo `.dmg` dentro de la carpeta `dist/`. Ábrelo y arrastra
JARVIS a tu carpeta de Aplicaciones, igual que instalarías cualquier otro programa.
De ahí en adelante, la abres desde Launchpad o Spotlight como cualquier app.

> Nota: como la app no está firmada por Apple (eso cuesta una membresía de
> desarrollador), la primera vez que la abras macOS puede advertirte "de un
> desarrollador no identificado". Simplemente haz clic derecho sobre la app →
> "Abrir" → "Abrir" de nuevo, y quedará autorizada para siempre.

## Control remoto por WhatsApp (opcional)

You can send voice notes or text messages to a WhatsApp number and JARVIS answers with voice, controlling your Mac (printing, calendar, opening apps, etc). It is free, but requires two services:

### 1. WhatsApp (Meta for Developers)

1. Go to **developers.facebook.com**, create a developer account and a new Business app. Add the **WhatsApp** product.
2. In "API Setup" copy your **Access Token** and **Phone Number ID**.
3. Add your own number as a test recipient (you receive a verification code via WhatsApp).

### 2. Cloudflare Worker (el puente gratuito)

1. Abre la app.
2. Clic en el icono ⚙️ (arriba a la derecha).
3. Pega tu API key de Groq (gratis en https://console.groq.com/keys).
4. Elige el modelo y cuantos dias quieres que dure la key activa.
5. Guardar.

Tu key queda guardada en un archivo local dentro de la carpeta de datos de la
app (no en la nube), así que no se borra aunque cierres o reinicies tu Mac.

## Comandos que entiende JARVIS

- "hora" — te dice la hora actual
- "sistemas" — diagnostico rapido
- "abre spotify" / "abre safari" / "abre mail" / "abre notas" / "abre calendario" / "abre terminal" / "abre finder"
- "abre [cualquier app o juego instalado]" — por ejemplo "abre Steam", "abre Discord", "abre Minecraft" (si esta instalado, JARVIS lo abre aunque no este en la lista de arriba)
- "que apps tengo" / "que juegos tengo" — lista tus aplicaciones instaladas
- "que archivos hay en el escritorio/documentos/descargas" — lista archivos de esa carpeta
- "busca el archivo [nombre]" — busca un archivo por nombre en tu Mac
- "abre el archivo [nombre]" — busca y abre un archivo
- "que tengo en mi calendario hoy" / "eventos de hoy" — lee tus eventos de Calendar.app
- "busca [algo]" — abre una busqueda de Google
- Cualquier otra cosa se la pasa a la IA (Groq) para que te responda como JARVIS
- Todas las respuestas de JARVIS se leen en voz alta automaticamente

## Permisos del sistema

La primera vez que uses ciertos comandos, macOS te pedira autorizacion (esto es
normal y es la unica forma en que Apple permite que cualquier app acceda a estas
cosas):

- **Microfono** — para el boton de voz.
- **Calendarios** — al preguntar por tu agenda.
- **Archivos y carpetas** — al pedir listar o buscar archivos.

Dale "Permitir" en cada uno. Si accidentalmente le diste "No permitir" a alguno,
puedes cambiarlo despues en **Ajustes del Sistema > Privacidad y Seguridad**.

## Control remoto por WhatsApp (opcional)

Puedes mandarle notas de voz o mensajes de texto a un numero de WhatsApp y
JARVIS te contesta con otra nota de voz, controlando tu Mac de verdad
(imprimir, ver tu calendario, abrir apps, etc). Es gratis, pero requiere
configurar dos servicios:

### 1. WhatsApp (Meta for Developers)

1. Ve a **developers.facebook.com**, crea una cuenta de desarrollador y una
   App nueva de tipo "Business". Agrega el producto **WhatsApp**.
2. En "API Setup" copia tu **Access Token** y tu **Phone Number ID**.
3. Agrega tu propio numero como destinatario de prueba (te llega un codigo de
   verificacion por WhatsApp).

### 2. Cloudflare Worker (el puente gratuito)

1. Crea cuenta en **cloudflare.com** > Workers & Pages > Create Worker.
2. Pega el contenido de `jarvis-worker.js` (incluido junto a este proyecto) en
   el editor.
3. En Settings > Variables, agrega dos variables de texto:
   - `VERIFY_TOKEN`: cualquier palabra que inventes.
   - `SHARED_SECRET`: una clave larga y unica que inventes.
4. En Settings > Variables > KV Namespace Bindings, crea un namespace y
   enlazalo con el nombre `JARVIS_KV`.
5. Copia la URL de tu Worker (algo como
   `https://jarvis-bridge.tu-usuario.workers.dev`).
6. De vuelta en Meta (WhatsApp > Configuration > Webhook), configura como URL
   `https://tu-worker.../webhook` y como Verify Token el mismo que pusiste en
   `VERIFY_TOKEN`. Suscribete al campo `messages`.

### 3. Control remoto desde el celular (sin WhatsApp)

El mismo worker también sirve al remoto. Solo conectar el sitio de GitHub Pages
con **URL del Worker** + **Secreto** (misma clave) y ya funciona chat de voz y
texto desde cualquier navegador. WhatsApp usa accesos adicionales de Meta (token
+ phone number id).

### 4. Configura JARVIS

Abre ⚙️ en la app y llena: URL del Worker, el Secreto (el mismo
`SHARED_SECRET`), el Token de WhatsApp, y el Phone Number ID. Activa la
casilla de "control remoto por WhatsApp" y Guardar.

Listo — mandale una nota de voz a ese numero de WhatsApp diciendo algo como
"que tengo en mi calendario hoy" y JARVIS te contesta con voz.

**Nota:** tu Mac tiene que estar prendida y con JARVIS abierto para que esto
funcione. El token de acceso temporal de Meta expira cada 24 horas mientras
estes en modo de prueba; si quieres que sea permanente, Meta permite generar
un token de "System User" que no expira (se configura en Meta Business Suite).

## Agregar mas aplicaciones nativas

Edita `main.js`, dentro del objeto `APP_COMMANDS.darwin`, y agrega una linea
como:
```js
miapp: 'open -a "Nombre Exacto De La App"'
```
Luego agrega el alias correspondiente en `renderer.js`, dentro de `APP_ALIASES`.

## Estructura del proyecto

```
.
├── index.html           · interfaz de la app en Electron
├── renderer.js          · comportamiento de la app (voz, chat, comandos, drop)
├── preload.js           · puente seguro entre el navegador y Node
├── main.js              · Electron + puente a Groq, Meta, Cloudflare Worker
├── jarvis-worker.js     · Cloudflare Worker (puente con el celular y WhatsApp)
├── remote/              · sitio del control remoto (se publica en GitHub Pages)
├── remote/index.html    · UI del control remoto
├── package.json         · dependencias y configuración de electron-builder
└── README.md
```

## Nota final

Si algo deja de funcionar y quieres volver a un punto conocido, y tienes una
app `.dmg` ya compilada en `dist/`, también está macOS con la app abierta en la
Mac y el remoto ya con la URL de ese Worker.

## Estructura del proyecto

## Acceso TOTAL a tu Mac (opcional, recomendado)

Por defecto, macOS protege ciertas carpetas (Correo, Mensajes, respaldos de
Time Machine, algunas apps) incluso de aplicaciones normales. Si quieres que
JARVIS tenga acceso genuino a **todo** tu disco sin restricciones:

1. Ve a **Ajustes del Sistema > Privacidad y Seguridad > Acceso Total al Disco**.
2. Dale clic al "+" y agrega la app **JARVIS** (búscala en tu carpeta de
   Aplicaciones).
3. Actívale el interruptor.
4. Cierra y vuelve a abrir JARVIS.

Con esto, además de Escritorio/Documentos/Descargas, JARVIS puede leer,
buscar, copiar, mover y eliminar archivos en cualquier carpeta, porque tiene
**Acceso Total al Disco** activado.

Para activarlo: Ajustes del Sistema > Privacidad y Seguridad > Acceso Total al
Disco > agrega JARVIS > enciende el interruptor > reinicia la app.

## Arrastrar y soltar archivos

Puedes arrastrar cualquier archivo directo a la ventana. Una vez soltado, dí:
- "imprime esto" — lo manda a la impresora (te pregunta a color o B/N)
- "abre esto" — lo abre en su app por defecto
- "lee esto" — te lee el contenido (solo archivos de texto)
- "borra esto" — lo elimina permanentemente

## Arreglos de esta versión

- La app ya no abre DevTools al iniciar. Solo se abre si `npm start` lo lanzas
  directamente como desenvolvimento.
- Los mensajes del control remoto (WhatsApp y del celular) ya se borran del
  worker después de responder, para no responder el mismo mensaje dos veces si
  reinicias la app.
- La app ya manda un latido (`heartbeat`) cada 5 segundos y responde al celular
  si la Mac se fue, si la app cerró, o si la Mac simplemente no está encendida.
- Si JARVIS no tiene configurada la llave de Groq, el remoto te responde que la
  configurás primero y no deja de reconocer el comando (no se rompe).
- Bufé de audio de la app ajusta automáticamente al ruido de tu cuarto (antes
  fijaba un umbral que en cuartos ruidosos grababa brrr e ignoraba).
- Remoto nuevo: chips de comando rápido, burbujas de interceptación más claras,
  lectura de notas de voz, y un banner con botón "REINTENTAR" cuando JARVIS no
  está.
- Heading de la app y de la landing de GitHub Pages se actualizaron a
  v11.0.

## Cambios de la app principal
