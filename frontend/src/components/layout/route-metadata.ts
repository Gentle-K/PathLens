export interface RouteMetadata {
  titleKey: string
}

export function routeMetadata(pathname: string): RouteMetadata {
  if (pathname.startsWith('/new-analysis')) {
    return { titleKey: 'layout.routes.newAnalysis' }
  }
  if (pathname.startsWith('/assets')) {
    return { titleKey: 'layout.routes.assets' }
  }
  if (pathname.startsWith('/portfolio')) {
    return { titleKey: 'layout.routes.portfolio' }
  }
  if (pathname.startsWith('/stocks')) {
    return { titleKey: 'layout.routes.stocks' }
  }
  if (pathname.startsWith('/sessions')) {
    return { titleKey: 'layout.routes.sessions' }
  }
  if (pathname.startsWith('/reports')) {
    return { titleKey: 'layout.routes.reports' }
  }
  if (pathname.startsWith('/evidence')) {
    return { titleKey: 'layout.routes.evidence' }
  }
  if (pathname.startsWith('/calculations')) {
    return { titleKey: 'layout.routes.calculations' }
  }
  if (pathname.startsWith('/settings')) {
    return { titleKey: 'layout.routes.settings' }
  }
  return { titleKey: 'layout.routes.workspace' }
}
