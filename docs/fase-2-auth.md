# Fase 2 — Diseño de la autenticación

> Verificado contra documentación oficial el **17 de agosto de 2026**.
> La arquitectura (§6) avisa de que este punto cambia rápido: **volver a
> verificar antes de retomar** si pasan semanas. Fuentes al final.

---

## Lo que ha cambiado desde que se escribió la arquitectura

El documento daba por hecho lo peor: *"para que un desconocido pegue la URL en
Claude y funcione, el servidor debe exponer OAuth con registro dinámico de
cliente. Es lo más frágil del proyecto."*

Ya no hay que construirlo. **Supabase Auth incorpora un servidor OAuth 2.1 con
registro dinámico de cliente**, y **Claude admite `oauth_dcr` de serie**. Los dos
extremos del problema vienen resueltos; queda ensamblarlos.

Lo que sí hay que construir y no estaba previsto: **la pantalla de
consentimiento**. Supabase gestiona el protocolo pero delega la interfaz.

---

## Reparto de responsabilidades

| Pieza | Quién | Qué hace |
|---|---|---|
| Servidor de autorización | Supabase Auth | Descubrimiento, registro dinámico, códigos, tokens, refresco |
| Pantalla de consentimiento | **Nosotros** | Login del usuario + aprobar/denegar |
| Servidor de recursos | **Nosotros** (`src/http.ts`) | Valida el token y sirve las fichas |

Con la especificación vigente el servidor MCP es un **servidor de recursos puro**:
valida tokens y sirve contenido. No emite tokens ni gestiona consentimiento.

---

## Versión de la especificación

| | |
|---|---|
| Última especificación MCP | `2026-07-28` |
| Máxima del SDK que usamos (1.30.0) | `2025-11-25` |
| **Contra la que construimos** | **`2025-11-25`** |

Construir contra lo que el SDK implementa, no contra lo último publicado.
Cuando el SDK alcance `2026-07-28`, revisar.

---

## Requisitos del lado de Claude

1. **Devolver `401`, nunca un error de herramienta**, con la cabecera:

   ```http
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer resource_metadata="https://<dominio>/.well-known/oauth-protected-resource"
   ```

   Claude **no** hace caso a `WWW-Authenticate` en una respuesta `200`.

2. **Metadatos de recurso protegido** ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)):
   - `resource` debe coincidir **exactamente** con la URL que el usuario teclea
     en Claude, incluido el path.
   - `authorization_servers` debe listar el issuer de Supabase. Si hay varios,
     Claude usa **solo el primero**, sin recurrir a los siguientes.

3. **PKCE S256 obligatorio.** El servidor de autorización debe anunciar
   `"code_challenge_methods_supported": ["S256"]`. Supabase lo cumple.

4. **URLs de retorno a registrar:**

   | Cliente | Redirect URI |
   |---|---|
   | Claude.ai, Desktop, móvil | `https://claude.ai/api/mcp/auth_callback` |
   | Claude Code | loopback con puerto efímero: declara `http://localhost/callback` y `http://127.0.0.1/callback`, y el servidor de autorización **debe ignorar el puerto** al comparar |

5. **Plazos.** 10 s para descubrimiento, registro y token; 30 s para refresco.
   Pasado eso se considera fallo aunque la petición acabe bien.

6. **Red.** El tráfico de Anthropic sale de `160.79.104.0/21`. Tanto el servidor
   MCP **como Supabase** tienen que ser alcanzables desde ahí: las peticiones de
   descubrimiento al servidor de autorización vienen del mismo rango.

7. **`/token` debe aceptar `application/x-www-form-urlencoded`**; `/register`
   usa `application/json`. No es el mismo analizador de cuerpo.

---

## Lado de Supabase

Descubrimiento (con el servidor OAuth activado):

```
https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1
```

El issuer es `https://<ref>.supabase.co/auth/v1`. La ruta del documento cuelga
del path del issuer, como manda [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414).

- **Tokens:** JWT normales de Supabase, con `user_id`, `role` y `client_id`.
  Se validan contra el JWKS del proyecto.
- **Scopes:** `openid`, `email`, `profile`, `phone`.
- **Consentimiento:** Supabase redirige a nuestra URL con `authorization_id`, y
  se resuelve con `supabase.auth.oauth.getAuthorizationDetails(id)` +
  `approveAuthorization(id)` / `denyAuthorization(id)`.

Estado actual del proyecto (17/08/2026):

```
GET /.well-known/oauth-authorization-server/auth/v1
→ 404 {"error_code":"feature_disabled","msg":"OAuth server is disabled"}
```

La funcionalidad está disponible; hay que activarla en el panel.

---

## Riesgos identificados

1. **El registro dinámico y el redirect de Claude Code.** Hay una incidencia
   abierta en `supabase/auth` sobre el registro dinámico rechazando ciertos
   formatos de URI. El loopback con puerto efímero de Claude Code es justo el
   caso raro. **Probar Claude Code pronto**, no al final: puede que funcione en
   Claude Desktop y falle en Code.

2. **El registro dinámico ensucia.** Claude registra un cliente nuevo en cada
   conexión desde cero. Para volumen alto, la documentación de Claude
   recomienda CIMD o credenciales en depósito antes que registro dinámico. Para
   el MVP da igual; anotarlo para cuando haya usuarios de verdad.

3. **La pantalla de consentimiento es una interfaz pública.** Es lo primero que
   ve un desconocido del producto, y lleva login. No es un detalle técnico.

4. **Un WAF delante de Supabase rompe el flujo** aunque el servidor MCP sea
   alcanzable. Síntoma típico: el servidor MCP recibe la primera petición y el
   servidor de autorización no ve tráfico alguno.

---

## Orden de trabajo propuesto

1. Activar el servidor OAuth y el registro dinámico en el panel de Supabase.
2. Pantalla de consentimiento (login + aprobar/denegar).
3. Servidor de recursos: metadatos RFC 9728, `401` con `WWW-Authenticate`,
   validación del JWT contra el JWKS.
4. Sustituir `CEREBRO_CREADORES_POR_DEFECTO` por las suscripciones reales del
   `user_id` del token. Retirar el cerrojo `CEREBRO_PERMITIR_SIN_AUTH`.
5. Políticas RLS para el rol `authenticated`.
6. Probar en Claude Desktop **y** en Claude Code.

---

## Fuentes

- [Authentication for connectors — Claude](https://claude.com/docs/connectors/building/authentication)
- [MCP Authentication — Supabase](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [OAuth 2.1 Server — Supabase](https://supabase.com/docs/guides/auth/oauth-server)
- [Getting Started with OAuth 2.1 Server — Supabase](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Especificación MCP 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
