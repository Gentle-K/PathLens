import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import {
  DetailDrawer,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  SearchInput,
  SourceCard,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { fetchAnalysisCatalog, flattenEvidence } from '@/features/analysis/lib/catalog'
import { evidenceDomain, evidenceFreshnessMeta } from '@/features/analysis/lib/view-models'

export function EvidencePage() {
  const adapter = useApiAdapter()
  const [search, setSearch] = useState('')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [freshness, setFreshness] = useState('all')
  const [confidence, setConfidence] = useState('all')
  const [domain, setDomain] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const catalogQuery = useQuery({
    queryKey: ['analysis', 'catalog', 'evidence'],
    queryFn: () => fetchAnalysisCatalog(adapter),
  })

  const evidenceItems = useMemo(() => {
    const all = flattenEvidence(catalogQuery.data ?? { sessions: [], reportsBySession: {} })
    return all.filter(({ item, session }) => {
      const matchesSearch =
        !search ||
        `${item.title} ${item.summary} ${item.sourceName}`
          .toLowerCase()
          .includes(search.toLowerCase())
      const matchesSession = sessionFilter === 'all' || session.id === sessionFilter
      const freshnessMeta = evidenceFreshnessMeta(item)
      const matchesFreshness =
        freshness === 'all' ||
        (freshness === 'fresh' && freshnessMeta.tone === 'success') ||
        (freshness === 'aging' && freshnessMeta.tone === 'warning') ||
        (freshness === 'stale' && freshnessMeta.tone === 'danger')
      const matchesConfidence =
        confidence === 'all' ||
        (confidence === 'high' && item.confidence >= 0.82) ||
        (confidence === 'medium' && item.confidence >= 0.66 && item.confidence < 0.82) ||
        (confidence === 'low' && item.confidence < 0.66)
      const matchesDomain = domain === 'all' || evidenceDomain(item.sourceUrl) === domain

      return (
        matchesSearch &&
        matchesSession &&
        matchesFreshness &&
        matchesConfidence &&
        matchesDomain
      )
    })
  }, [catalogQuery.data, confidence, domain, freshness, search, sessionFilter])

  const selectedEvidence = evidenceItems.find(({ item }) => item.id === selectedId)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidence"
        title="Evidence library"
        description="Inspect source summaries, chain proofs, oracle references, and where each evidence item is used in the report and execution plan."
      />

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search evidence"
        />
        <Select
          value={sessionFilter}
          onChange={(event) => setSessionFilter(event.target.value)}
        >
          <option value="all">All sessions</option>
          {(catalogQuery.data?.sessions ?? []).map((session) => (
            <option key={session.id} value={session.id}>
              {session.problemStatement}
            </option>
          ))}
        </Select>
        <Select value={freshness} onChange={(event) => setFreshness(event.target.value)}>
          <option value="all">All freshness</option>
          <option value="fresh">Fresh</option>
          <option value="aging">Aging</option>
          <option value="stale">Potentially stale</option>
        </Select>
        <Select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
          <option value="all">All confidence</option>
          <option value="high">High confidence</option>
          <option value="medium">Medium confidence</option>
          <option value="low">Low confidence</option>
        </Select>
        <Select value={domain} onChange={(event) => setDomain(event.target.value)}>
          <option value="all">All domains</option>
          {Array.from(
            new Set(
              flattenEvidence(catalogQuery.data ?? { sessions: [], reportsBySession: {} }).map(
                ({ item }) => evidenceDomain(item.sourceUrl),
              ),
            ),
          ).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </FilterBar>

      {catalogQuery.isLoading ? (
        <LoadingState
          title="Loading evidence library"
          description="Preparing source summaries, freshness labels, and linked session metadata."
        />
      ) : catalogQuery.isError ? (
        <ErrorState
          title="Could not load evidence library"
          description={(catalogQuery.error as Error).message}
          action={
            <Button variant="secondary" onClick={() => void catalogQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : evidenceItems.length ? (
        <div className="space-y-4">
          {evidenceItems.map(({ item, session }) => {
            const linkedConclusionCount = session.conclusions.filter((conclusion) =>
              conclusion.basisRefs.includes(item.id),
            ).length

            return (
              <SourceCard
                key={item.id}
                item={item}
                linkedConclusionCount={linkedConclusionCount}
                sessionTitle={session.problemStatement}
                onOpen={() => setSelectedId(item.id)}
              />
            )
          })}
        </div>
      ) : (
        <EmptyState
          title={search ? 'No matching evidence' : 'No evidence available'}
          description={
            search
              ? 'Try a different search term or relax one of the evidence filters.'
              : 'Evidence will appear here after sessions start collecting source summaries.'
          }
        />
      )}

      <DetailDrawer
        open={Boolean(selectedEvidence)}
        onClose={() => setSelectedId(null)}
        title={selectedEvidence?.item.title ?? 'Evidence detail'}
        description={selectedEvidence?.item.summary}
        actions={
          selectedEvidence ? (
            <a
              href={selectedEvidence.item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent-cyan"
            >
              Open source
              <ExternalLink className="size-4" />
            </a>
          ) : undefined
        }
      >
        {selectedEvidence ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Extracted facts
              </p>
              <ul className="space-y-2 text-sm leading-6 text-text-secondary">
                {selectedEvidence.item.extractedFacts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
              <div className="space-y-3 rounded-[20px] border border-border-subtle bg-bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Usage and freshness
                </p>
                <div className="space-y-2 text-sm leading-6 text-text-secondary">
                <p>Session: {selectedEvidence.session.problemStatement}</p>
                <p>
                  Linked conclusions:{' '}
                  {
                    selectedEvidence.session.conclusions.filter((conclusion) =>
                      conclusion.basisRefs.includes(selectedEvidence.item.id),
                    ).length
                  }
                </p>
                <p>
                  Included in final report:{' '}
                  {selectedEvidence.report?.evidence.some(
                    (evidence) => evidence.id === selectedEvidence.item.id,
                  )
                    ? 'Yes'
                    : 'No'}
                </p>
                <p>Fetch time: {new Date(selectedEvidence.item.fetchedAt).toLocaleString()}</p>
                <p>
                  Freshness warning:{' '}
                  {selectedEvidence.item.freshness?.staleWarning ?? 'No explicit warning'}
                </p>
                </div>
              </div>
              <div className="space-y-3 rounded-[20px] border border-border-subtle bg-bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Proof and onchain context
                </p>
                <div className="space-y-2 text-sm leading-6 text-text-secondary">
                  <p>Proof type: {selectedEvidence.item.proofType ?? 'Not classified'}</p>
                  <p>Oracle provider: {selectedEvidence.item.oracleProvider ?? 'N/A'}</p>
                  <p>Chain: {selectedEvidence.item.chainId ?? 'N/A'}</p>
                  <p>Contract: {selectedEvidence.item.contractAddress ?? 'N/A'}</p>
                  <p>
                    Last verified:{' '}
                    {selectedEvidence.item.lastVerifiedAt
                      ? new Date(selectedEvidence.item.lastVerifiedAt).toLocaleString()
                      : 'N/A'}
                  </p>
                  <p>
                    Included in execution plan:{' '}
                    {selectedEvidence.item.includedInExecutionPlan ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
              <div className="space-y-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Linked report and execution references
                </p>
                <div className="space-y-3 text-sm text-text-secondary">
                  <p>
                    Report sections:{' '}
                    {selectedEvidence.item.reportSectionKeys?.length
                      ? selectedEvidence.item.reportSectionKeys.join(' · ')
                      : 'Not linked'}
                  </p>
                  <p>
                    Execution steps:{' '}
                    {selectedEvidence.item.executionStepIds?.length
                      ? selectedEvidence.item.executionStepIds.join(' · ')
                      : 'Not linked'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/reports/${selectedEvidence.session.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3 py-1.5 text-sm text-text-primary transition hover:border-border-strong hover:bg-panel-strong"
                    >
                      Open report
                    </a>
                    <a
                      href={`/sessions/${selectedEvidence.session.id}/execute`}
                      className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3 py-1.5 text-sm text-text-primary transition hover:border-border-strong hover:bg-panel-strong"
                    >
                      Open execute page
                    </a>
                  </div>
                </div>
              </div>
            </div>
        ) : null}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setSelectedId(null)}>
            Close
          </Button>
        </div>
      </DetailDrawer>
    </div>
  )
}
