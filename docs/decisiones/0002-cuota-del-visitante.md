# 0002. Diseñar para la cuota del plan gratuito

Fecha: 2026-10-04. Estado: vigente.

## Contexto

Cada consulta sale de la cuota del visitante (ver 0001). El plan gratuito de Argentina Data trae
20 consultas por día. Se evaluó eximir a las tools `siia_*` de la cuota o subir el tier gratis, y se
descartó: lo primero regala cuota y el ejemplo dejaría de enseñar a trabajar con el límite; lo segundo
es una decisión comercial que afecta a todos los usuarios.

## Decisión

El sitio gasta lo mínimo:

- **Cada sección carga recién cuando se abre.** Abrir el informe cuesta 3 consultas (campañas
  disponibles y dos balances); ranking, evolución y mapa cuestan una cada una.
- **No se repite una consulta dentro de una visita.** El cliente guarda en memoria la respuesta de
  cada combinación de tool y argumentos; volver a un cultivo ya visto no cuesta nada. No es un caché de
  datos: muere al recargar la página y nunca se guarda en el navegador.
- **No se reintenta nada que el MCP haya contestado.** Sólo las fallas de red (sin respuesta) se
  reintentan, hasta dos veces.
- **Se muestra la cuota restante** con `consultar_cuota`, que no consume cuota.
- **La cuota agotada se explica.** El MCP la devuelve como HTTP 200 con `isError` y
  `structuredContent.error = "quota_exceeded"`; el sitio la distingue de un error y muestra cuándo se
  renueva, con un link a los planes. Lo que ya se cargó sigue a la vista.
