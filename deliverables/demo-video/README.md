# Demo Video Deliverables

This folder holds the competition-ready demo recording assets for `Genius Actuary`.

## Generated video files

- `genius-actuary-competition-demo.webm`
- `genius-actuary-rest-proof-demo.webm`

## Source script

- `competition-demo-video-script-zh.md`

## Regenerate

From the repository root:

```bash
npm run demo:video
npm run demo:video:rest
```

Or generate both clips in one pass:

```bash
npm run demo:video:all
```

## Recommended submission cut

- Use `genius-actuary-competition-demo.webm` as the main judging video.
- Insert `genius-actuary-rest-proof-demo.webm` after the execution segment if you want to prove the backend-backed receipt and anchor loop.
- Keep the final exported cut around `90-120` seconds for a typical competition review.
