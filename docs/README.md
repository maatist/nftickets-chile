# Docs de Estudio — NFTickets Chile

Bienvenido. Estos docs explican **cómo funciona todo el sistema** para que puedas estudiarlo de
punta a punta. Están escritos para leerse en orden, pero cada uno se sostiene por sí solo.

## Orden de lectura

1. **[01-overview.md](./01-overview.md)** — Qué estamos construyendo y por qué. El problema
   (reventa abusiva, fraude, comisiones) y cómo los primitivos Web3 lo resuelven. Las cuatro fases
   de un vistazo.
2. **[02-architecture.md](./02-architecture.md)** — El panorama general: monorepo, on-chain vs
   off-chain, cómo una entrada fluye desde su creación hasta la validación en el ingreso. Diagrama de
   componentes.
3. **[03-monorepo.md](./03-monorepo.md)** — La base sobre la que estás parado ahora mismo:
   workspaces de pnpm, pipelines de turborepo, configuración de proyectos TypeScript, y cada archivo de
   configuración raíz explicado línea por línea.
4. **04-smart-contracts.md** — _(agregado en la Tarea 2+)_ El contrato `EventTicketing.sol`:
   ERC-1155, seguimiento de serial, aplicación de transferencias anti-reventa, reventa, validación.
5. **05-shared-and-eip712.md** — _(agregado en la Tarea 7)_ El paquete shared y cómo funciona la
   firma/verificación del QR dinámico con EIP-712.
6. **06-frontend.md** — _(agregado en la Tarea 8+)_ App Next.js, abstracciones de proveedor, Account
   Abstraction, PWA.
7. **07-subgraph.md** — _(agregado en la Tarea 12)_ Indexación de eventos del contrato sobre GraphQL.

## Glosario (referencia rápida)

- **dApp** — aplicación descentralizada; un frontend que se comunica con smart contracts.
- **ERC-1155** — un estándar de token donde un contrato gestiona muchos tipos de token; eficiente para
  los tiers de entradas (General, VIP, Early Bird).
- **Tier** — una categoría de entrada dentro de un evento, con su propio precio, oferta y tope de reventa.
- **Serial** — un número correlativo por `(eventId, tier)` asignado a cada entrada en la compra, de modo
  que se pueda hacer seguimiento de cada entrada individual aunque las unidades ERC-1155 sean por lo
  demás fungibles.
- **EIP-712** — un estándar para firmar datos estructurados (tipados) off-chain; usado para el QR.
- **ERC-4337 / Account Abstraction (AA)** — permite que los usuarios tengan wallets de smart contract y
  no paguen gas (un "paymaster" lo patrocina), habilitando una experiencia tipo Web2.
- **Paymaster** — el componente ERC-4337 que paga el gas en nombre del usuario.
- **Subgraph** — un servicio (The Graph) que indexa eventos de la blockchain y los sirve vía GraphQL
  para que la UI lea los datos rápidamente.
- **IPFS** — almacenamiento de archivos descentralizado; aquí guarda las imágenes de los eventos y la
  metadata de los NFT.
- **Abstracción de proveedor** — una interfaz (`AuthProvider`, `StorageProvider`, `DataProvider`)
  con una implementación mock ahora y un servicio real después, intercambiada por un flag de entorno.
- **Base Sepolia** — la testnet L2 de Ethereum a la que desplegamos.

## Dónde vive la especificación formal

Estos docs de estudio son la explicación amigable. La especificación autoritativa (requisitos en
formato EARS, decisiones de diseño y la lista de tareas) está en
[`.kiro/specs/web3-ticketing-platform/`](../.kiro/specs/web3-ticketing-platform/).
