# AI Founder OS - Informe Ejecutivo Tecnico (Arquitectura y PM)

Fecha: 2026-03-21
Proyecto: AI Founder OS
Fase: MVP Day 1 + Estabilizacion E2E

## 1. Resumen Ejecutivo

El backend del MVP esta funcional para demo E2E con Notion como capa de entrada/salida y Gemini como proveedor LLM.

Estado actual:
- Flujo E2E validado en ejecucion real.
- Escritura en las 3 bases de salida validada.
- Idempotencia basica validada en re-ejecucion (sin duplicados).
- Poller funcional por intervalo.
- Endpoint de salud operativo.

Limitante actual relevante:
- Gemini puede responder 429 por cuota. El sistema ya tiene fallback para evitar caida completa del workflow.

## 2. Objetivo de la Fase y Cobertura

Objetivo de fase:
- Tener un MVP estable, demo-friendly, sin webhooks, con trigger por Status Run y procesamiento por poller.

Cobertura alcanzada:
- Trigger por Status Run o Queued en Startup Ideas.
- Procesamiento secuencial de una idea por vez.
- Orquestacion Analyzer -> Research -> Product -> Marketing.
- Actualizacion de estado Running, Done, Failed.
- Upsert en DBs de salida.
- Logs operativos con timestamps.

## 3. Arquitectura Implementada

### 3.1 Backend y Entrada

- Servidor Express en [server/index.js](server/index.js)
- Ruta de salud en [server/routes/health.js](server/routes/health.js)
- Configuracion y validacion de entorno en [server/config/env.js](server/config/env.js)

### 3.2 Orquestacion

- Poller en [server/orchestrator/poller.js](server/orchestrator/poller.js)
- Motor de workflow en [server/orchestrator/workflowEngine.js](server/orchestrator/workflowEngine.js)

### 3.3 Servicios

- Integracion Notion y capa de mapeo adaptativa en [server/services/notionService.js](server/services/notionService.js)
- Wrapper Gemini con reintentos y validacion JSON en [server/services/geminiService.js](server/services/geminiService.js)

### 3.4 Agentes y Contratos

- Idea Analyzer en [server/agents/ideaAnalyzer.js](server/agents/ideaAnalyzer.js)
- Market Research en [server/agents/marketResearch.js](server/agents/marketResearch.js)
- Product Planner en [server/agents/productPlanner.js](server/agents/productPlanner.js)
- Marketing Agent en [server/agents/marketingAgent.js](server/agents/marketingAgent.js)
- Schemas Zod en [server/schemas/ideaAnalysis.schema.js](server/schemas/ideaAnalysis.schema.js), [server/schemas/competitor.schema.js](server/schemas/competitor.schema.js), [server/schemas/roadmap.schema.js](server/schemas/roadmap.schema.js), [server/schemas/marketing.schema.js](server/schemas/marketing.schema.js)

### 3.5 Utilidades Operativas

- Inspector de esquemas de Notion en [server/scripts/inspectNotionSchemas.js](server/scripts/inspectNotionSchemas.js)
- Ejecucion de workflow one-shot para prueba controlada en [server/scripts/runWorkflowOnce.js](server/scripts/runWorkflowOnce.js)

## 4. Hallazgos de Integracion con Notion (Causa-Raiz de Errores)

Problemas detectados en pruebas reales:
- El campo Status en Startup Ideas es multi_select (no status).
- Algunas propiedades asumidas por codigo no existen en tu schema (ejemplo: Run Log).
- En Notion API v5, algunos entornos usan dataSources y no databases para query.
- Nombres reales de columnas en DBs de salida no coincidian con hardcode inicial.

Correcciones aplicadas:
- Deteccion dinamica de propiedad de estado con soporte status, select y multi_select.
- Lectura de propiedades desde database o data source segun disponibilidad.
- Escritura tolerante a propiedades opcionales ausentes.
- Mapeo por aliases y tipo de propiedad para adaptarse a schema real.
- Upsert idempotente con fallback cuando no existe campo Key.

## 5. Estado de Pruebas de Funcionamiento

### 5.1 Smoke tests

- Arranque con entorno invalido: falla correctamente con mensaje claro.
- Endpoint health: responde OK.

### 5.2 Pruebas E2E reales

Base de idea probada:
- Idea page id: 32a5a456-63bd-8094-9764-c568e97a8233

Resultado de corrida:
- Estado final de idea: Done
- Outputs creados o actualizados:
  - Competitors: 2
  - Roadmap: 3
  - Marketing: 3

Re-ejecucion idempotente:
- Conteos se mantuvieron estables (2, 3, 3)
- Sin duplicados detectados

### 5.3 Comportamiento ante cuota Gemini

- Se observaron respuestas 429 RESOURCE_EXHAUSTED.
- El sistema realiza reintentos y aplica fallback en Idea Analyzer.
- El workflow completo sigue y finaliza.

## 6. Estado de Git y Entregables

Ultimos commits ya en main:
- 87c2390 chore(security): sanitize env example and remove real credentials
- 20b9ff1 chore(reliability): harden env validation for placeholders and notion db ids
- 3f9d908 docs(readme): add setup env and demo runbook
- bd246f3 feat(workflow): add poller orchestrator agents schemas and prompts
- c2017c6 feat(services): add notion upsert layer and gemini json wrapper
- 52eac9b chore(bootstrap): setup express entrypoint env validation and health route

Cambios locales pendientes al momento de este informe:
- [server/services/notionService.js](server/services/notionService.js)
- [server/agents/ideaAnalyzer.js](server/agents/ideaAnalyzer.js)
- [package.json](package.json)
- [.env.example](.env.example)
- [server/scripts/inspectNotionSchemas.js](server/scripts/inspectNotionSchemas.js) (nuevo)

## 7. Riesgos y Mitigaciones

Riesgo 1: Cuota de Gemini agotada
- Impacto: riesgo de fallas en analisis LLM.
- Mitigacion aplicada: fallback deterministico en analyzer + continuidad del workflow.

Riesgo 2: Deriva de schema en Notion
- Impacto: fallas de escritura por nombres o tipos de propiedades.
- Mitigacion aplicada: mapeo dinamico por aliases y tipos, no hardcode estricto.

Riesgo 3: Diferencias API Notion database vs data source
- Impacto: query/create incompatibles por version/tenant.
- Mitigacion aplicada: capa de compatibilidad con fallback.

## 8. Recomendacion de Cierre de Fase

Para cerrar formalmente esta fase y pasar a siguiente:
- Congelar los cambios locales pendientes con commits por etapa.
- Ejecutar una ultima prueba por poller puro Run -> Running -> Done en ventana controlada.
- Documentar en README la estrategia de fallback por cuota Gemini para demo.

## 9. Decision PM sugerida

Decision recomendada: GO con condicion.

Condicion de salida:
- Confirmar una corrida final por poller puro en entorno de demo.
- Luego consolidar commits pendientes y push.

Con esa condicion cumplida, el MVP queda listo para demostracion funcional dentro del alcance definido.
