const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURACIÓN
// =====================================================

app.use(cors());

app.use(express.json({
  limit: "15mb"
}));

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "❌ Faltan SUPABASE_URL o SUPABASE_SECRET_KEY"
  );

  process.exit(1);
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY
  );

const BUCKET_FOTOS =
  "mascotas-fotos";

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function enviarError(
  res,
  error,
  mensaje = "Ocurrió un error."
) {
  console.error("❌", error);

  return res.status(500).json({
    correcto: false,
    mensaje,
    error:
      error?.message ||
      "Error desconocido."
  });
}

// -----------------------------------------------------
// Escapar texto para respuestas
// -----------------------------------------------------

function textoSeguro(valor) {
  if (
    valor === null ||
    valor === undefined
  ) {
    return null;
  }

  return String(valor).trim();
}

// -----------------------------------------------------
// Subir una imagen base64 a Supabase Storage
// -----------------------------------------------------

async function subirFotoBase64(
  fotoBase64
) {

  if (
    !fotoBase64 ||
    typeof fotoBase64 !== "string"
  ) {
    return null;
  }

  try {

    /*
      Esperamos una imagen tipo:

      data:image/jpeg;base64,/9j/4AAQ...

      o:

      data:image/png;base64,...
    */

    const coincidencia =
      fotoBase64.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
      );

    if (!coincidencia) {
      throw new Error(
        "El formato de la imagen no es válido."
      );
    }

    const mimeType =
      coincidencia[1];

    const contenidoBase64 =
      coincidencia[2];

    const extensiones = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    };

    const extension =
      extensiones[mimeType];

    if (!extension) {
      throw new Error(
        "Tipo de imagen no permitido."
      );
    }

    const buffer =
      Buffer.from(
        contenidoBase64,
        "base64"
      );

    // Máximo aproximado de 8 MB
    if (buffer.length > 8 * 1024 * 1024) {
      throw new Error(
        "La imagen supera el límite de 8 MB."
      );
    }

    const nombreArchivo =
      `${crypto.randomUUID()}.${extension}`;

    const ruta =
      `publicaciones/${nombreArchivo}`;

    const { error } =
      await supabase.storage
        .from(BUCKET_FOTOS)
        .upload(
          ruta,
          buffer,
          {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: false
          }
        );

    if (error) {
      throw error;
    }

    const { data } =
      supabase.storage
        .from(BUCKET_FOTOS)
        .getPublicUrl(ruta);

    return data.publicUrl;

  } catch (error) {

    console.error(
      "❌ Error al subir foto:",
      error
    );

    throw error;
  }
}

// =====================================================
// SERVICIO
// =====================================================

app.get("/", (req, res) => {

  res.json({
    app: "Patitas S.I.",
    estado: "online",
    mensaje:
      "Servidor funcionando correctamente 🐾"
  });

});

// =====================================================
// PRUEBA SUPABASE
// =====================================================

app.get(
  "/api/prueba",
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from("insignias")
        .select(
          "codigo,nombre,icono,descripcion"
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        );

      if (error) {
        return enviarError(
          res,
          error,
          "No se pudo consultar Supabase."
        );
      }

      res.json({
        correcto: true,
        mensaje:
          "Railway está conectado con Supabase ✅",
        insignias: data
      });

    } catch (error) {

      return enviarError(
        res,
        error
      );

    }
  }
);

// =====================================================
// MASCOTAS - LISTAR
// =====================================================

app.get(
  "/api/mascotas",
  async (req, res) => {

    try {

      const tipo =
        textoSeguro(req.query.tipo);

      const estado =
        textoSeguro(req.query.estado);

      let consulta =
        supabase
          .from("mascotas")
          .select("*")
          .order(
            "creado_en",
            {
              ascending: false
            }
          );

      if (tipo) {

        consulta =
          consulta.eq(
            "tipo_publicacion",
            tipo
          );

      }

      if (estado) {

        consulta =
          consulta.eq(
            "estado",
            estado
          );

      }

      const {
        data,
        error
      } = await consulta;

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudieron obtener las mascotas."
        );

      }

      res.json({
        correcto: true,
        total: data.length,
        mascotas: data
      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al obtener las mascotas."
      );

    }
  }
);

// =====================================================
// MASCOTA INDIVIDUAL
// =====================================================

app.get(
  "/api/mascotas/:id",
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const {
        data,
        error
      } = await supabase
        .from("mascotas")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {

        return res.status(404).json({
          correcto: false,
          mensaje:
            "Mascota no encontrada."
        });

      }

      res.json({
        correcto: true,
        mascota: data
      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al buscar la mascota."
      );

    }
  }
);

// =====================================================
// CREAR MASCOTA
// =====================================================

app.post(
  "/api/mascotas",
  async (req, res) => {

    try {

      const {
        tipo_publicacion,
        nombre,
        tipo_animal,
        edad_aproximada,
        sexo,
        tamanio,
        color,
        caracteristicas,
        lugar,
        fecha_evento,
        personalidad,
        informacion_salud,
        descripcion,
        contacto,
        foto_url,
        foto_base64,
        usuario_id
      } = req.body;

      const tiposPermitidos = [
        "perdida",
        "encontrada",
        "adopcion",
        "ayuda"
      ];

      // -----------------------------------------------
      // VALIDAR TIPO
      // -----------------------------------------------

      if (!tipo_publicacion) {

        return res.status(400).json({
          correcto: false,
          mensaje:
            "Debes indicar el tipo de publicación."
        });

      }

      if (
        !tiposPermitidos.includes(
          tipo_publicacion
        )
      ) {

        return res.status(400).json({
          correcto: false,
          mensaje:
            "Tipo de publicación no válido."
        });

      }

      // -----------------------------------------------
      // FOTO
      // -----------------------------------------------

      let fotoFinal =
        textoSeguro(foto_url);

      if (foto_base64) {

        fotoFinal =
          await subirFotoBase64(
            foto_base64
          );

      }

      // -----------------------------------------------
      // DATOS
      // -----------------------------------------------

      const nuevaMascota = {

        tipo_publicacion,

        nombre:
          textoSeguro(nombre),

        tipo_animal:
          textoSeguro(tipo_animal),

        edad_aproximada:
          textoSeguro(
            edad_aproximada
          ),

        sexo:
          textoSeguro(sexo),

        tamanio:
          textoSeguro(tamanio),

        color:
          textoSeguro(color),

        caracteristicas:
          textoSeguro(
            caracteristicas
          ),

        lugar:
          textoSeguro(lugar),

        fecha_evento:
          textoSeguro(
            fecha_evento
          ),

        personalidad:
          textoSeguro(
            personalidad
          ),

        informacion_salud:
          textoSeguro(
            informacion_salud
          ),

        descripcion:
          textoSeguro(
            descripcion
          ),

        contacto:
          textoSeguro(contacto),

        foto_url:
          fotoFinal,

        usuario_id:
          textoSeguro(usuario_id),

        estado:
          "activa"
      };

      // -----------------------------------------------
      // GUARDAR MASCOTA
      // -----------------------------------------------

      const {
        data,
        error
      } = await supabase
        .from("mascotas")
        .insert([
          nuevaMascota
        ])
        .select()
        .single();

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudo guardar la mascota."
        );

      }

      // -----------------------------------------------
      // REGISTRAR ACCIÓN
      // -----------------------------------------------

      if (usuario_id) {

        const {
          error:
            errorAccion
        } =
          await supabase
            .from(
              "acciones_usuario"
            )
            .insert([
              {
                usuario_externo:
                  String(usuario_id),

                accion:
                  `publico_${tipo_publicacion}`,

                mascota_id:
                  data.id,

                datos: {
                  tipo_publicacion,
                  nombre:
                    nombre || null
                }
              }
            ]);

        if (errorAccion) {

          console.warn(
            "⚠️ La mascota se guardó, pero la acción no pudo registrarse:",
            errorAccion.message
          );

        }

      }

      // -----------------------------------------------
      // RESPUESTA
      // -----------------------------------------------

      res.status(201).json({

        correcto: true,

        mensaje:
          "Mascota publicada correctamente 🐾",

        mascota: data

      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al crear la publicación."
      );

    }
  }
);

// =====================================================
// ACTUALIZAR ESTADO
// =====================================================

app.patch(
  "/api/mascotas/:id/estado",
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const {
        estado
      } = req.body;

      const estadosPermitidos = [
        "activa",
        "encontrada",
        "adoptada",
        "cerrada"
      ];

      if (
        !estadosPermitidos.includes(
          estado
        )
      ) {

        return res.status(400).json({
          correcto: false,
          mensaje:
            "Estado no válido."
        });

      }

      const {
        data,
        error
      } = await supabase
        .from("mascotas")
        .update({
          estado,
          actualizado_en:
            new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudo actualizar la mascota."
        );

      }

      res.json({
        correcto: true,
        mensaje:
          "Estado actualizado correctamente ✅",
        mascota: data
      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al actualizar el estado."
      );

    }
  }
);

// =====================================================
// ACCIONES
// =====================================================

app.post(
  "/api/acciones",
  async (req, res) => {

    try {

      const {
        usuario_externo,
        accion,
        mascota_id,
        datos
      } = req.body;

      if (
        !usuario_externo ||
        !accion
      ) {

        return res.status(400).json({
          correcto: false,
          mensaje:
            "Faltan datos de la acción."
        });

      }

      const {
        data,
        error
      } = await supabase
        .from(
          "acciones_usuario"
        )
        .insert([
          {
            usuario_externo:
              String(
                usuario_externo
              ),

            accion,

            mascota_id:
              mascota_id || null,

            datos:
              datos || {}
          }
        ])
        .select()
        .single();

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudo registrar la acción."
        );

      }

      res.status(201).json({

        correcto: true,

        mensaje:
          "Acción registrada ✅",

        accion: data

      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al registrar la acción."
      );

    }
  }
);

// =====================================================
// OBTENER ACCIONES
// =====================================================

app.get(
  "/api/acciones/:usuario",
  async (req, res) => {

    try {

      const usuario =
        String(
          req.params.usuario
        );

      const {
        data,
        error
      } = await supabase
        .from(
          "acciones_usuario"
        )
        .select("*")
        .eq(
          "usuario_externo",
          usuario
        )
        .order(
          "creado_en",
          {
            ascending: false
          }
        );

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudieron obtener las acciones."
        );

      }

      res.json({

        correcto: true,

        total:
          data.length,

        acciones:
          data

      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al obtener acciones."
      );

    }
  }
);

// =====================================================
// INSIGNIAS - TODAS
// =====================================================

app.get(
  "/api/insignias",
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from("insignias")
        .select("*")
        .order(
          "created_at",
          {
            ascending: true
          }
        );

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudieron obtener las insignias."
        );

      }

      res.json({
        correcto: true,
        insignias: data
      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al obtener insignias."
      );

    }
  }
);

// =====================================================
// INSIGNIAS DE USUARIO
// =====================================================

app.get(
  "/api/insignias/usuario/:usuario",
  async (req, res) => {

    try {

      const usuario =
        String(
          req.params.usuario
        );

      const {
        data,
        error
      } = await supabase
        .from(
          "insignias_usuario"
        )
        .select(`
          id,
          usuario_externo,
          desbloqueada_en,
          insignia:insignia_id (
            id,
            codigo,
            nombre,
            icono,
            descripcion
          )
        `)
        .eq(
          "usuario_externo",
          usuario
        )
        .order(
          "desbloqueada_en",
          {
            ascending: false
          }
        );

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudieron obtener las insignias."
        );

      }

      res.json({
        correcto: true,
        usuario,
        insignias: data
      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al obtener insignias."
      );

    }
  }
);

// =====================================================
// DESBLOQUEAR INSIGNIA
// =====================================================

app.post(
  "/api/insignias/desbloquear",
  async (req, res) => {

    try {

      const {
        usuario_externo,
        codigo_insignia
      } = req.body;

      if (
        !usuario_externo ||
        !codigo_insignia
      ) {

        return res.status(400).json({
          correcto: false,
          mensaje:
            "Faltan datos para desbloquear la insignia."
        });

      }

      const {
        data: insignia,
        error:
          errorInsignia
      } = await supabase
        .from("insignias")
        .select("*")
        .eq(
          "codigo",
          codigo_insignia
        )
        .single();

      if (
        errorInsignia ||
        !insignia
      ) {

        return res.status(404).json({
          correcto: false,
          mensaje:
            "Insignia no encontrada."
        });

      }

      const {
        data,
        error
      } = await supabase
        .from(
          "insignias_usuario"
        )
        .insert([
          {
            usuario_externo:
              String(
                usuario_externo
              ),

            insignia_id:
              insignia.id
          }
        ])
        .select()
        .single();

      if (error) {

        if (
          error.code === "23505"
        ) {

          return res.json({
            correcto: true,
            nueva: false,
            mensaje:
              "La insignia ya estaba desbloqueada ✅"
          });

        }

        return enviarError(
          res,
          error,
          "No se pudo desbloquear la insignia."
        );

      }

      res.status(201).json({

        correcto: true,

        nueva: true,

        mensaje:
          `¡Nueva insignia desbloqueada! ${insignia.icono}`,

        insignia: data

      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al desbloquear insignia."
      );

    }
  }
);

// =====================================================
// RECOMPENSAS - TODAS
// =====================================================

app.get(
  "/api/recompensas",
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from("recompensas")
        .select("*")
        .order(
          "created_at",
          {
            ascending: true
          }
        );

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudieron obtener las recompensas."
        );

      }

      res.json({
        correcto: true,
        recompensas: data
      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al obtener recompensas."
      );

    }
  }
);

// =====================================================
// RECOMPENSAS DEL USUARIO
// =====================================================

app.get(
  "/api/recompensas/usuario/:usuario",
  async (req, res) => {

    try {

      const usuario =
        String(
          req.params.usuario
        );

      const {
        data,
        error
      } = await supabase
        .from(
          "recompensas_usuario"
        )
        .select(`
          id,
          usuario_externo,
          estado,
          obtenida_en,
          recompensa:recompensa_id (
            id,
            codigo,
            nombre,
            icono,
            descripcion
          )
        `)
        .eq(
          "usuario_externo",
          usuario
        )
        .order(
          "obtenida_en",
          {
            ascending: false
          }
        );

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudieron obtener las recompensas."
        );

      }

      res.json({
        correcto: true,
        usuario,
        recompensas: data
      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al obtener recompensas."
      );

    }
  }
);

// =====================================================
// ASIGNAR RECOMPENSA
// =====================================================

app.post(
  "/api/recompensas/asignar",
  async (req, res) => {

    try {

      const {
        usuario_externo,
        codigo_recompensa
      } = req.body;

      if (
        !usuario_externo ||
        !codigo_recompensa
      ) {

        return res.status(400).json({
          correcto: false,
          mensaje:
            "Faltan datos para asignar la recompensa."
        });

      }

      const {
        data: recompensa,
        error:
          errorRecompensa
      } = await supabase
        .from("recompensas")
        .select("*")
        .eq(
          "codigo",
          codigo_recompensa
        )
        .single();

      if (
        errorRecompensa ||
        !recompensa
      ) {

        return res.status(404).json({
          correcto: false,
          mensaje:
            "Recompensa no encontrada."
        });

      }

      const {
        data,
        error
      } = await supabase
        .from(
          "recompensas_usuario"
        )
        .insert([
          {
            usuario_externo:
              String(
                usuario_externo
              ),

            recompensa_id:
              recompensa.id,

            estado:
              "pendiente"
          }
        ])
        .select()
        .single();

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudo asignar la recompensa."
        );

      }

      res.status(201).json({

        correcto: true,

        mensaje:
          `¡Recompensa disponible! ${recompensa.icono}`,

        recompensa: data

      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al asignar recompensa."
      );

    }
  }
);

// =====================================================
// CAMBIAR ESTADO DE RECOMPENSA
// =====================================================

app.patch(
  "/api/recompensas/:id/estado",
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const { estado } =
        req.body;

      const estadosPermitidos = [
        "pendiente",
        "aprobada",
        "entregada",
        "cancelada"
      ];

      if (
        !estadosPermitidos.includes(
          estado
        )
      ) {

        return res.status(400).json({
          correcto: false,
          mensaje:
            "Estado de recompensa no válido."
        });

      }

      const {
        data,
        error
      } = await supabase
        .from(
          "recompensas_usuario"
        )
        .update({
          estado
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {

        return enviarError(
          res,
          error,
          "No se pudo actualizar la recompensa."
        );

      }

      res.json({

        correcto: true,

        mensaje:
          "Recompensa actualizada ✅",

        recompensa:
          data

      });

    } catch (error) {

      return enviarError(
        res,
        error,
        "Error al actualizar recompensa."
      );

    }
  }
);

// =====================================================
// 404
// =====================================================

app.use(
  (req, res) => {

    res.status(404).json({

      correcto: false,

      mensaje:
        "Ruta no encontrada."

    });

  }
);

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🐾 Patitas S.I. funcionando en el puerto ${PORT}`
    );

  }
);