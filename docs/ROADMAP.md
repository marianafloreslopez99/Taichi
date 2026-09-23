# Roadmap

| Fase | Objetivo                          | Trabajo pendiente                                                                                                                                |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Frontend y mocks                  | Entregado: rutinas, sesión, pregunta, resumen, documentación y pruebas.                                                                          |
| 2    | Backend real                      | Implementada: Express, MySQL administrado, Prisma, API REST `/api/v1`, validación, sesiones anónimas persistentes, seed y autenticación interna. |
| 3    | STT real                          | Captura consentida, permiso de micrófono, subida segura, cancelación y errores.                                                                  |
| 4    | LLM real                          | Implementada: Gemini Interactions API, proxy backend, contexto validado, timeout, límite y política segura.                                      |
| 5    | TTS real                          | Audio por streaming o archivo, controles de reproducción, cache y fallback textual.                                                              |
| 6    | Usuarios e historial              | Cuentas, historial, reanudación, exportación/eliminación de datos.                                                                               |
| 7    | Pose estimation con cámara        | Investigación de privacidad, consentimiento y procesamiento local/remoto.                                                                        |
| 8    | Correcciones asistidas por visión | Validación con profesionales, evaluación de seguridad y mensajes no médicos.                                                                     |

TODO de integración: reemplazar `MockSpeechToTextAdapter` y `MockTextToSpeechAdapter`, y crear cuentas e historial visible. La API actual está versionada bajo `/api/v1`, usa MySQL mediante Prisma y mantiene Gemini detrás de `AIQuestionService`. Las fases 7–8 requieren investigación y pruebas de precisión antes de recomendar ajustes posturales.
