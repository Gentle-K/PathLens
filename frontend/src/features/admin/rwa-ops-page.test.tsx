import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RwaOpsPage } from '@/features/admin/rwa-ops-page'
import { renderWithProviders } from '@/tests/test-utils'

describe('RwaOpsPage', () => {
  it('renders the protected ops console sections', async () => {
    renderWithProviders(<RwaOpsPage />)

    expect(screen.getByText('RWA Ops Console')).toBeInTheDocument()
    expect(await screen.findByText('Proof Queue')).toBeInTheDocument()
    expect(screen.getByText('Indexer Health')).toBeInTheDocument()
    expect(screen.getByText('Contract Anchors')).toBeInTheDocument()
  })
})
