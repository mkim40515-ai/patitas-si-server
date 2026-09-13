const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/*
  CONEXIÓN SEGURA CON SUPABASE
  Las claves están en las Variables de Railway.
*/
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("❌ Faltan las variables de Supabase.");
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey
);

// ==========================================
// RUTA PRINCIPAL
// ==========================================

app.get("/", (req, res) => {
  res.json({
    app: "Patitas S.I.",
    estado: "online",
    mensaje: "Servidor funcionando correctamente 🐾"
  });
});

// ==========================================
// PRUEBA DE CONEXIÓN CON SUPABASE
// ==========================================

app.get("/api/prueba", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("insignias")
      .select("codigo,nombre")
      .limit(10);

    if (error) {
      console.error("Error Supabase:", error);

      return res.status(500).json({
        correcto: false,
        error: error.message
      });
    }

    res.json({
      correcto: true,
      mensaje: "Railway está conectado con Supabase ✅",
      insignias: data
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      correcto: false,
      error: "Error interno del servidor"
    });
  }
});

// ==========================================
// LISTAR MASCOTAS
// ==========================================

app.get("/api/mascotas", async (req, res) => {
  try {

    const { tipo, estado } = req.query;

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
      return res.status(500).json({
        correcto: false,
        error: error.message
      });
    }

    res.json({
      correcto: true,
      mascotas: data
    });

  } catch (error) {

    res.status(500).json({
      correcto: false,
      error: "No se pudieron obtener las mascotas"
    });

  }
});

// ==========================================
// CREAR MASCOTA
// ==========================================

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

    if (!tipo_publicacion) {

      return res.status(400).json({
        correcto: false,
        error: "Falta el tipo de publicación"
      });

    }

    const { data, error } = await supabase
      .from("mascotas")
      .insert([{
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
      }])
      .select()
      .single();

    if (error) {

      return res.status(500).json({
        correcto: false,
        error: error.message
      });

    }

    res.status(201).json({
      correcto: true,
      mensaje: "Mascota publicada correctamente 🐾",
      mascota: data
    });

  } catch (error) {

    res.status(500).json({
      correcto: false,
      error: "No se pudo crear la publicación"
    });

  }

});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🐾 Patitas S.I. funcionando en el puerto ${PORT}`);
});