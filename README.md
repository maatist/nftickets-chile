# NFTickets Chile — Plataforma de Ticketing de Eventos Web3

Una dApp descentralizada de venta de entradas para eventos que combate la reventa abusiva, el fraude y las comisiones altas usando:

- **Entradas ERC-1155** con seguimiento de serial por `(eventId, tier)` (identidad individual de cada entrada).
- **Topes de reventa on-chain** — las transferencias directas están bloqueadas; la reventa se fuerza a través de `resellTicket` con un precio máximo.
- **Experiencia tipo Web2** — login social + transacciones sin gas mediante Account Abstraction (ERC-4337).
- **Ingreso con QR dinámico** — firmas EIP-712 sensibles al tiempo que anulan las capturas de pantalla.
- **Indexación con subgraph** sobre GraphQL para lecturas rápidas.

El proyecto es un **monorepo con pnpm + turborepo**. Los servicios externos (Privy, un paymaster,
Pinata, The Graph) están detrás de **interfaces de proveedor** con implementaciones mock, así que
toda la app corre localmente sin credenciales y los servicios reales se conectan mediante flags de
entorno — sin cambios en el código consumidor. Objetivo de despliegue: **Base Sepolia** (testnet).

> ¿Nuevo en la arquitectura? Los docs de estudio están en [`docs/`](./docs/README.md). La
> especificación completa está en [`.kiro/specs/web3-ticketing-platform/`](./.kiro/specs/web3-ticketing-platform/).

## Estructura del repositorio

```
nftickets-chile/
├── package.json             # raíz del workspace pnpm + scripts de turbo
├── pnpm-workspace.yaml       # globs del workspace
├── turbo.json                # pipelines de build/test/lint/typecheck
├── tsconfig.base.json        # opciones compartidas del compilador de TS
├── docs/                     # documentación de estudio
├── packages/
│   ├── contracts/            # Foundry — EventTicketing.sol (ERC-1155 + reventa/gate/withdraw)
│   ├── shared/               # tipos TS, ABI generado, helpers de firma/verificación EIP-712
│   └── subgraph/             # subgraph de The Graph (schema, mappings, GraphQL)
└── apps/
    └── web/                  # Next.js App Router + Tailwind + PWA + abstracciones de proveedor
```

## Requisitos previos

| Herramienta              | Versión | Necesaria para                                    |
| ------------------------ | ------- | ------------------------------------------------- |
| **Node.js**              | ≥ 20    | todo                                              |
| **pnpm**                 | 9.x     | el gestor de paquetes del monorepo                |
| **Foundry** (`forge`)    | latest  | build/test/deploy de `packages/contracts`         |
| **graph-cli**            | incluido | `packages/subgraph` (instalado como dependencia, sin instalación global) |
| **navegadores Playwright**  | latest  | el test E2E de la web (`npx playwright install`)        |

### Instalar pnpm

Si `pnpm` no está en tu `PATH`, instálalo y expón el directorio bin global de npm:

```bash
npm install -g pnpm
export PATH="$(npm config get prefix)/bin:$PATH"   # agrégalo a ~/.zshrc / ~/.bashrc
```

### Instalar Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
export PATH="$HOME/.foundry/bin:$PATH"              # agrégalo al perfil de tu shell
```

## Instalación y primer build

Desde la raíz del repo:

```bash
pnpm install                 # instala todas las dependencias del workspace
pnpm build                   # turbo run build en todos los paquetes
```

`pnpm build` ejecuta, en orden de dependencias: `forge build` (contracts) → exporta el ABI →
`tsc` (shared) → `graph codegen && graph build` (subgraph) → `next build` (web).

## Comandos comunes

Ejecuta desde la raíz del repo:

```bash
pnpm build           # turbo run build en todos los paquetes
pnpm test            # turbo run test
pnpm lint            # turbo run lint
pnpm typecheck       # turbo run typecheck
pnpm format          # prettier --write en todo el repo
pnpm turbo run build lint test   # el gate completo de CI en un solo comando
```

Apunta a un solo paquete con el filtro de turbo:

```bash
pnpm build --filter @nftickets/shared
pnpm test  --filter @nftickets/web
```

### Scripts por paquete

| Paquete                | build                       | test                                  | lint               |
| ---------------------- | --------------------------- | ------------------------------------- | ------------------ |
| `@nftickets/contracts` | `forge build`               | `forge test`                          | `forge fmt --check`|
| `@nftickets/shared`    | `tsc`                       | `vitest run`                          | (n/a)              |
| `@nftickets/subgraph`  | `graph codegen && graph build` | `graph test` (matchstick, ver nota) | (verificado por tipos vía build) |
| `@nftickets/web`       | `next build`                | `vitest run`                          | `next lint`        |

## Correr la app web localmente (sobre mocks)

Los valores por defecto de `.env` seleccionan los proveedores **mock**, así que no se requiere nada externo:

```bash
cd apps/web
cp .env.example .env          # los valores por defecto ya seleccionan los proveedores mock
pnpm dev                      # http://localhost:3000
```

Luego recorre el flujo completo:

1. **`/`** — el feed de descubrimiento muestra los eventos precargados.
2. **`/organizer`** — analíticas por evento (ventas + validaciones de acceso); **New event** abre el
   modal de creación (sube imagen + metadata vía el `StorageProvider` mock, luego llama a
   `createEvent` / `addTier` vía el `AuthProvider` mock).
3. **`/tickets`** — haz clic en **Log in**; el signer mock es la cuenta #0 de Anvil, que además es la
   dueña de las entradas precargadas, así que las entradas aparecen. Abre una para ver el
   **QR dinámico EIP-712** (se refresca con un temporizador).
4. **`/scan`** — la vista del Gatekeeper. Verifica localmente la firma + vigencia de un QR, revisa el
   estado on-chain y valida. Sin cámara degrada a un estado claro de "cámara no disponible";
   el pipeline de verificación está completamente cubierto por tests unitarios.

### Test end-to-end del camino feliz

Un test de Playwright recorre el flujo anterior sobre mocks:

```bash
cd apps/web
npx playwright install chromium    # una sola vez: descarga el binario del navegador
pnpm e2e                           # compila + arranca la app y corre el test
```

> El test E2E se mantiene deliberadamente fuera del script `test` de vitest (ver `include` en
> `vitest.config.ts`), así que `pnpm test` / `turbo run test` nunca lo toma. Si el binario del
> navegador de Playwright no se puede descargar en un entorno restringido, `pnpm e2e` reportará un
> navegador faltante — instálalo en una máquina con acceso a red para correr el test.

## Conectar servicios reales

Cada dependencia externa está detrás de una interfaz con una factory determinada por un flag de entorno
(`apps/web/src/providers/{auth,data,storage}`). Los consumidores solo llaman a
`getAuthProvider()` / `getDataProvider()` / `getStorageProvider()`, así que cada cambio de abajo es un
**cambio de configuración más un archivo de implementación** — sin editar consumidores.

Todas las variables de entorno de la web están documentadas en [`apps/web/.env.example`](./apps/web/.env.example).

### 1. Privy + paymaster (auth sin gas)

Reemplaza el signer mock de cuenta local con login social + transacciones patrocinadas ERC-4337.

```bash
# apps/web/.env
NEXT_PUBLIC_AUTH_PROVIDER=privy
NEXT_PUBLIC_PRIVY_APP_ID=<your-privy-app-id>
NEXT_PUBLIC_PAYMASTER_URL=<your-paymaster-rpc-url>
```

Punto de conexión: implementa un `PrivyAuthProvider` contra la interfaz `AuthProvider`
(`src/providers/auth/types.ts`) y agrega un `case "privy"` en `src/providers/auth/factory.ts`.
Hoy ese case lanza un error con un puntero a este paso.

### 2. Pinata (almacenamiento IPFS)

Reemplaza el uploader mock en memoria con pinning IPFS real para imágenes de eventos + metadata.

```bash
# apps/web/.env
NEXT_PUBLIC_STORAGE_PROVIDER=pinata
NEXT_PUBLIC_PINATA_JWT=<your-pinata-jwt>
```

Punto de conexión: implementa un `PinataStorageProvider` contra la interfaz `StorageProvider`
(`src/providers/storage/types.ts`) y agrega un `case "pinata"` en
`src/providers/storage/factory.ts` (actualmente lanza un error con un puntero aquí).

### 3. Subgraph desplegado (lecturas GraphQL)

Reemplaza las lecturas mock basadas en fixtures con datos indexados en vivo. El proveedor GraphQL ya
está implementado; solo debes entregar el endpoint.

```bash
# apps/web/.env
NEXT_PUBLIC_DATA_PROVIDER=subgraph
NEXT_PUBLIC_SUBGRAPH_URL=<your-subgraph-graphql-endpoint>
```

### 4. Desplegar el contrato (Base Sepolia)

El subgraph y la app apuntan ambos a una dirección de `EventTicketing` desplegada.

```bash
cd packages/contracts
cp .env.example .env          # completa PRIVATE_KEY, BASE_SEPOLIA_RPC_URL, BASESCAN_API_KEY, TICKET_BASE_URI
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast --verify \
  --etherscan-api-key "$BASESCAN_API_KEY"
```

Luego conecta el despliegue con el resto del repo:

- Registra la dirección en `addresses` de `packages/shared` (mapa por red consumido por la app).
- En `packages/subgraph/subgraph.yaml`, reemplaza el `source.address` placeholder
  (`0x0000…0000`) y `startBlock: 0` con la dirección desplegada y su bloque de creación, luego
  `pnpm --filter @nftickets/subgraph run build` y despliega el subgraph (`graph deploy`).
  Ver [`packages/subgraph/.env.example`](./packages/subgraph/.env.example) para las variables de despliegue.

## Archivos `.env.example`

| Paquete                | Archivo                          | Propósito                                                      |
| ---------------------- | -------------------------------- | -------------------------------------------------------------- |
| `apps/web`             | `apps/web/.env.example`          | flags de proveedor + Privy/paymaster, Pinata, URL del subgraph |
| `packages/contracts`   | `packages/contracts/.env.example`| clave de despliegue, RPC de Base Sepolia, clave de BaseScan, base URI de entradas |
| `packages/subgraph`    | `packages/subgraph/.env.example` | despliegue del subgraph: red, dirección del contrato, bloque de inicio, clave de despliegue |
| `packages/shared`      | —                                | ninguno requerido (librería TS pura: tipos, ABI, helpers EIP-712) |

## Fases de build y estado

| Fase                       | Paquete(s)           | Tarea(s) | Estado  |
| -------------------------- | -------------------- | -------- | ------- |
| Bootstrap                  | monorepo raíz        | 1        | ✅ Listo |
| 1 — Smart contracts        | `contracts`          | 2–6      | ✅ Listo |
| 2 — Shared + Subgraph      | `shared`, `subgraph` | 7, 12    | ✅ Listo |
| 3 — Frontend y Auth        | `web`                | 8, 9, 11 | ✅ Listo |
| 4 — Scanner y verificación | `web`                | 10       | ✅ Listo |
| Integración y docs         | todos                | 13       | ✅ Listo |

## Notas de entorno (qué corre aquí vs. qué necesita un host específico)

- **`forge` debe estar en el `PATH`** (`export PATH="$HOME/.foundry/bin:$PATH"`) para que el
  build/test/lint de los contratos corra bajo turbo.
- **El `graph test` (matchstick) del subgraph** no puede ejecutarse en algunos hosts Linux de
  rolling-release / no-Ubuntu: la detección de plataforma de graph-cli los rechaza, y el binario
  precompilado de matchstick enlaza `libpq.so.5`. El script `test` (`scripts/run-tests.mjs`) intenta
  matchstick y, ante esa limitación específica, **omite con un aviso claro y sale con código 0** para
  que el pipeline global siga en verde — mientras los tests de mapping igual **compilan** como parte de
  `graph build`. En un host soportado (Ubuntu 20/22 con `postgresql`/`libpq`) se ejecutan normalmente.
  Define `SUBGRAPH_TEST_STRICT=1` para convertir la omisión en un fallo duro.
- **Los navegadores de Playwright** deben descargarse una vez (`npx playwright install chromium`) antes
  de poder correr `pnpm e2e`.
