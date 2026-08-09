# API reference

Animer exposes server-side endpoints through the Next.js App Router. All examples assume a local server at `http://localhost:3000`.

## Conventions

- JSON endpoints use `application/json`.
- Error responses use `{ "error": "..." }` and may include `detail` for recommendation and search failures.
- MyAnimeList (MAL) IDs and AniList IDs are different. Request seeds use MAL IDs. The `id` in a v2 recommendation is the internal AniList ID; use `malId` when calling feedback.
- Authentication is cookie-based. OAuth routes set HTTP-only cookies, so browser requests need no `Authorization` header.

## Recommendation endpoints

### `POST /api/recommend/v2`

The primary recommendation endpoint. It retrieves collaborative-filtering and synopsis matches, fuses their ranks, applies code-side filters, and optionally asks Groq to select and explain the final results.

#### Request body

| Field | Type | Required | Behavior |
| --- | --- | --- | --- |
| `likedAnimeIds` | `number[]` | Yes | Non-empty array of seed MAL IDs. |
| `likedScores` | `number[]` | No | Ratings aligned with `likedAnimeIds`. If missing or the length differs, every seed receives a score of `9`. Scores are used as centered vector weights and are not range-clamped by the route. |
| `excludeMalIds` | `number[]` | No | Additional MAL IDs to remove. Seed IDs are always excluded automatically. |
| `favoriteMalId` | `number` | No | Marks one seed as the quiz favorite in the LLM prompt. |
| `userText` | `string` | No | Free-form preference text; trimmed and limited to 500 characters. |
| `quiz.hookedBy` | `string` | No | A structured or free-form description; trimmed and limited to 200 characters. |
| `quiz.mood` | `string[]` | No | Mood labels passed to the reranker. |
| `quiz.dislikes` | `string[]` | No | Dislike labels. Supported UI labels such as `Mecha` and `Sports` are also enforced as code-side genre filters. |

```bash
curl -X POST http://localhost:3000/api/recommend/v2 \
  -H 'Content-Type: application/json' \
  -d '{
    "likedAnimeIds": [4224, 23273],
    "likedScores": [10, 9],
    "favoriteMalId": 4224,
    "excludeMalIds": [5114],
    "quiz": {
      "hookedBy": "characters",
      "mood": ["Emotional", "Chill"],
      "dislikes": ["Mecha"]
    },
    "userText": "Something heartfelt for tonight"
  }'
```

#### Success response

```json
{
  "results": [
    {
      "id": 1234,
      "malId": 5678,
      "title": "Anime title",
      "imageUrl": "https://example.com/cover.jpg",
      "score": 84,
      "year": 2023,
      "synopsis": "...",
      "genres": ["Drama", "Romance"],
      "reason": "A personalized sentence, or a semantic-match fallback."
    }
  ],
  "llmUsed": true,
  "thinking": "A short summary of how the model interpreted the user's taste.",
  "engineUsed": "hybrid"
}
```

`engineUsed` is `hybrid`, `cf`, or `synopsis`, based on which retrievers returned candidates. If no candidates are available, the response is `{ "results": [], "engineUsed": "..." }`; the optional fields are absent in that branch.

When `GROQ_API_KEY` is absent in development or the Groq pipeline fails, the route still returns the first embedding-ranked results. In that case `llmUsed` is `false`, `thinking` is empty, and each reason is a semantic-similarity fallback.

#### Errors

| Status | Meaning |
| --- | --- |
| `400` | `likedAnimeIds` is missing, empty, or not an array of finite numbers. |
| `500` | Candidate retrieval or supporting database work failed. |

### `POST /api/recommend/fromlist`

Builds the v2 request from the authenticated user's MAL list. It fetches the completed and currently-watching lists; all rated completed titles become weighted seeds, while completed and watching IDs are excluded from results.

The optional JSON body accepts `favoriteMalId`, `userText`, and `quiz` with the same meanings as v2.

The normal response is the v2 response plus `seeds`, the 15 highest-rated completed entries used by the quiz UI:

```json
{
  "results": [],
  "llmUsed": false,
  "thinking": "",
  "engineUsed": "hybrid",
  "seeds": [
    {
      "id": 4224,
      "title": "Toradora!",
      "imageUrl": "https://example.com/cover.jpg",
      "score": 10
    }
  ]
}
```

#### Seed-only mode

`POST /api/recommend/fromlist?seeds_only=1` stops before recommendation retrieval and returns `{ "seeds": [...] }`. A request body is optional.

#### Errors

| Status | Meaning |
| --- | --- |
| `401` | No MAL access-token cookie is present. |
| `400` | The account has no completed titles, or none of its completed titles are rated. |
| Other | Errors from v2 are forwarded with their original status. |

## Search

### `GET /api/search?q=<title>`

Searches Jikan for up to ten anime and normalizes the result.

```json
{
  "results": [
    {
      "id": 1,
      "title": "Cowboy Bebop",
      "synopsis": "...",
      "imageUrl": "https://example.com/cover.jpg",
      "score": 8.75,
      "year": 1998
    }
  ]
}
```

A missing or blank `q` returns `400`. Jikan failures return `500`.

## Feedback

### `POST /api/feedback`

Stores one current reaction per user and anime. Reactions are upserted; `none` deletes the existing row.

| Field | Type | Required | Behavior |
| --- | --- | --- | --- |
| `animeMalId` | `number` | Yes | A finite MAL ID. |
| `signal` | `"up" \| "down" \| "not_interested" \| "none"` | Yes | Reaction to store, or `none` to clear it. |
| `userKey` | `string` | Yes | Browser-persistent anonymous key; limited to 80 characters server-side. |
| `seedMalIds` | `number[]` | No | Context for training; numeric values only, limited to 20. |
| `engineUsed` | `string` | No | Retrieval context; limited to 20 characters. |

```bash
curl -X POST http://localhost:3000/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{
    "animeMalId": 9253,
    "signal": "up",
    "userKey": "anon:example",
    "seedMalIds": [4224, 23273],
    "engineUsed": "hybrid"
  }'
```

A stored reaction returns `{ "ok": true, "signal": "up" }`. Clearing returns `{ "ok": true, "signal": null }`. Invalid input returns `400`; Supabase failures return `500`.

## MyAnimeList authentication

### `GET /api/auth/login`

Creates a PKCE verifier and CSRF state, stores both in ten-minute HTTP-only cookies, then redirects to MAL. The redirect URI is derived from the incoming request origin and ends in `/api/auth/callback`.

MAL supports the `plain` PKCE method used here, not `S256`.

### `GET /api/auth/callback`

Validates the OAuth state, exchanges the authorization code, stores `mal_access_token` and `mal_refresh_token` as HTTP-only cookies, clears the temporary PKCE cookies, and redirects to `/dashboard`.

Invalid callback state redirects to `/?error=auth_failed`; token-exchange failure redirects to `/?error=token_failed`. The app stores the refresh token but does not currently implement token refresh.

### `GET /api/auth/logout`

Deletes both MAL token cookies and redirects to `/`.

### `GET /api/auth/me`

Fetches the current MAL profile, including anime statistics.

```json
{
  "user": {
    "id": 12345,
    "name": "username",
    "picture": "https://example.com/avatar.jpg",
    "anime_statistics": {}
  }
}
```

Missing or rejected credentials return `401` with `{ "user": null }`.

## MAL list

### `GET /api/mal/animelist`

Returns every **completed** anime in the authenticated user's list, following MAL pagination until no next page remains. Fields include list score, community mean, genres, episode count, and cover images.

```json
{
  "anime": [
    {
      "node": {
        "id": 1,
        "title": "Cowboy Bebop",
        "mean": 8.75,
        "genres": [{ "id": 1, "name": "Action" }]
      },
      "list_status": { "score": 9 }
    }
  ]
}
```

No session returns `401`; an upstream MAL error is forwarded using MAL's status code.

## Health check

### `GET /api/health`

Returns `200` with:

```json
{ "ok": true, "message": "API is working" }
```

This checks that the Next.js route is running. It does not probe Supabase, Groq, Jikan, AniList, or MAL.

## Legacy routes

- `POST /api/recommend` is the original Jikan-based recommender.
- `POST /api/recommend/anilist` is the earlier AniList genre/tag recommender.

They remain in the repository for experimentation but are not used by the current recommendation UI. New integrations should use `/api/recommend/v2`.
