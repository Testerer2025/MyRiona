export const getPostGenerationSchema = () => ({
  type: "object",
  properties: {
    postText: {
      type: "string",
      description: "Der Instagram-Post-Text in maximal 450 Zeichen"
    },
    hashtags: {
      type: "array",
      items: { type: "string" },
      description: "Array von 3 Hashtags ohne # Symbol"
    },
    tone: {
      type: "string",
      description: "Der verwendete Ton (z.B. casual, friendly, exciting)"
    }
  },
  required: ["postText", "hashtags", "tone"]
});

export const getSimilarityCheckSchema = () => ({
  type: "object",
  properties: {
    avoidKeywords: {
      type: "array",
      items: { type: "string" },
      description: "Keywords die vermieden werden sollten"
    },
    avoidThemes: {
      type: "array",
      items: { type: "string" },
      description: "Themen die vermieden werden sollten"
    },
    recommendation: {
      type: "string",
      description: "Empfehlung für einen neuen, unterschiedlichen Ansatz"
    }
  },
  required: ["avoidKeywords", "avoidThemes", "recommendation"]
});