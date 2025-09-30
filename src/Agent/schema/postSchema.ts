export const getPostGenerationSchema = () => ({
  type: "OBJECT" as const,
  properties: {
    postText: {
      type: "STRING" as const,
      description: "Der Instagram-Post-Text in maximal 450 Zeichen"
    },
    hashtags: {
      type: "ARRAY" as const,
      items: { type: "STRING" as const },
      description: "Array von 3 Hashtags ohne # Symbol"
    },
    tone: {
      type: "STRING" as const,
      description: "Der verwendete Ton (z.B. casual, friendly, exciting)"
    }
  },
  required: ["postText", "hashtags", "tone"]
});

export const getSimilarityCheckSchema = () => ({
  type: "OBJECT" as const,
  properties: {
    avoidKeywords: {
      type: "ARRAY" as const,
      items: { type: "STRING" as const },
      description: "Keywords die vermieden werden sollten"
    },
    avoidThemes: {
      type: "ARRAY" as const,
      items: { type: "STRING" as const },
      description: "Themen die vermieden werden sollten"
    },
    recommendation: {
      type: "STRING" as const,
      description: "Empfehlung für einen neuen, unterschiedlichen Ansatz"
    }
  },
  required: ["avoidKeywords", "avoidThemes", "recommendation"]
});