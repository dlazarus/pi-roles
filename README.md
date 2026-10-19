# pi-roles

Extensión para [pi](https://pi.dev) (`@earendil-works/pi-coding-agent`) que convierte **ficheros de texto en roles**: cada `.md` o `.txt` de un directorio define un rol con su propio system prompt y, opcionalmente, su propio modelo, proveedor, nivel de pensamiento y herramientas.

Piensa en ello como "perfiles de personalidad" para tu agente: un rol para programar, otro para tutoría, otro para traducir… y cambias entre ellos con `/rol`.

## Uso

```bash
pi --rol Ejemplo      # arrancar la sesión ya con el rol "Ejemplo" activo
```

Dentro de una sesión:

```
/rol                → selector interactivo con todos los roles (+ "(ninguno)")
/rol Ejemplo        → activar el rol "Ejemplo" directamente
```

`(ninguno)` en el selector despeja el rol y devuelve a pi a su system prompt por defecto.

Mientras un rol está activo, el footer muestra `rol: Ejemplo` en color de acento. El rol activo **sobrevive a `/resume`**: al reabrir una sesión se recupera automáticamente.

## Dónde van los roles

La extensión busca los roles en:

1. La variable de entorno `PI_ROLES_DIR`, si está definida (útil para roles por proyecto).
2. `~/.pi/roles` (por defecto).

Crea el directorio y copia el ejemplo para empezar:

```bash
mkdir -p ~/.pi/roles
cp examples/Ejemplo.md ~/.pi/roles/
```

El **nombre del rol es el nombre del fichero sin extensión** (`Ejemplo.md` → `/rol Ejemplo`).

## Definir un rol

Un rol es un fichero con un frontmatter opcional y, a continuación, el system prompt tal cual:

```markdown
---
provider: llama-server=http://127.0.0.1:8080
modelo: models/Qwen3.8-27B-UD-Q4_K_XL.gguf
pensamiento: high
herramientas: read,ls
modo: reemplazar
---
Eres un tutor de matemáticas. Explica paso a paso…
```

### Campos del frontmatter

| Campo | Valores | Efecto |
|-------|---------|--------|
| `provider` | p. ej. `llama-server=http://127.0.0.1:8080` | Proveedor del modelo (requiere `modelo` para aplicarse) |
| `modelo` | id del modelo en ese proveedor | Cambia el modelo al activar el rol |
| `pensamiento` | `off` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` | Nivel de thinking |
| `herramientas` | lista separada por comas (vacía = sin herramientas) | Herramientas activas del agente |
| `modo` | `reemplazar` (por defecto) \| `agregar` | Ver abajo |

Todo el frontmatter es opcional: un fichero sin frontmatter es simplemente un system prompt nuevo.

### `modo: reemplazar` vs `modo: agregar`

- **`reemplazar`** (por defecto): el contenido del fichero sustituye por completo el system prompt de pi. La conversación pasa a ser "pura" (sin identidad de coding agent ni sus instrucciones).
- **`agregar`**: el contenido se añade al final del system prompt de pi, conservando sus herramientas y contexto. Úsalo si el rol necesita las herramientas de pi (es la opción segura para empezar).

> Nota: todo lo que va tras el frontmatter se inyecta literalmente en el system prompt en cada turno (los comentarios HTML también cuentan para el modelo). La documentación de los campos va en el README, no dentro del fichero del rol.

## Instalación

Copia `roles.ts` a tu directorio de extensiones de pi:

```bash
# global (todas las sesiones)
cp roles.ts ~/.pi/agent/extensions/

# o solo para un proyecto
cp roles.ts <proyecto>/.pi-agent/extensions/
```

Si pi ya está en ejecución, recarga con `/reload` en la TUI.

### Requisito

pi con soporte de extensiones (`@earendil-works/pi-coding-agent`).

## Compatibilidad con compaction-indicator

Si usas también la extensión [compaction-indicator](https://github.com/dlazarus/compaction-indicator), el estado `rol: …` de esta extensión se alinea a la izquierda de la tercera línea del footer (los estados marcados con su marcador se pegan a la derecha; el de roles no lo está).

## Estructura

```
pi-roles/
├── roles.ts            # la extensión (un solo fichero)
├── examples/
│   └── Ejemplo.md      # rol de ejemplo (modo agregar, seguro para empezar)
└── README.md
```

## Licencia

AGPL-3.0-only — Copyright (C) 2026 dlazarus.

Este programa es software libre: puede redistribuirlo y/o modificarlo bajo los términos de la [GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.html) publicada por la Free Software Foundation (versión 3).

Se distribuye sin garantía de ningún tipo. Los trabajos derivados que se expongan a usuarios por una red deben publicar también su código fuente.
