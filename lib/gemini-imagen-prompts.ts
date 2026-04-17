/** Prompts por defecto para Herramientas › imágenes Gemini 3.1 Flash Image. */

export const PROMPT_IMAGEN_PRODUCTO_GEMINI_DEFAULT = `Editá esta imagen como fotografía de catálogo para e-commerce.

Reglas estrictas:
- No modifiques el producto: misma forma, colores, textos de etiqueta, logos y proporciones reales del empaque o artículo.
- Fondo blanco puro (#FFFFFF), sin gradientes ni texturas.
- Centrá el producto en el encuadre; que ocupe aproximadamente el 18% del área total de la imagen (mucho espacio en blanco alrededor, típico de packshot).
- Sombra suave y realista proyectada bajo el producto (contacto con el “suelo” blanco), sin sombras duras.
- Formato cuadrado 1:1, nitidez comercial, iluminación de estudio pareja.
- Salida pensada para uso web de alta calidad (equivalente a ~1200 px de lado útil).

No añadas personas, manos, props ni texto nuevo en la imagen.`;

export const PROMPT_IMAGEN_GALERIA_GEMINI_DEFAULT = `Interpretá qué producto es a partir de la imagen de referencia. Generá UNA fotografía hiperrealista para galería secundaria de tienda online.

Objetivo:
- Mostrar el producto en un contexto de uso realista o en un entorno lifestyle coherente con lo que es (ej.: cocina, despensa, oficina, ocio — según corresponda).
- Iluminación natural o de escena creíble, materiales realistas, profundidad de campo suave donde ayude a la composición.
- El producto debe seguir siendo reconocible y fiel al original: no distorsionar el empaque ni inventar variantes que no se vean en la referencia.
- Sin texto superpuesto, sin marcas de agua, sin mockups genéricos “plantilla”.
- Composición vertical u horizontal según lo que mejor sirva a la escena; priorizá impacto visual de catálogo premium.

Esta imagen es solo para acompañar la foto principal de fondo blanco; puede incluir manos u objetos de contexto si encaja con el producto.`;
