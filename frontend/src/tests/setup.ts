import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}

    unobserve() {}

    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverMock
}

window.HTMLElement.prototype.scrollIntoView = vi.fn()

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(
    () =>
      ({
        canvas: document.createElement('canvas'),
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        measureText: () => ({ width: 0 }),
        save: () => {},
        restore: () => {},
        setTransform: () => {},
        scale: () => {},
        translate: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }) as unknown as CanvasRenderingContext2D,
  ),
})
