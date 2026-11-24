const ATTEMPTS = 3;

export async function fetchWithRetry(url, { attempts = ATTEMPTS, pause = attempt => attempt * 2000, fetcher = fetch } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetcher(url, { headers: { accept: 'application/json' } });
    } catch (error) {
      if (attempt >= attempts) throw error;

      console.log(`  ${url} failed (${error.message}), trying again`);
      await new Promise(resolve => setTimeout(resolve, pause(attempt)));
    }
  }
}
