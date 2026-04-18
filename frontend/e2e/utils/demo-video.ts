import type { Page } from '@playwright/test'

type Scene = {
  title: string
  body: string
}

export async function showSceneCaption(page: Page, scene: Scene) {
  await page.evaluate(({ title, body }) => {
    const existing = document.getElementById('__competition-demo-caption')
    if (existing) {
      existing.remove()
    }

    const container = document.createElement('div')
    container.id = '__competition-demo-caption'
    container.setAttribute(
      'style',
      [
        'position:fixed',
        'left:32px',
        'bottom:32px',
        'z-index:2147483647',
        'max-width:560px',
        'padding:18px 22px',
        'border-radius:20px',
        'background:rgba(7, 10, 18, 0.88)',
        'backdrop-filter:blur(10px)',
        'border:1px solid rgba(255,255,255,0.12)',
        'box-shadow:0 18px 60px rgba(0,0,0,0.35)',
        'color:#f8fafc',
        'font-family:Manrope, system-ui, sans-serif',
        'pointer-events:none',
      ].join(';'),
    )

    const eyebrow = document.createElement('div')
    eyebrow.textContent = 'Competition Demo'
    eyebrow.setAttribute(
      'style',
      [
        'font-size:12px',
        'letter-spacing:0.18em',
        'text-transform:uppercase',
        'color:#fbbf24',
        'margin-bottom:8px',
        'font-weight:700',
      ].join(';'),
    )

    const heading = document.createElement('div')
    heading.textContent = title
    heading.setAttribute(
      'style',
      [
        'font-size:30px',
        'line-height:1.1',
        'font-weight:800',
        'margin-bottom:8px',
      ].join(';'),
    )

    const copy = document.createElement('div')
    copy.textContent = body
    copy.setAttribute(
      'style',
      [
        'font-size:15px',
        'line-height:1.5',
        'color:rgba(248,250,252,0.88)',
      ].join(';'),
    )

    container.append(eyebrow, heading, copy)
    document.body.append(container)
  }, scene)
}

export async function clearSceneCaption(page: Page) {
  await page.evaluate(() => {
    document.getElementById('__competition-demo-caption')?.remove()
  })
}

export async function holdScene(page: Page, scene: Scene, durationMs = 2_000) {
  await showSceneCaption(page, scene)
  await page.waitForTimeout(durationMs)
}

export async function slowScroll(
  page: Page,
  {
    distance = 1_200,
    steps = 4,
    pauseMs = 550,
  }: {
    distance?: number
    steps?: number
    pauseMs?: number
  } = {},
) {
  const stepDistance = Math.round(distance / steps)
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, stepDistance)
    await page.waitForTimeout(pauseMs)
  }
}
