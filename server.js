const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// CONFIGURACIÓN
// --------------------------------------------------

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "15mb" }));

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

const BUCKET_FOTOS = "mascotas-fotos";

// --------------------------------------------------
// RESPUESTAS Y UTILIDADES
// --------------------------------------------------

function responderError(res, error, mensaje = "Ocurrió un error") {
  console.error("❌", mensaje, error);
  return res.status(500).json({
    correcto: false,
    mensaje,
    error: error?.message || "Error desconocido"
  });
}

function textoSeguro(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

function extensionDesdeMime(mime) {
  const mapa = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  return mapa[mime] || "jpg";
}

async function subirFotoBase64(fotoBase64) {
  if (!fotoBase64) return null;

  const coincidencia = String(fotoBase64).match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!coincidencia) {
    throw new Error("Formato de imagen inválido");
  }

  const mime = coincidencia[1];
  const base64 = coincidencia[2];
  const extension = extensionDesdeMime(mime);
  const buffer = Buffer.from(base64, "base64");
  const nombre = `publicaciones/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(nombre, buffer, {
      contentType: mime,
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_FOTOS)
    .getPublicUrl(nombre);

  return urlData.publicUrl;
}

// --------------------------------------------------
// INSIGNIAS
// --------------------------------------------------

async function desbloquearInsignia(usuario, codigo) {
  if (!usuario || !codigo) return false;

  try {
    const { data: insignia, error: errorInsignia } = await supabase
      .from("insignias")
      .select("id,codigo,nombre,icono,descripcion")
      .eq("codigo", codigo)
      .maybeSingle();

    if (errorInsignia) {
      console.warn("⚠️ Error buscando insignia:", errorInsignia.message);
      return false;
    }

    if (!insignia) {
      console.warn("⚠️ Insignia no encontrada:", codigo);
      return false;
    }

    const { data: existente, error: errorExistente } = await supabase
      .from("insignias_usuario")
      .select("id")
      .eq("usuario_externo", String(usuario))
      .eq("insignia_id", insignia.id)
      .maybeSingle();

    if (errorExistente) {
      console.warn("⚠️ No se pudo comprobar la insignia:", errorExistente.message);
      return false;
    }

    if (existente) {
      return false;
    }

    const { error: errorInsert } = await supabase
      .from("insignias_usuario")
      .insert([{
        usuario_externo: String(usuario),
        insignia_id: insignia.id
      }]);

    if (errorInsert) {
      // 23505 = ya existe por una restricción UNIQUE
      if (errorInsert.code === "23505") return false;
      console.error("❌ Error desbloqueando insignia:", errorInsert.message);
      return false;
    }

    console.log(
      `🏅 Nueva insignia para ${usuario}: ${insignia.icono || "🏅"} ${insignia.nombre}`
    );

    return true;
  } catch (error) {
    console.error("❌ Error en desbloquearInsignia:", error);
    return false;
  }
}

// --------------------------------------------------
// RECOMPENSAS
// --------------------------------------------------

async function asignarRecompensa(usuario, codigo) {
  if (!usuario || !codigo) return false;

  try {
    const { data: recompensa, error: errorRecompensa } = await supabase
      .from("recompensas")
      .select("id,codigo,nombre,icono,descripcion")
      .eq("codigo", codigo)
      .maybeSingle();

    if (errorRecompensa) {
      console.warn("⚠️ Error buscando recompensa:", errorRecompensa.message);
      return false;
    }

    if (!recompensa) {
      console.warn("⚠️ Recompensa no encontrada:", codigo);
      return false;
    }

    const { data: existente, error: errorExistente } = await supabase
      .from("recompensas_usuario")
      .select("id,estado")
      .eq("usuario_externo", String(usuario))
      .eq("recompensa_id", recompensa.id)
      .maybeSingle();

    if (errorExistente) {
      console.warn("⚠️ No se pudo comprobar la recompensa:", errorExistente.message);
      return false;
    }

    if (existente) {
      return false;
    }

    const { error: errorInsert } = await supabase
      .from("recompensas_usuario")
      .insert([{
        usuario_externo: String(usuario),
        recompensa_id: recompensa.id,
        estado: "pendiente"
      }]);

    if (errorInsert) {
      if (errorInsert.code === "23505") return false;
      console.error("❌ Error asignando recompensa:", errorInsert.message);
      return false;
    }

    console.log(
      `🎁 Nueva recompensa para ${usuario}: ${recompensa.icono || "🎁"} ${recompensa.nombre}`
    );

    return true;
  } catch (error) {
    console.error("❌ Error en asignarRecompensa:", error);
    return false;
  }
}

async function registrarAccion(usuario, accion, mascotaId = null, datos = {}) {
  if (!usuario || !accion) return false;

  try {
    const { error } = await supabase
      .from("acciones_usuario")
      .insert([{
        usuario_externo: String(usuario),
        accion,
        mascota_id: mascotaId || null,
        datos: datos || {}
      }]);

    if (error) {
      console.warn("⚠️ No se pudo registrar acción:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("⚠️ Error registrando acción:", error.message);
    return false;
  }
}

async function prepararLogros() {
  // Se crean solo si no existen. Así no se duplican tus datos actuales.
  const insigniasBase = [
    {
      codigo: "primera_huella",
      nombre: "Primera Huella",
      icono: "🐾",
      descripcion: "Realizaste tu primera publicación en Patitas S.I."
    },
    {
      codigo: "alerta_activa",
      nombre: "Alerta Activa",
      icono: "🚨",
      descripcion: "Publicaste una mascota perdida para ayudar a encontrarla."
    },
    {
      codigo: "rastreador",
      nombre: "Rastreador",
      icono: "🔎",
      descripcion: "Publicaste una mascota encontrada."
    },
    {
      codigo: "hogar_cambia_vidas",
      nombre: "Hogar que Cambia Vidas",
      icono: "🏡",
      descripcion: "Ayudaste a una mascota a encontrar un hogar."
    },
    {
      codigo: "corazon_animal",
      nombre: "Corazón Animal",
      icono: "❤️",
      descripcion: "Ayudaste a una mascota a regresar con su familia."
    },
    {
      codigo: "protector_patitas",
      nombre: "Protector de Patitas",
      icono: "🛡️",
      descripcion: "Ayudaste a cerrar un caso de mascota encontrada."
    }
  ];

  const recompensasBase = [
    {
      codigo: "ayuda_familia",
      nombre: "Ayuda a una Familia",
      icono: "💚",
      descripcion: "Reconocimiento por ayudar a reunir una mascota con su familia."
    },
    {
      codigo: "protector_patitas",
      nombre: "Protector de Patitas",
      icono: "🎁",
      descripcion: "Reconocimiento por ayudar con una mascota encontrada."
    },
    {
      codigo: "hogar_cambia_vidas",
      nombre: "Hogar que Cambia Vidas",
      icono: "🏡",
      descripcion: "Reconocimiento por concretar una adopción responsable."
    }
  ];

  try {
    for (const item of insigniasBase) {
      const { data: existente, error } = await supabase
        .from("insignias")
        .select("id")
        .eq("codigo", item.codigo)
        .maybeSingle();

      if (!error && !existente) {
        await supabase.from("insignias").insert([item]);
      }
    }

    for (const item of recompensasBase) {
      const { data: existente, error } = await supabase
        .from("recompensas")
        .select("id")
        .eq("codigo", item.codigo)
        .maybeSingle();

      if (!error && !existente) {
        await supabase.from("recompensas").insert([item]);
      }
    }

    console.log("🏅🎁 Logros preparados correctamente.");
  } catch (error) {
    console.warn("⚠️ No se pudieron preparar algunos logros:", error.message);
  }
}

// --------------------------------------------------
// INICIO / SALUD
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    app: "Patitas S.I.",
    estado: "online",
    mensaje: "Servidor funcionando correctamente 🐾"
  });
});

app.get("/api/prueba", async (req, res) => {
  try {
    const [insigniasResp, recompensasResp] = await Promise.all([
      supabase
        .from("insignias")
        .select("codigo,nombre,icono,descripcion")
        .order("created_at", { ascending: true }),
      supabase
        .from("recompensas")
        .select("codigo,nombre,icono,descripcion")
        .order("created_at", { ascending: true })
    ]);

    if (insigniasResp.error) {
      return responderError(res, insigniasResp.error, "No se pudo consultar insignias");
    }

    if (recompensasResp.error) {
      return responderError(res, recompensasResp.error, "No se pudo consultar recompensas");
    }

    res.json({
      correcto: true,
      mensaje: "Railway está conectado con Supabase ✅",
      insignias: insigniasResp.data,
      recompensas: recompensasResp.data
    });
  } catch (error) {
    responderError(res, error, "Error en la prueba del servidor");
  }
});

// --------------------------------------------------
// MASCOTAS - LISTADO
// --------------------------------------------------

app.get("/api/mascotas", async (req, res) => {
  try {
    const tipo = textoSeguro(req.query.tipo);
    const estado = textoSeguro(req.query.estado);

    let consulta = supabase
      .from("mascotas")
      .select("*")
      .order("creado_en", { ascending: false });

    if (tipo) consulta = consulta.eq("tipo_publicacion", tipo);
    if (estado) {
      consulta = consulta.eq("estado", estado);
    } else {
      // Las pantallas públicas muestran solamente publicaciones activas.
      consulta = consulta.eq("estado", "activa");
    }

    const { data, error } = await consulta;

    if (error) {
      return responderError(res, error, "No se pudieron obtener las mascotas");
    }

    res.json({
      correcto: true,
      total: data.length,
      mascotas: data
    });
  } catch (error) {
    responderError(res, error, "Error al obtener mascotas");
  }
});

app.get("/api/mascotas/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("mascotas")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        correcto: false,
        mensaje: "Mascota no encontrada"
      });
    }

    res.json({ correcto: true, mascota: data });
  } catch (error) {
    responderError(res, error, "Error al buscar la mascota");
  }
});

// --------------------------------------------------
// MASCOTAS - CREAR PUBLICACIÓN
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
      foto_base64,
      usuario_id
    } = req.body;

    const tiposValidos = ["perdida", "encontrada", "adopcion", "ayuda"];

    if (!tipo_publicacion || !tiposValidos.includes(tipo_publicacion)) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Debes indicar un tipo de publicación válido"
      });
    }

    if (!usuario_id) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Falta el usuario_id"
      });
    }

    let fotoFinal = textoSeguro(foto_url);

    if (foto_base64) {
      fotoFinal = await subirFotoBase64(foto_base64);
    }

    const registro = {
      tipo_publicacion,
      nombre: textoSeguro(nombre),
      tipo_animal: textoSeguro(tipo_animal),
      edad_aproximada: textoSeguro(edad_aproximada),
      sexo: textoSeguro(sexo),
      tamanio: textoSeguro(tamanio),
      color: textoSeguro(color),
      caracteristicas: textoSeguro(caracteristicas),
      lugar: textoSeguro(lugar),
      fecha_evento: textoSeguro(fecha_evento),
      personalidad: textoSeguro(personalidad),
      informacion_salud: textoSeguro(informacion_salud),
      descripcion: textoSeguro(descripcion),
      contacto: textoSeguro(contacto),
      foto_url: fotoFinal,
      usuario_id: String(usuario_id),
      estado: "activa"
    };

    const { data, error } = await supabase
      .from("mascotas")
      .insert([registro])
      .select()
      .single();

    if (error) {
      return responderError(res, error, "No se pudo guardar la mascota");
    }

    const usuario = String(usuario_id);

    await registrarAccion(
      usuario,
      `publico_${tipo_publicacion}`,
      data.id,
      {
        tipo_publicacion,
        nombre: registro.nombre
      }
    );

    // Primera publicación
    const { data: publicaciones } = await supabase
      .from("acciones_usuario")
      .select("id")
      .eq("usuario_externo", usuario)
      .like("accion", "publico_%");

    const cantidadPublicaciones = publicaciones?.length || 0;

    if (cantidadPublicaciones >= 1) {
      await desbloquearInsignia(usuario, "primera_huella");
    }

    if (tipo_publicacion === "perdida") {
      await desbloquearInsignia(usuario, "alerta_activa");
    }

    if (tipo_publicacion === "encontrada") {
      await desbloquearInsignia(usuario, "rastreador");
    }

    if (tipo_publicacion === "adopcion") {
      await desbloquearInsignia(usuario, "hogar_cambia_vidas");
    }

    res.status(201).json({
      correcto: true,
      mensaje: "Mascota publicada correctamente 🐾",
      mascota: data
    });
  } catch (error) {
    responderError(res, error, "Error al crear la publicación");
  }
});

// --------------------------------------------------
// MASCOTAS - CAMBIAR ESTADO + ACCIONES + LOGROS
// --------------------------------------------------

app.patch("/api/mascotas/:id/estado", async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, usuario_id } = req.body;

    if (!usuario_id) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Falta el usuario_id"
      });
    }

    const estadosValidos = [
      "activa",
      "encontrada",
      "entregada",
      "adoptada",
      "cerrada"
    ];

    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        correcto: false,
        mensaje: "Estado no válido"
      });
    }

    const { data: mascota, error: errorMascota } = await supabase
      .from("mascotas")
      .select("*")
      .eq("id", id)
      .single();

    if (errorMascota || !mascota) {
      return res.status(404).json({
        correcto: false,
        mensaje: "Mascota no encontrada"
      });
    }

    // Seguridad básica: solo quien publicó puede cerrar su publicación.
    if (String(mascota.usuario_id) !== String(usuario_id)) {
      return res.status(403).json({
        correcto: false,
        mensaje: "No puedes cambiar el estado de esta publicación"
      });
    }

    if (mascota.estado === estado) {
      return res.json({
        correcto: true,
        mensaje: "La mascota ya tenía ese estado.",
        mascota
      });
    }

    const { data: actualizada, error: errorUpdate } = await supabase
      .from("mascotas")
      .update({
        estado,
        actualizado_en: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (errorUpdate) {
      return responderError(res, errorUpdate, "No se pudo actualizar el estado");
    }

    const usuario = String(usuario_id);
    let accion = `cambio_estado_${estado}`;
    let insignia = null;
    let recompensa = null;

    // PERDIDA → ENCONTRADA
    if (
      mascota.tipo_publicacion === "perdida" &&
      estado === "encontrada"
    ) {
      accion = "mascota_encontrada";
      insignia = "corazon_animal";
      recompensa = "ayuda_familia";
    }

    // ENCONTRADA → ENTREGADA
    if (
      mascota.tipo_publicacion === "encontrada" &&
      estado === "entregada"
    ) {
      accion = "mascota_entregada";
      insignia = "protector_patitas";
      recompensa = "protector_patitas";
    }

    // ADOPCIÓN → ADOPTADA
    if (
      mascota.tipo_publicacion === "adopcion" &&
      estado === "adoptada"
    ) {
      accion = "adopcion_concretada";
      insignia = "hogar_cambia_vidas";
      recompensa = "hogar_cambia_vidas";
    }

    await registrarAccion(
      usuario,
      accion,
      mascota.id,
      {
        estado_anterior: mascota.estado,
        estado_nuevo: estado,
        tipo_publicacion: mascota.tipo_publicacion,
        nombre: mascota.nombre || null
      }
    );

    if (insignia) {
      await desbloquearInsignia(usuario, insignia);
    }

    if (recompensa) {
      await asignarRecompensa(usuario, recompensa);
    }

    res.json({
      correcto: true,
      mensaje: "Estado actualizado correctamente ✅",
      mascota: actualizada,
      accion_registrada: accion,
      insignia_desbloqueada: insignia,
      recompensa_generada: recompensa
    });
  } catch (error) {
    responderError(res, error, "Error al actualizar estado");
  }
});

// --------------------------------------------------
// ACCIONES
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

    const ok = await registrarAccion(
      usuario_externo,
      accion,
      mascota_id,
      datos || {}
    );

    if (!ok) {
      return res.status(500).json({
        correcto: false,
        mensaje: "No se pudo registrar la acción"
      });
    }

    res.status(201).json({
      correcto: true,
      mensaje: "Acción registrada ✅"
    });
  } catch (error) {
    responderError(res, error, "Error al registrar acción");
  }
});

app.get("/api/acciones/:usuario", async (req, res) => {
  try {
    const { usuario } = req.params;

    const { data, error } = await supabase
      .from("acciones_usuario")
      .select("*")
      .eq("usuario_externo", usuario)
      .order("creado_en", { ascending: false });

    if (error) {
      return responderError(res, error, "No se pudieron obtener las acciones");
    }

    res.json({
      correcto: true,
      total: data.length,
      acciones: data
    });
  } catch (error) {
    responderError(res, error, "Error al obtener acciones");
  }
});

// --------------------------------------------------
// INSIGNIAS
// --------------------------------------------------

app.get("/api/insignias", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("insignias")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return responderError(res, error, "No se pudieron obtener las insignias");
    }

    res.json({ correcto: true, insignias: data });
  } catch (error) {
    responderError(res, error, "Error al obtener insignias");
  }
});

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
    responderError(res, error, "Error al obtener insignias del usuario");
  }
});

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

    const nueva = await desbloquearInsignia(
      usuario_externo,
      codigo_insignia
    );

    res.json({
      correcto: true,
      nueva,
      mensaje: nueva
        ? "¡Nueva insignia desbloqueada! 🏅"
        : "La insignia ya estaba desbloqueada o no pudo crearse."
    });
  } catch (error) {
    responderError(res, error, "Error al desbloquear insignia");
  }
});

// --------------------------------------------------
// RECOMPENSAS
// --------------------------------------------------

app.get("/api/recompensas", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("recompensas")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return responderError(res, error, "No se pudieron obtener las recompensas");
    }

    res.json({ correcto: true, recompensas: data });
  } catch (error) {
    responderError(res, error, "Error al obtener recompensas");
  }
});

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
    responderError(res, error, "Error al obtener recompensas del usuario");
  }
});

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

    const nueva = await asignarRecompensa(
      usuario_externo,
      codigo_recompensa
    );

    res.json({
      correcto: true,
      nueva,
      mensaje: nueva
        ? "¡Recompensa generada! 🎁"
        : "La recompensa ya existía o no pudo generarse."
    });
  } catch (error) {
    responderError(res, error, "Error al asignar recompensa");
  }
});

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
    responderError(res, error, "Error al actualizar recompensa");
  }
});

// --------------------------------------------------
// 404
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    correcto: false,
    mensaje: "Ruta no encontrada",
    ruta: req.originalUrl
  });
});

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🐾 Patitas S.I. funcionando en el puerto ${PORT}`);
  await prepararLogros();
});
