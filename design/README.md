# Referência visual

Cópia local do projeto do Claude Design "Legendary software UI mockups":
https://claude.ai/design/p/176db64f-20f3-4236-b34e-22baf21ccdf1?file=Legendary+Mockups.dc.html

- `Legendary Mockups.dc.html` é o mockup, com os frames 1a a 1j e 2a a 2e.
- `support.js` é o runtime genérico do Claude Design. O app não depende dele.
- `reference/` guarda um PNG de cada frame, usado por `make test-visual`.

Toda mudança de UI deve ser conferida contra o mockup. O Claude Design standalone fecha até
14/12/2026, então esta cópia é a referência depois dessa data.

Para regenerar os PNGs a partir desta cópia: `pnpm --filter desktop design:capture`.
