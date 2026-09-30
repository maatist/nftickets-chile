# 01 — Visión General del Proyecto

## El problema

Comprar entradas para eventos hoy tiene tres problemas crónicos:

1. **Reventa abusiva (scalping).** Los bots compran entradas al por mayor y las revenden a precios
   inflados en mercados secundarios. Los fans pagan mucho más que el valor nominal.
2. **Fraude.** Las entradas en papel y PDF se copian trivialmente. Una captura de pantalla de un
   código QR puede reenviarse a muchas personas, y el recinto no puede saber cuál es la "real".
3. **Comisiones altas de intermediarios.** Las plataformas centralizadas se ubican entre los
   organizadores y los fans y se llevan una tajada grande tanto en la venta primaria como en cada
   reventa.

## La idea

Representar cada entrada como un **NFT** (un token de blockchain) en lugar de un PDF. Como el token
vive en un libro mayor público, cualquiera puede verificar la propiedad, y el _propio contrato_ puede
hacer cumplir reglas que un PDF nunca podría:

- **Topar los precios de reventa en el código.** El smart contract rechaza cualquier reventa por sobre
  un máximo que fija el organizador. Revender por encima de ese precio se vuelve imposible, no solo
  desalentado.
- **Hacer las entradas infalsificables.** El ingreso usa una firma que solo el dueño de la entrada
  puede producir, y la firma cambia cada minuto — así una captura reenviada es inútil.
- **Eliminar al intermediario.** El organizador vende directamente a los fans; el contrato dirige el
  dinero y no hay una plataforma llevándose una tajada en cada paso.

## Por qué estas tecnologías específicas

| Objetivo                              | Tecnología                                   | Por qué                                                                                                       |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Múltiples tipos de entrada en un contrato | **ERC-1155**                                 | Un contrato gestiona muchos tipos de token (General/VIP/Early Bird) con minting por lotes eficiente.          |
| Seguir entradas individuales          | **Seguimiento de serial**                    | Las unidades ERC-1155 son fungibles; agregamos un número de serie por entrada para poder marcar cada una como "usada". |
| Frenar el abuso en reventa            | **hook de transferencia `_update` + `resellTicket`** | Bloquea las transferencias libres y fuerza la reventa a través de una función que verifica el tope de precio.  |
| Registro sin fricción y sin comisiones de gas | **ERC-4337 Account Abstraction + Privy**     | Los usuarios inician sesión con Google/email y nunca ven una wallet ni una comisión de gas.                   |
| Ingreso no capturable por screenshot  | **QR dinámico EIP-712**                      | El QR codifica una firma sobre un timestamp fresco; expira en segundos.                                       |
| Lecturas rápidas para la UI           | **The Graph (subgraph)**                     | Leer directamente de la cadena es lento; el subgraph indexa eventos y sirve GraphQL.                          |
| Almacenar imágenes/metadata           | **IPFS (Pinata)**                            | Almacenamiento descentralizado para el arte y la metadata de los NFT.                                         |

## Qué es realmente "una entrada" aquí

Una entrada se identifica por tres números: **`(eventId, tier, serial)`**.

- `eventId` — cuál evento (por ejemplo, "Lollapalooza 2026").
- `tier` — cuál categoría dentro de ese evento (0 = General, 1 = VIP, …).
- `serial` — el número correlativo de esa entrada específica dentro de su tier (0, 1, 2, …).

Cuando compras, el contrato te acuña una unidad ERC-1155 _y_ te asigna el siguiente serial para
ese tier, registrando que eres su dueño. En el ingreso, la app del personal verifica el dueño de ese
serial y lo marca como usado para que no pueda reutilizarse.

## Las cuatro fases de construcción

1. **Fase 1 — Smart Contracts (Foundry).** El contrato `EventTicketing.sol` y una suite de tests
   completa que cubre uso normal, casos límite e intentos de exploit.
2. **Fase 2 — Subgraph y Almacenamiento.** Indexar eventos del contrato para la UI; subir metadata a IPFS.
3. **Fase 3 — Frontend y Autenticación.** La app Next.js, login social, compras sin gas.
4. **Fase 4 — Scanner y Verificación Off-chain.** La app de ingreso que lee el QR, verifica la
   firma y llama al contrato para validar el acceso.

## Decisiones clave de diseño (y su razonamiento)

- **Serial por `(eventId, tier)`**, no por evento, para que cada serial quede atado a su tier y el
  QR/validación sean específicos por tier (no puedes usar un serial General en el ingreso VIP).
- **La reventa es obligatoriamente on-chain.** Un contrato no puede ver el precio de una venta
  off-chain, así que la _única_ forma de hacer cumplir un tope de precio es bloquear las transferencias
  libres y hacer de la función oficial `resellTicket` la única ruta de transferencia.
- **Pagos nativos + ERC-20 por tier.** Cada tier elige su activo de liquidación (ETH o, digamos,
  USDC), configurado al crear el tier.
- **Todo lo externo se mockea primero.** Privy, Pinata y The Graph están cada uno detrás de una
  interfaz con un mock. Construimos y probamos toda la app localmente, luego conectamos los servicios
  reales cambiando una variable de entorno — sin reescribir código.

Siguiente: **[02-architecture.md](./02-architecture.md)** para ver cómo encajan las piezas.
