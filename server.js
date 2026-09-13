const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// CONFIGURACIÓN
// --------------------------------------------------

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("❌ Faltan SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey
);

// --------------------------------------------------
// FUNCIONES AUXILIARES
// --------------------------------------------------

function responderError(res, error, mensaje = "Ocurrió un error") {
  console.error(error);

  return res.status(500).json({
    correcto: false,
    mensaje,
    error: error?.message || "Error desconocido"
  });
}

// --------------------------------------------------
// INICIO
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    app: "Patitas S.I.",
    estado: "online",
    mensaje: "Servidor funcionando correctamente 🐾"
  });
});

// --------------------------------------------------
// PRUEBA DE SUPABASE
// --------------------------------------------------

app.get("/api/prueba", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("insignias")
      .select("codigo,nombre,icono,descripcion")
      .order("created_at", { ascending: true });

    if (error) {
      return responderError(
        res,
        error,
        "No se pudo consultar Supabase"
      );
    }

    res.json({
      correcto: true,
      mensaje: "Railway está conectado con Supabase ✅",
      insignias: data
    });

  } catch (error) {
    responderError(res, error);
  }
});

// ==================================================
// MASCOTAS
// ==================================================

// --------------------------------------------------
// OBTENER TODAS LAS MASCOTAS
// GET /api/mascotas
// --------------------------------------------------

app.get("/api/mascotas", async (req, res) => {
  try {
    const tipo = req.query.tipo;
    const estado = req.query.estado;

    let consulta = supabase
      .from("mascotas")
      .select("*")
      .order("creado_en", { ascending: false });

    if (tipo) {
      consulta = consulta.eq("tipo_publicacion", tipo);
    }

    if (estado) {
      consulta = consulta.eq("estado", estado);
    }

    const { data, error } = await consulta;

    if (error) {
      return responderError(
        res,
        error,
        "No se pudieron obtener las mascotas"
      );
    }

    res.json({
      correcto: true,
      total: data.length,
      mascotas: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al obtener mascotas"
    );
  }
});

// --------------------------------------------------
// OBTENER UNA MASCOTA
// GET /api/mascotas/:id
// --------------------------------------------------

app.get("/api/mascotas/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("mascotas")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        correcto: false,
        mensaje: "Mascota no encontrada",
        error: error.message
      });
    }

    res.json({
      correcto: true,
      mascota: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al buscar la mascota"
    );
  }
});

// --------------------------------------------------
// CREAR UNA MASCOTA
// POST /api/mascotas
// --------------------------------------------------

app.post("/api/mascotas", async (req, res) => {
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
      usuario_id
    } = req.body;

    const tiposValidos = [
      "perdida",
      "encontrada",
      "adopcion",
      "ayuda"
    ];

    if (!tipo_publicacion) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Debes indicar el tipo de publicación"
      });
    }

    if (!tiposValidos.includes(tipo_publicacion)) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Tipo de publicación no válido"
      });
    }

    const { data, error } = await supabase
      .from("mascotas")
      .insert([{
        tipo_publicacion,
        nombre: nombre || null,
        tipo_animal: tipo_animal || null,
        edad_aproximada: edad_aproximada || null,
        sexo: sexo || null,
        tamanio: tamanio || null,
        color: color || null,
        caracteristicas: caracteristicas || null,
        lugar: lugar || null,
        fecha_evento: fecha_evento || null,
        personalidad: personalidad || null,
        informacion_salud: informacion_salud || null,
        descripcion: descripcion || null,
        contacto: contacto || null,
        foto_url: foto_url || null,
        usuario_id: usuario_id || null
      }])
      .select()
      .single();

    if (error) {
      return responderError(
        res,
        error,
        "No se pudo guardar la mascota"
      );
    }

    // Registrar acción del usuario
    if (usuario_id) {
      await supabase
        .from("acciones_usuario")
        .insert([{
          usuario_externo: usuario_id,
          accion: `publico_${tipo_publicacion}`,
          mascota_id: data.id,
          datos: {
            tipo_publicacion,
            nombre: nombre || null
          }
        }]);
    }

    res.status(201).json({
      correcto: true,
      mensaje: "Mascota publicada correctamente 🐾",
      mascota: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al crear la publicación"
    );
  }
});

// --------------------------------------------------
// CAMBIAR ESTADO DE UNA MASCOTA
// PATCH /api/mascotas/:id/estado
// --------------------------------------------------

app.patch("/api/mascotas/:id/estado", async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = [
      "activa",
      "encontrada",
      "adoptada",
      "cerrada"
    ];

    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Estado no válido"
      });
    }

    const { data, error } = await supabase
      .from("mascotas")
      .update({
        estado,
        actualizado_en: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return responderError(
        res,
        error,
        "No se pudo actualizar el estado"
      );
    }

    res.json({
      correcto: true,
      mensaje: "Estado actualizado correctamente ✅",
      mascota: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al actualizar estado"
    );
  }
});

// ==================================================
// ACCIONES
// ==================================================

// --------------------------------------------------
// REGISTRAR UNA ACCIÓN
// POST /api/acciones
// --------------------------------------------------

app.post("/api/acciones", async (req, res) => {
  try {
    const {
      usuario_externo,
      accion,
      mascota_id,
      datos
    } = req.body;

    if (!usuario_externo || !accion) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Faltan usuario_externo o accion"
      });
    }

    const { data, error } = await supabase
      .from("acciones_usuario")
      .insert([{
        usuario_externo,
        accion,
        mascota_id: mascota_id || null,
        datos: datos || {}
      }])
      .select()
      .single();

    if (error) {
      return responderError(
        res,
        error,
        "No se pudo registrar la acción"
      );
    }

    res.status(201).json({
      correcto: true,
      mensaje: "Acción registrada ✅",
      accion: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al registrar acción"
    );
  }
});

// --------------------------------------------------
// OBTENER ACCIONES DE UN USUARIO
// GET /api/acciones/:usuario
// --------------------------------------------------

app.get("/api/acciones/:usuario", async (req, res) => {
  try {
    const { usuario } = req.params;

    const { data, error } = await supabase
      .from("acciones_usuario")
      .select("*")
      .eq("usuario_externo", usuario)
      .order("creado_en", { ascending: false });

    if (error) {
      return responderError(
        res,
        error,
        "No se pudieron obtener las acciones"
      );
    }

    res.json({
      correcto: true,
      total: data.length,
      acciones: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al obtener acciones"
    );
  }
});

// ==================================================
// INSIGNIAS
// ==================================================

// --------------------------------------------------
// OBTENER TODAS LAS INSIGNIAS
// GET /api/insignias
// --------------------------------------------------

app.get("/api/insignias", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("insignias")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return responderError(
        res,
        error,
        "No se pudieron obtener las insignias"
      );
    }

    res.json({
      correcto: true,
      insignias: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al obtener insignias"
    );
  }
});

// --------------------------------------------------
// OBTENER INSIGNIAS DE UN USUARIO
// GET /api/insignias/usuario/:usuario
// --------------------------------------------------

app.get("/api/insignias/usuario/:usuario", async (req, res) => {
  try {
    const { usuario } = req.params;

    const { data, error } = await supabase
      .from("insignias_usuario")
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
      .eq("usuario_externo", usuario)
      .order("desbloqueada_en", { ascending: false });

    if (error) {
      return responderError(
        res,
        error,
        "No se pudieron obtener las insignias del usuario"
      );
    }

    res.json({
      correcto: true,
      usuario,
      insignias: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al obtener insignias del usuario"
    );
  }
});

// --------------------------------------------------
// DESBLOQUEAR INSIGNIA
// POST /api/insignias/desbloquear
// --------------------------------------------------

app.post("/api/insignias/desbloquear", async (req, res) => {
  try {
    const {
      usuario_externo,
      codigo_insignia
    } = req.body;

    if (!usuario_externo || !codigo_insignia) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Faltan datos para desbloquear la insignia"
      });
    }

    const { data: insignia, error: errorInsignia } = await supabase
      .from("insignias")
      .select("id,codigo,nombre,icono,descripcion")
      .eq("codigo", codigo_insignia)
      .single();

    if (errorInsignia || !insignia) {
      return res.status(404).json({
        correcto: false,
        mensaje: "Insignia no encontrada"
      });
    }

    const { data, error } = await supabase
      .from("insignias_usuario")
      .insert([{
        usuario_externo,
        insignia_id: insignia.id
      }])
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
      .single();

    if (error) {

      // Si ya existe, no creamos duplicado
      if (error.code === "23505") {
        return res.json({
          correcto: true,
          nueva: false,
          mensaje: "La insignia ya estaba desbloqueada ✅"
        });
      }

      return responderError(
        res,
        error,
        "No se pudo desbloquear la insignia"
      );
    }

    res.status(201).json({
      correcto: true,
      nueva: true,
      mensaje: `¡Nueva insignia desbloqueada! ${insignia.icono}`,
      insignia: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al desbloquear insignia"
    );
  }
});

// ==================================================
// RECOMPENSAS
// ==================================================

// --------------------------------------------------
// OBTENER TODAS LAS RECOMPENSAS
// GET /api/recompensas
// --------------------------------------------------

app.get("/api/recompensas", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("recompensas")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return responderError(
        res,
        error,
        "No se pudieron obtener las recompensas"
      );
    }

    res.json({
      correcto: true,
      recompensas: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al obtener recompensas"
    );
  }
});

// --------------------------------------------------
// RECOMPENSAS DEL USUARIO
// GET /api/recompensas/usuario/:usuario
// --------------------------------------------------

app.get("/api/recompensas/usuario/:usuario", async (req, res) => {
  try {
    const { usuario } = req.params;

    const { data, error } = await supabase
      .from("recompensas_usuario")
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
      .eq("usuario_externo", usuario)
      .order("obtenida_en", { ascending: false });

    if (error) {
      return responderError(
        res,
        error,
        "No se pudieron obtener las recompensas"
      );
    }

    res.json({
      correcto: true,
      usuario,
      recompensas: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al obtener recompensas del usuario"
    );
  }
});

// --------------------------------------------------
// ASIGNAR RECOMPENSA
// POST /api/recompensas/asignar
// --------------------------------------------------

app.post("/api/recompensas/asignar", async (req, res) => {
  try {
    const {
      usuario_externo,
      codigo_recompensa
    } = req.body;

    if (!usuario_externo || !codigo_recompensa) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Faltan datos para asignar la recompensa"
      });
    }

    const { data: recompensa, error: errorRecompensa } =
      await supabase
        .from("recompensas")
        .select("id,codigo,nombre,icono,descripcion")
        .eq("codigo", codigo_recompensa)
        .single();

    if (errorRecompensa || !recompensa) {
      return res.status(404).json({
        correcto: false,
        mensaje: "Recompensa no encontrada"
      });
    }

    const { data, error } = await supabase
      .from("recompensas_usuario")
      .insert([{
        usuario_externo,
        recompensa_id: recompensa.id,
        estado: "pendiente"
      }])
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
      .single();

    if (error) {
      return responderError(
        res,
        error,
        "No se pudo asignar la recompensa"
      );
    }

    res.status(201).json({
      correcto: true,
      mensaje: `¡Recompensa disponible! ${recompensa.icono}`,
      recompensa: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al asignar recompensa"
    );
  }
});

// --------------------------------------------------
// CAMBIAR ESTADO DE RECOMPENSA
// PATCH /api/recompensas/:id/estado
// --------------------------------------------------

app.patch("/api/recompensas/:id/estado", async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = [
      "pendiente",
      "aprobada",
      "entregada",
      "cancelada"
    ];

    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Estado de recompensa no válido"
      });
    }

    const { data, error } = await supabase
      .from("recompensas_usuario")
      .update({ estado })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return responderError(
        res,
        error,
        "No se pudo actualizar la recompensa"
      );
    }

    res.json({
      correcto: true,
      mensaje: "Recompensa actualizada ✅",
      recompensa: data
    });

  } catch (error) {
    responderError(
      res,
      error,
      "Error al actualizar recompensa"
    );
  }
});

// ==================================================
// INICIAR SERVIDOR
// ==================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🐾 Patitas S.I. funcionando en el puerto ${PORT}`
  );
});