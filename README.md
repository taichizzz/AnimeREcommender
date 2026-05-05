# Anime Recommender

Anime Recommender is a Next.js app that helps users find new anime based on shows they already like. Users can search for anime, select up to three favorites, and generate recommendations using data from the Jikan API, an unofficial MyAnimeList API.

## Features

- Search anime by title using Jikan/MyAnimeList data.
- Select up to 3 anime as preference inputs.
- Generate recommendations from fan recommendation signals and genre similarity.
- Show recommendation details including title, poster image, score, year, and a short reason.
- Filter out many sequel, recap, special, OVA, ONA, and movie-style results to keep recommendations focused on mainline shows.
- Includes simple API health checking.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Jikan API

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

```bash
npm run dev
```

Runs the app locally with IPv4 DNS preference enabled for Jikan API requests.

```bash
npm run build
```

Builds the production app.

```bash
npm run start
```

Starts the production server after a build.

```bash
npm run lint
```

Runs ESLint.

## API Routes

### `GET /api/search?q=<query>`

Searches Jikan for anime matching the query.

Returns:

```json
{
  "results": [
    {
      "id": 20,
      "title": "Naruto",
      "synopsis": "...",
      "imageUrl": "https://...",
      "score": 7.99,
      "year": 2002
    }
  ]
}
```

### `POST /api/recommend`

Generates recommendations from selected anime IDs.

Request body:

```json
{
  "likedAnimeIds": [20, 16498, 5114]
}
```

Returns:

```json
{
  "results": [
    {
      "id": 1535,
      "title": "Death Note",
      "imageUrl": "https://...",
      "score": 8.62,
      "year": 2006,
      "reason": "Recommended by fans of: ..."
    }
  ]
}
```

### `GET /api/health`

Returns a simple health response:

```json
{
  "ok": true,
  "message": "API is working"
}
```

## Recommendation Notes

Recommendations are built from two main signals:

- Related anime recommended by Jikan/MyAnimeList users.
- High-scoring anime from genres shared by the selected favorites.

The recommendation route also uses a small in-memory cache and retry delay to reduce repeated API calls and handle temporary rate limits.

Jikan may still rate-limit requests, especially when generating recommendations from multiple selected anime. If that happens, wait a few seconds and try again.

## Current Limitations

- Recommendations depend on Jikan API availability and rate limits.
- Filtering sequel or special titles is heuristic, so some unwanted titles may still appear.
- The in-memory cache is process-local and resets when the server restarts.
- No user accounts, saved lists, or persistent recommendation history are included yet.
