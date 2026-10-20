import { z } from 'zod';

// This module runs in the browser (geolocation + fetch from a client-side dialog), so it
// cannot import the canonical logger under `#lib/server/`. Failures are rethrown with the
// original error as `cause`, and the caller shows the message in a toast.
const weatherMap: Record<number, { label: string; icon: string }> = {
	0: { label: 'Clear sky', icon: '☀️' },
	1: { label: 'Mainly clear', icon: '🌤️' },
	2: { label: 'Partly cloudy', icon: '⛅' },
	3: { label: 'Overcast', icon: '☁️' },
	45: { label: 'Fog', icon: '🌫️' },
	48: { label: 'Depositing rime fog', icon: '🌫️' },
	51: { label: 'Light drizzle', icon: '🌦️' },
	61: { label: 'Slight rain', icon: '🌧️' },
	63: { label: 'Moderate rain', icon: '🌧️' },
	65: { label: 'Heavy rain', icon: '🌧️' },
	71: { label: 'Slight snow', icon: '❄️' },
	95: { label: 'Thunderstorm', icon: '⛈️' }
	// Add more codes as needed from WMO standards
};

const currentWeatherResponseSchema = z.object({
	current_weather: z.object({
		temperature: z.number(),
		weathercode: z.number()
	})
});

type JournalWeather = {
	temperature: number;
	condition: string;
};

function getCurrentPosition(): Promise<GeolocationPosition> {
	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		throw new TypeError('Geolocation is not supported by your browser.');
	}

	return new Promise((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(resolve, reject);
	});
}

export async function getCurrentWeather(): Promise<JournalWeather> {
	try {
		const position = await getCurrentPosition();
		const { latitude, longitude } = position.coords;

		const weatherResponse = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
		);

		if (!weatherResponse.ok) {
			throw new TypeError('Unable to retrieve weather information.');
		}

		const weatherData = currentWeatherResponseSchema.safeParse(await weatherResponse.json());
		if (!weatherData.success) {
			throw new TypeError('Unable to retrieve weather information.');
		}
		const { temperature, weathercode: weatherCode } = weatherData.data.current_weather;

		const weatherEntry = weatherMap[weatherCode];
		const condition = weatherEntry ? `${weatherEntry.label} ${weatherEntry.icon}` : 'Unknown';

		return {
			temperature,
			condition
		};
	} catch (error) {
		throw new TypeError('Unable to retrieve your location for weather information.', {
			cause: error
		});
	}
}
