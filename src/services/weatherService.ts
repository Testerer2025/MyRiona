import axios from 'axios';
import logger from "../config/logger";

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
  private readonly API_KEY = process.env.WEATHERAPI_KEY;
  private readonly LOCATION = 'Dübendorf,Switzerland';

  /**
   * Fetch current weather for Dübendorf using WeatherAPI.com
   */
  async getCurrentWeather(): Promise<WeatherData> {
    if (!this.API_KEY) {
      throw new Error('WEATHERAPI_KEY not set in environment variables');
    }

    try {
      // Call WeatherAPI.com current weather endpoint
      const response = await axios.get('https://api.weatherapi.com/v1/current.json', {
        params: {
          key: this.API_KEY,
          q: this.LOCATION,
          lang: 'de'
        }
      });

      const data = response.data;

      // Extract weather data
      const temperature = Math.round(data.current.temp_c);
      const conditionText = data.current.condition.text; // German description
      const conditionCode = data.current.condition.code; // Numeric code for precise identification
      const windSpeedKmh = data.current.wind_kph;
      const isRaining = data.current.precip_mm > 0;

      // Map weather to German sky description
      const sky = this.mapConditionToSky(conditionCode, conditionText);
      const wind = this.mapWindSpeed(windSpeedKmh);
      const precipitation = isRaining || sky === 'regnerisch';

      // Determine condition based on criteria
      const condition = this.determineCondition(temperature, sky, wind, precipitation);

      const weatherData: WeatherData = {
        condition,
        temperature,
        description: `${conditionText} bei ${temperature}°C`,
        details: {
          sky,
          wind,
          precipitation
        }
      };

      logger.info(`Weather fetched for Dübendorf: ${weatherData.description} → ${condition}`);
      logger.debug(`Raw data: temp=${temperature}°C, sky=${sky}, wind=${windSpeedKmh} km/h, precip=${isRaining}`);
      
      return weatherData;

    } catch (error: any) {
      logger.error('Weather fetch failed:', error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid WeatherAPI.com API key');
      }
      
      throw new Error(`Failed to fetch weather data: ${error.message}`);
    }
  }

  /**
   * Map WeatherAPI condition code to German sky description
   * Full list: https://www.weatherapi.com/docs/weather_conditions.json
   */
  private mapConditionToSky(code: number, text: string): string {
    // Sunny/Clear
    if (code === 1000) return 'sonnig';
    
    // Partly cloudy
    if (code === 1003) return 'teilweise bewölkt';
    
    // Cloudy/Overcast
    if ([1006, 1009].includes(code)) return 'bewölkt';
    
    // Mist/Fog
    if ([1030, 1135, 1147].includes(code)) return 'neblig';
    
    // Rain (any type)
    if ([1063, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246, 1273, 1276].includes(code)) {
      return 'regnerisch';
    }
    
    // Snow
    if ([1066, 1069, 1072, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264, 1279, 1282].includes(code)) {
      return 'regnerisch'; // Snow counts as bad weather
    }
    
    // Thunderstorm
    if ([1087, 1273, 1276, 1279, 1282].includes(code)) {
      return 'regnerisch';
    }
    
    // Fallback based on text
    const lowerText = text.toLowerCase();
    if (lowerText.includes('regen') || lowerText.includes('rain')) return 'regnerisch';
    if (lowerText.includes('sonnig') || lowerText.includes('klar') || lowerText.includes('sunny')) return 'sonnig';
    if (lowerText.includes('bewölkt') || lowerText.includes('wolkig') || lowerText.includes('cloudy')) return 'bewölkt';
    if (lowerText.includes('nebel') || lowerText.includes('fog')) return 'neblig';
    
    return 'bewölkt'; // Default
  }

  /**
   * Map wind speed to German description
   */
  private mapWindSpeed(windSpeedKmh: number): string {
    if (windSpeedKmh < 20) return 'schwach';
    if (windSpeedKmh < 30) return 'mäßig';
    return 'stark';
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

    // Gut: >= 20°C + bewölkt oder teilweise bewölkt
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