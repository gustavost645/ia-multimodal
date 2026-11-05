# Benoit Casa Viva — Simulador de Ambientes com IA

Visualizador de móveis e eletrodomésticos da Benoit no ambiente real do usuário, usando IA multimodal (Gemini).

## Rodando localmente

**Pré-requisitos:** Node.js 20+, pnpm (`npm install -g pnpm`) e uma chave da API Gemini.

1. Instale as dependências:
   `pnpm install`
2. Copie `.env.example` para `.env` e preencha `GEMINI_API_KEY`.
3. Inicie o servidor de desenvolvimento:
   `pnpm dev` → http://localhost:3000

Outros comandos: `pnpm build` (build de produção), `pnpm start` (servir o build), `pnpm lint`.

## Observações

- Se a chamada ao Gemini falhar (cota esgotada, modelo sobrecarregado), a rota `/api/room/analyze`
  retorna uma análise padrão com `"fallback": true` e o erro aparece no log do servidor.
- O plano gratuito do Gemini tem limite diário de requisições; use `GEMINI_FALLBACK_MODELS`
  ou habilite faturamento para uso contínuo.
