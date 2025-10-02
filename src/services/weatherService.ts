import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "../config/logger";
import { geminiApiKeys } from "../secret";

export interface WeatherData {
  condition: 'good' | 'bad';
  temperature: number;
  description: string;
  details: {
    sky: string; // 'sonnig', 'bewölkt', 'regnerisch'
    wind: string; // 'schwach', 'mäßig', 'stark'
    precipitation: boolean;
  };
}

class WeatherService {
  private currentApiKeyIndex = 0;

  /**
   * Get next Gemini API key
   */
  private getApiKey(): string {
    const key = geminiApiKeys[this.currentApiKeyIndex];
    if (!key) {
      throw new Error('No Gemini API key available');
    }
    return key;
  }

  /**
   * Rotate to next API key
   */
  private rotateApiKey(): void {
    this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % geminiApiKeys.length;
    logger.info(`Rotated to API key ${this.currentApiKeyIndex + 1}`);
  }

  /**
   * Fetch current weather for Dübendorf using Gemini with web search
   */
  async getCurrentWeather(): Promise<WeatherData> {
    const prompt = `Suche im Web nach dem aktuellen Wetter in Dübendorf, Schweiz.

Analysiere die Wetterdaten und antworte NUR mit einem gültigen JSON-Objekt in diesem Format:
{
  "temperature": 22,
  "sky": "sonnig",
  "wind": "schwach",
  "precipitation": false,
  "description": "Sonnig bei 22°C"
}

Wichtig:
- temperature: Aktuelle Temperatur in Celsius (Zahl)
- sky: "sonnig", "bewölkt", "teilweise bewölkt", "regnerisch", "neblig"
- wind: "schwach" (< 20 km/h), "mäßig" (20-30 km/h), "stark" (> 30 km/h)
- precipitation: true wenn Regen/Schnee, sonst false
- description: Kurze Zusammenfassung auf Deutsch`;

    try {
      const googleAI = new GoogleGenerativeAI(this.getApiKey());
      const model = googleAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp"
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
      const data = JSON.parse(jsonStr);

      // Determine condition based on criteria
      const condition = this.determineCondition(
        data.temperature,
        data.sky,
        data.wind,
        data.precipitation
      );

      const weatherData: WeatherData = {
        condition,
        temperature: data.temperature,
        description: data.description,
        details: {
          sky: data.sky,
          wind: data.wind,
          precipitation: data.precipitation
        }
      };

      logger.info(`Weather fetched for Dübendorf: ${weatherData.description} → ${condition}`);
      return weatherData;

    } catch (error: any) {
      if (error.message?.includes('429')) {
        this.rotateApiKey();
        return this.getCurrentWeather(); // Retry with new key
      }
      logger.error('Weather fetch failed:', error);
      throw new Error('Failed to fetch weather data');
    }
  }

  /**
   * Determine if weather is "good" or "bad" based on criteria
   */
  private determineCondition(
    temp: number,
    sky: string,
    wind: string,
    precipitation: boolean
  ): 'good' | 'bad' {
    // Regen = immer schlecht
    if (precipitation) {
      logger.info('Weather is BAD: Precipitation detected');
      return 'bad';
    }

    // Starker Wind = schlecht (Terrasse unangenehm)
    if (wind === 'stark') {
      logger.info('Weather is BAD: Strong wind');
      return 'bad';
    }

    // Zu kalt = schlecht
    if (temp < 18) {
      logger.info(`Weather is BAD: Too cold (${temp}°C)`);
      return 'bad';
    }

    // Perfekt: >= 22°C + sonnig
    if (temp >= 22 && sky === 'sonnig') {
      logger.info(`Weather is GOOD: Perfect conditions (${temp}°C, ${sky})`);
      return 'good';
    }

    // Gut: >= 20°C + bewölkt
    if (temp >= 20 && (sky === 'bewölkt' || sky === 'teilweise bewölkt')) {
      logger.info(`Weather is GOOD: Acceptable (${temp}°C, ${sky})`);
      return 'good';
    }

    // Grenzfall: 18-22°C + sonnig
    if (temp >= 18 && temp < 22 && sky === 'sonnig') {
      logger.info(`Weather is GOOD: Border case (${temp}°C, ${sky})`);
      return 'good';
    }

    // Default: Alles andere = schlecht
    logger.info(`Weather is BAD: Default case (${temp}°C, ${sky}, ${wind})`);
    return 'bad';
  }
}

export const weatherService = new WeatherService();