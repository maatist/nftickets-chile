# 03 — El Monorepo (bootstrap de la Tarea 1)

Este doc explica la base creada en la Tarea 1: el monorepo pnpm + turborepo y cada
archivo de configuración raíz. Este es el andamiaje sobre el que se construye todo lo demás.

## ¿Qué es un monorepo, y por qué aquí?

Un **monorepo** mantiene múltiples proyectos relacionados en un solo repositorio. Aquí tenemos cuatro:
los smart contracts, una librería TypeScript compartida, el subgraph y la app web. Están
fuertemente acoplados — la app web importa tipos y el ABI desde `shared`, que se genera
desde `contracts`. Mantenerlos juntos significa un `git clone`, una instalación de dependencias, un
solo lugar para correr todos los builds y tests, y commits atómicos que cambian el contrato y la UI
en conjunto.

Dos herramientas hacen esto agradable:

- **workspaces de pnpm** — instala las dependencias de todos los paquetes una vez, enlaza los paquetes
  locales entre sí (así `@nftickets/web` puede hacer `import` de `@nftickets/shared` como si estuviera
  publicado), y de-duplica las dependencias compartidas para ahorrar disco.
- **turborepo** — corre scripts (`build`, `test`, …) a través de los paquetes en el orden correcto y
  cachea resultados, así los paquetes sin cambios no se reconstruyen.

## La estructura del workspace

```
nftickets-chile/
├── package.json            # raíz: herramientas de dev + scripts de turbo
├── pnpm-workspace.yaml      # qué carpetas son paquetes del workspace
├── turbo.json               # pipelines de tareas y reglas de caché
├── tsconfig.base.json       # opciones de TS que extiende cada paquete
├── .prettierrc.json / .prettierignore
├── .gitignore
├── packages/
│   ├── contracts/           # Foundry (Solidity) — no es un paquete Node por naturaleza
│   ├── shared/              # librería TypeScript
│   └── subgraph/            # proyecto de The Graph
└── apps/
    └── web/                 # app Next.js
```

`packages/*` y `apps/*` son los globs del workspace. La división `packages` vs `apps` es una
convención común: `apps` son productos finales desplegables, `packages` son librerías/servicios que
ellos usan.

## Archivos raíz, explicados

### `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Le dice a pnpm qué directorios son miembros del workspace. Cualquier carpeta con un `package.json` bajo
estos globs se vuelve enlazable por nombre.

### `package.json` (raíz)

Campos clave:

- `"private": true` — la raíz nunca se publica en npm.
- `"packageManager": "pnpm@9.15.0"` — fija la versión del gestor de paquetes para todos.
- `scripts` — envoltorios delgados que delegan en turbo, por ejemplo `"build": "turbo run build"`. Así
  `pnpm build` en la raíz corre `build` en todos los paquetes que lo definen.
- `devDependencies` — herramientas compartidas por todo el repo: `turbo`, `prettier`, `typescript`.

### `turbo.json`

Define **tareas** y cómo se relacionan:

```jsonc
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"], // compila primero mis dependencias
      "outputs": ["dist/**", ".next/**", "out/**", "build/**", "generated/**"],
    },
    "test": { "dependsOn": ["^build"], "outputs": [] },
    "lint": { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
  },
}
```

- `dependsOn: ["^build"]` — el `^` significa "la tarea `build` de mis _dependencias_." Así que antes de
  que `web` haga build o test, `shared` compila primero. Así es como turbo ordena el trabajo correctamente.
- `outputs` — qué archivos produce una tarea. Turbo los cachea; si los inputs no cambiaron, restaura
  el caché y omite el trabajo (verás `>>> FULL TURBO`). Las tareas que no producen archivos
  (nuestros scripts `echo` placeholder) simplemente tienen `outputs: []`.

### `tsconfig.base.json`

Las opciones de TypeScript que cada paquete hereda vía `"extends": "../../tsconfig.base.json"`.
Elecciones destacables:

- `"strict": true` y `"noUncheckedIndexedAccess": true` — máxima seguridad de tipos; el acceso por
  índice a arrays/objetos se tipa como posiblemente `undefined`, atrapando toda una clase de bugs.
- `"moduleResolution": "Bundler"` y `"verbatimModuleSyntax": true` — resolución moderna que
  coincide con cómo los bundlers (Next.js, Vite) resuelven realmente los imports.
- `"isolatedModules": true` — asegura que cada archivo pueda transpilarse de forma independiente
  (requerido por los bundlers rápidos).

Cada paquete agrega solo lo que le es específico (su `outDir`, `rootDir`, `include`).

### `.prettierrc.json` / `.prettierignore`

Reglas de formato para todo el repo, para que el editor de cada colaborador produzca código idéntico.
El archivo de ignore mantiene a Prettier lejos de la salida generada y de la carpeta `lib` de Foundry.

### `.gitignore`

Excluye dependencias (`node_modules`), salida de build (`dist`, `.next`, `out`/`cache`
/`broadcast`/`lib` de Foundry), el caché de turbo, y — importante — secretos (`.env*`, `*.key`). Nunca
commitees claves de API reales.

## Los placeholders de paquete

Cada paquete tiene un `package.json` con scripts `build`/`test`/`lint` para que turbo pueda verlo, incluso
antes de que exista el código real:

- **`shared`** ya es una librería TypeScript real (diminuta): su `build` corre `tsc` y
  compila `src/index.ts`. Esto demuestra que la toolchain de TS funciona de punta a punta.
- **`contracts`, `subgraph`, `web`** actualmente tienen placeholders `echo … && exit 0` que
  anuncian cuál tarea los completará. Esto permite que `pnpm build` tenga éxito en todo el repo
  hoy, y cada uno se reemplaza con tooling real en su fase (Foundry, The Graph, Next.js).

Este enfoque de "todo corre en verde, aunque algunos pasos sean no-ops" significa que el pipeline está
siempre funcionando; encendemos el comportamiento real paquete por paquete.

## Cómo correrlo

```bash
pnpm install     # enlaza paquetes + instala herramientas de dev de la raíz
pnpm build       # turbo compila todos los paquetes (shared compila, los otros son no-op)
pnpm lint
pnpm typecheck
```

Resultado esperado hoy: **todas las tareas tienen éxito**. `shared` efectivamente compila con `tsc`; los otros
tres imprimen su mensaje placeholder. En una segunda corrida sin cambios, turbo imprime
`>>> FULL TURBO` y termina en milisegundos gracias al caché.

## Notas de entorno (esta máquina)

- pnpm se instaló en un **prefijo npm local del usuario** (`~/.npm-global`) para evitar escribir en
  directorios del sistema. Agrega `export PATH="$HOME/.npm-global/bin:$PATH"` a tu `~/.zshrc` para que
  `pnpm` siempre se encuentre.
- Este zsh tiene el autocorrector activado, que intenta "corregir" `pnpm` → `npm`. Ejecuta `unsetopt correct`
  (o agrégalo a `~/.zshrc`) si se te pregunta.
- **Foundry** (`forge`) no está instalado aún; se necesita a partir de la Tarea 2. Ver el README
  para el comando de instalación.

Lo que sigue (Tarea 2): el proyecto Foundry y la primera versión de `EventTicketing.sol`, documentado
en `04-smart-contracts.md`.
