import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({limit:"10mb"}));
app.use(express.static(__dirname));

app.post("/api/chat", async (req,res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({error:"Clé API manquante"});
  try {
    const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const input = (req.body.messages || []).slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.text || "")
    }));
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: "Tu es BRYSS AI, un assistant polyvalent, clair, fiable et bienveillant. Réponds dans la langue de l'utilisateur.",
      input
    });
    res.json({reply: response.output_text || "Je n'ai pas pu générer de réponse."});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:"Erreur du moteur IA"});
  }
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`BRYSS AI disponible sur http://localhost:${port}`));
