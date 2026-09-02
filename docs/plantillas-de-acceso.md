# Las dos plantillas de correo de acceso

> Para pegar en Supabase → **Authentication → Emails**. Escritas el 01/09/2026
> porque las de fábrica salen en inglés y sin marca, y son lo primero que ve
> alguien que acaba de pagar. **Reescritas el 03/09/2026** para llevar código
> además de enlace: hay que volver a pegarlas.

## Por qué el código va primero y el enlace debajo

Un enlace mágico **depende del dispositivo por construcción**. La persona
conecta desde el ordenador, el correo le suena en el móvil, y lo abre ahí. Es
el gesto natural, y entonces el enlace aterriza en un navegador que no tiene la
solicitud a medias: no puede continuar donde lo dejó. Ninguna advertencia en
negrita lo evita — Cristian se lo comió tres veces en una tarde sabiendo
exactamente lo que hacía.

Un código no depende del dispositivo: se lee donde llegue y se teclea donde
estás. El fallo no se avisa mejor, **desaparece**.

El enlace se sigue mandando y la pantalla lo sigue aceptando. Esto suma un
camino, no quita ninguno.

## Por qué DOS y no una

Supabase usa plantillas distintas según el caso, y por eso se pueden escribir
dos textos:

| Plantilla | Cuándo se usa |
|---|---|
| **Confirm signup** | La primera vez, cuando la cuenta no existía |
| **Magic Link** | Cuando la cuenta ya existe y vuelve a entrar |

Distinguirlas importa: a quien entra por primera vez hay que darle la
bienvenida y decirle qué va a pasar; a quien vuelve, no — solo quiere entrar y
que no le hagan leer.

## Reglas que se quedan aunque cambie el diseño

- **`{{ .Token }}` es el código de seis cifras.** Es lo que hace que el acceso
  funcione desde cualquier dispositivo. Si se cae de la plantilla, la caja de
  la pantalla de acceso se queda sin nada que escribir y volvemos al problema
  de antes.
- **El código, grande y como texto suelto.** Tiene que poder seleccionarse y
  copiarse desde el móvil. Metido dentro de una frase no se copia bien.
- **`{{ .ConfirmationURL }}` tal cual.** Es lo que conserva a dónde tiene que
  volver el usuario. Sustituirlo por una URL fija rompe el flujo de conexión.
- **Decir que caduca y que sirve una vez.** No es un tecnicismo: si alguien lo
  reenvía o lo usa dos veces le va a fallar, y sin ese aviso pensará que el
  producto está roto.
- **El aviso del mismo navegador ya solo cuelga del enlace**, que es lo único
  a lo que le afecta. Ponerlo arriba del todo hacía que pareciera que también
  el código tiene esa pega, y no la tiene.

---

## Plantilla 1 · Confirm signup (primera vez)

**Asunto:** `Tu código para entrar en el Cerebro de Ventas`

```html
<div style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8580">Cofundo · Cerebro de Ventas</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Ya casi está</h1>
    <p style="margin:0 0 20px">Escribe este código en la pantalla que tienes abierta. No hay contraseña que recordar: siempre se entra así.</p>
    <p style="margin:0 0 8px;font-size:36px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">{{ .Token }}</p>
    <p style="margin:0 0 28px;font-size:13px;color:#8a8580">Caduca en una hora y solo sirve una vez.</p>
    <p style="margin:0 0 12px;font-size:14px;color:#6b6560">¿Estás leyendo esto en el mismo navegador donde empezaste? Entonces también puedes entrar de un toque:</p>
    <p style="margin:0 0 8px">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:10px 20px;background:#f4f2ef;color:#1a1a1a;border:1px solid #e3dfd9;border-radius:8px;text-decoration:none;font-size:14px">Entrar directamente</a>
    </p>
    <p style="margin:0;font-size:13px;color:#8a8580">Si lo abres en otro navegador o en el móvil, ese botón no podrá continuar donde lo dejaste. El código de arriba sí funciona desde donde sea.</p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a8580">Si no has sido tú, puedes ignorar este correo: sin usar el código no ocurre nada.</p>
</div>
```

---

## Plantilla 2 · Magic Link (ya tenía cuenta)

**Asunto:** `Tu código para entrar`

```html
<div style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8580">Cofundo · Cerebro de Ventas</p>
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3">Tu código para entrar</h1>
    <p style="margin:0 0 8px;font-size:36px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">{{ .Token }}</p>
    <p style="margin:0 0 28px;font-size:13px;color:#8a8580">Caduca en una hora y solo sirve una vez.</p>
    <p style="margin:0 0 12px;font-size:14px;color:#6b6560">Si estás en el mismo navegador donde lo pediste, también vale este botón:</p>
    <p style="margin:0">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:10px 20px;background:#f4f2ef;color:#1a1a1a;border:1px solid #e3dfd9;border-radius:8px;text-decoration:none;font-size:14px">Entrar directamente</a>
    </p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a8580">Si no lo has pedido tú, ignóralo: sin usar el código no ocurre nada.</p>
</div>
```

---

## Comprobación

Después de pegarlas, pide el acceso desde la pantalla de conexión **en el
ordenador** y abre el correo **en el móvil**. Copia el código, escríbelo en el
ordenador y entra. Ese recorrido — el que antes era imposible — es justo el que
hay que probar.
