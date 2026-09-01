# Las dos plantillas de correo de acceso

> Para pegar en Supabase → **Authentication → Emails**. Escritas el 01/09/2026
> porque las de fábrica salen en inglés y sin marca, y son lo primero que ve
> alguien que acaba de pagar.

## Por qué DOS y no una

Supabase usa plantillas distintas según el caso, y por eso se pueden escribir
dos textos:

| Plantilla | Cuándo se usa |
|---|---|
| **Confirm signup** | La primera vez, cuando la cuenta no existía |
| **Magic Link** | Cuando la cuenta ya existe y vuelve a entrar |

Distinguirlas importa: a quien entra por primera vez hay que darle la
bienvenida y decirle qué va a pasar; a quien vuelve, no — solo quiere el enlace
y que no le hagan leer.

## Reglas que se quedan aunque cambie el diseño

- **`{{ .ConfirmationURL }}` tal cual.** Es lo que conserva a dónde tiene que
  volver el usuario. Sustituirlo por una URL fija rompe el flujo de conexión:
  la persona acaba en la home en vez de en la pantalla que la estaba esperando.
- **Decir que el enlace es de un solo uso y caduca.** No es un tecnicismo: si
  alguien lo reenvía o lo abre dos veces le va a fallar, y sin ese aviso pensará
  que el producto está roto.
- **Decir que hay que abrirlo en el mismo navegador.** Es la causa número uno
  de que el acceso falle, y no se puede arreglar desde el correo — solo
  avisando.

---

## Plantilla 1 · Confirm signup (primera vez)

**Asunto:** `Entra en tu Cerebro de Ventas`

```html
<div style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8580">Cofundo · Cerebro de Ventas</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Ya casi está</h1>
    <p style="margin:0 0 24px">Pulsa aquí para entrar y terminar de conectar tu cerebro. No hay contraseña que recordar: siempre se entra así.</p>
    <p style="margin:0 0 24px">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;background:#1a1a1a;color:#fff;border-radius:8px;text-decoration:none">Entrar</a>
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#6b6560">Ábrelo <strong>en el mismo navegador</strong> donde empezaste. Si lo abres en otro o en el móvil, no podrá continuar donde lo dejaste.</p>
    <p style="margin:0;font-size:13px;color:#8a8580">El enlace caduca pronto y solo sirve una vez. Si no funciona, pide otro desde la misma pantalla.</p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a8580">Si no has sido tú, puedes ignorar este correo: sin pulsar el enlace no ocurre nada.</p>
</div>
```

---

## Plantilla 2 · Magic Link (ya tenía cuenta)

**Asunto:** `Tu enlace para entrar`

```html
<div style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8580">Cofundo · Cerebro de Ventas</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Tu enlace para entrar</h1>
    <p style="margin:0 0 24px">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;background:#1a1a1a;color:#fff;border-radius:8px;text-decoration:none">Entrar</a>
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#6b6560">Ábrelo <strong>en el mismo navegador</strong> donde lo pediste.</p>
    <p style="margin:0;font-size:13px;color:#8a8580">Caduca pronto y solo sirve una vez.</p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a8580">Si no lo has pedido tú, ignóralo: sin pulsar el enlace no ocurre nada.</p>
</div>
```

---

## Comprobación

Después de pegarlas, pide un enlace desde la pantalla de conexión y mira el
correo **en el móvil**. Si el botón se ve, el texto está en español y el
remitente es `hola@correo.cofundo.io`, está bien.
