const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    app: "Patitas S.I.",
    estado: "online",
    mensaje: "Servidor funcionando correctamente 🐾"
  });
});

app.get("/api/prueba", (req, res) => {
  res.json({
    correcto: true,
    mensaje: "Patitas S.I. está conectado al servidor ✅"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🐾 Patitas S.I. funcionando en el puerto ${PORT}`);
});