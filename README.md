# RR. HH. Hospital - Versión 1

Aplicación web de recursos humanos para una comunidad de juego. En Netlify, la app exige iniciar sesión con Discord y solo permite el acceso a miembros del servidor `1529206705530077225` que tengan el rol `1541840117294170303`. La comprobación se hace durante el inicio de sesión y en cada petición a los datos. Los cambios se guardan en Netlify Blobs y se comparten entre los miembros autorizados.

## Publicar en Netlify

Las funciones de autenticación y guardado necesitan un despliegue de Netlify conectado al repositorio; publicar solo los archivos estáticos mediante arrastrar y soltar no publica las funciones.

1. En el [portal de desarrolladores de Discord](https://discord.com/developers/applications), crea o selecciona una aplicación y copia el **Client ID** y el **Client Secret** de OAuth2.
2. Añade esta URL como Redirect URI de OAuth2, sustituyendo el dominio por el dominio principal de tu sitio:

   `https://TU-SITIO.netlify.app/.netlify/functions/auth?action=callback`

3. Importa el repositorio en Netlify. La configuración de [netlify.toml](./netlify.toml) publica únicamente los archivos de la aplicación y despliega las funciones. No publiques la carpeta del proyecto arrastrándola a Netlify: el contenido de `datos/` y los secretos locales no forman parte de la web publicada.
4. En **Site configuration → Environment variables** de Netlify, configura:

   | Variable | Valor |
   |---|---|
   | `DISCORD_CLIENT_ID` | Client ID de la aplicación de Discord |
   | `DISCORD_CLIENT_SECRET` | Client Secret de OAuth2; mantenlo solo en Netlify |
   | `DISCORD_REDIRECT_URI` | La URL de callback exacta configurada en Discord |
   | `SESSION_SECRET` | Secreto aleatorio de al menos 32 caracteres; mantenlo solo en Netlify |

   En PowerShell puedes generar un secreto con:

   ```powershell
   [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```

5. Vuelve a desplegar el sitio. El usuario autoriza los permisos `identify` y `guilds.members.read` en Discord. No se necesita un bot de Discord ni guardar un token de bot.

## Datos y límites

- Netlify guarda los registros en un almacén persistente de Netlify Blobs; no dependen del navegador ni de `localStorage`.
- Las lecturas usan consistencia fuerte para que una escritura reciente aparezca en las siguientes consultas.
- La carpeta `datos/` contiene los datos de la versión local y no se publica. El almacén de Netlify comienza vacío y se inicializa con los datos de ejemplo de la app la primera vez que inicia sesión una persona autorizada.
- Todos los miembros con ese rol comparten los mismos datos y pueden modificarlos. No hay permisos por usuario ni historial de cambios.
- Este prototipo guarda el registro completo como un documento JSON. Si dos personas editan a la vez, una escritura puede reemplazar cambios recientes de la otra. Netlify Blobs no sustituye a una base de datos con transacciones, copias de seguridad y auditoría.
- Si se retira el rol o la persona sale del servidor, las siguientes peticiones quedan bloqueadas. La sesión usa una cookie cifrada `HttpOnly`, `Secure` y `SameSite`.
- Los despliegues de prueba de Netlify no están configurados para OAuth: utiliza el dominio principal registrado en Discord.

## Uso local

`python server.py` sirve la versión local en `http://localhost:3000` y guarda los datos en `datos/data.json`. Este servidor local **no aplica el inicio de sesión de Discord**; la verificación descrita arriba solo se ejecuta en Netlify. La versión abierta mediante `file://` o Live Server usa `localStorage`.

## Aviso

Esta aplicación está pensada para datos ficticios de un juego. No debe usarse para datos reales de trabajadores. No incluye roles internos, auditoría, copias de seguridad automáticas ni un modelo de base de datos transaccional.
