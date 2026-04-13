import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileSearch,
  Mail,
  ShieldCheck,
  Sigma,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { shortAddress } from '@/lib/web3/hashkey'
import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'

const initialForm = {
  email: '',
  safeAddress: '',
}

export function LoginPage() {
  const navigate = useNavigate()
  const adapter = useApiAdapter()
  const setAuthSession = useAppStore((state) => state.setAuthSession)
  const [form, setForm] = useState(initialForm)
  const [inlineError, setInlineError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const bootstrapQuery = useQuery({
    queryKey: ['auth', 'wallet-bootstrap'],
    queryFn: () => adapter.rwa.getBootstrap(),
  })
  const wallet = useHashKeyWallet(bootstrapQuery.data?.chainConfig)

  const mutation = useMutation({
    mutationFn: adapter.auth.login,
    onSuccess: (payload) => {
      setAuthSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        currentUser: payload.user,
      })
      void navigate('/new-analysis')
    },
    onError: (error) => {
      setInlineError((error as Error).message)
    },
  })

  const trustPoints = useMemo(
    () => [
      {
        icon: <FileSearch className="size-4" />,
        title: 'Evidence-led output',
        description: 'Freshness, confidence, and extracted facts stay visible from intake to report.',
      },
      {
        icon: <Sigma className="size-4" />,
        title: 'Calculation discipline',
        description: 'Deterministic math sits beside narrative reasoning instead of disappearing into prose.',
      },
      {
        icon: <ShieldCheck className="size-4" />,
        title: 'Bounded recommendations',
        description: 'The product separates facts, estimates, inferences, and unresolved unknowns.',
      },
    ],
    [],
  )

  const handleEmailContinue = async () => {
    setInfoMessage('')
    if (!form.email.trim()) {
      setInlineError('Enter your work email to continue.')
      return
    }
    if (!/.+@.+\..+/.test(form.email.trim())) {
      setInlineError('Enter a valid email address.')
      return
    }

    setInlineError('')
    setInfoMessage('This release uses an email-first access flow with a browser-scoped session.')
    await mutation.mutateAsync({
      email: form.email.trim(),
      password: 'email-access',
      mfaCode: '',
    })
  }

  const handleWalletContinue = async () => {
    setInlineError('')
    setInfoMessage('')
    try {
      const nextState = await wallet.connectWallet()
      setAuthSession({
        accessToken: `wallet:${nextState.address}`,
        refreshToken: `wallet:${nextState.address}`,
        currentUser: {
          id: `wallet:${nextState.address}`,
          name: `Wallet ${shortAddress(nextState.address)}`,
          email: `${nextState.address.toLowerCase()}@wallet.local`,
          title: 'Connected wallet',
          locale: 'en',
          roles: ['analyst'],
          lastActiveAt: new Date().toISOString(),
        },
      })
      void navigate('/new-analysis')
    } catch (error) {
      setInlineError((error as Error).message)
    }
  }

  const handleSafeContinue = () => {
    const safeAddress = form.safeAddress.trim()
    setInlineError('')
    setInfoMessage('')
    if (!/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
      setInlineError('Enter a valid Safe address.')
      return
    }

    setAuthSession({
      accessToken: `safe:${safeAddress}`,
      refreshToken: `safe:${safeAddress}`,
      currentUser: {
        id: `safe:${safeAddress}`,
        name: `Safe ${shortAddress(safeAddress)}`,
        email: `${safeAddress.toLowerCase()}@safe.local`,
        title: 'Safe workspace',
        locale: 'en',
        roles: ['analyst'],
        lastActiveAt: new Date().toISOString(),
      },
    })
    void navigate('/new-analysis')
  }

  const handleDemo = async () => {
    setInlineError('')
    setInfoMessage('Demo access opens a curated workspace with sample sessions, evidence, calculations, and reports.')
    await mutation.mutateAsync({
      email: 'demo@geniusactuary.ai',
      password: 'demo-access',
      mfaCode: '',
    })
  }

  return (
    <div className="app-grid min-h-screen bg-bg-canvas p-4 md:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1440px] gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="relative overflow-hidden p-6 md:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_24%),radial-gradient(circle_at_center_right,rgba(79,124,255,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.12),transparent_26%)]" />

          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="apple-kicker">Genius Actuary</p>
                <div className="space-y-3">
                  <h1 className="text-balance max-w-[11ch] text-[3rem] font-semibold leading-[0.92] tracking-[-0.07em] text-text-primary md:text-[4.9rem]">
                    Institutional AI decision analysis for crypto and RWA workflows.
                  </h1>
                  <p className="max-w-2xl text-[15px] leading-7 text-text-secondary md:text-[17px]">
                    Evaluate costs, liquidity, evidence quality, scenario risk, and recommendation boundaries in one release-ready workspace.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {trustPoints.map((item) => (
                  <div key={item.title} className="rounded-[22px] border border-border-subtle bg-[rgba(19,34,58,0.74)] p-4">
                    <div className="inline-flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                      {item.icon}
                    </div>
                    <h2 className="mt-4 text-sm font-semibold text-text-primary">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-border-subtle bg-[rgba(15,27,49,0.82)] p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">Live report preview</p>
                  <p className="mt-1 text-sm text-text-secondary">Should treasury idle cash remain in USDT or rotate into a tokenized MMF?</p>
                </div>
                <Badge tone="primary">Report preview</Badge>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-3 rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">Fact-led</Badge>
                    <Badge tone="gold">Estimated range</Badge>
                    <Badge tone="success">Confidence 84%</Badge>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-text-primary">Recommendation direction</p>
                    <p className="text-sm leading-6 text-text-secondary">
                      The MMF path improves yield, but only if redemption timing and KYC friction fit the operating cash window.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-border-subtle bg-bg-surface p-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Evidence</p>
                      <p className="mt-2 text-sm text-text-primary">7 sources, 2 on-chain, 1 official disclosure</p>
                    </div>
                    <div className="rounded-[18px] border border-border-subtle bg-bg-surface p-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Calculation</p>
                      <p className="mt-2 text-sm text-text-primary">Fee drag vs yield spread, 90-day breakeven</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-border-subtle bg-bg-surface p-4">
                  <p className="text-sm font-semibold text-text-primary">Trust cues</p>
                  <div className="mt-4 space-y-3">
                    {[
                      'Last updated and freshness stay visible.',
                      'Facts and inferred states are styled differently.',
                      'Assumptions and unknowns remain explicit.',
                      'Recommendation stays bounded by constraints.',
                    ].map((step) => (
                      <div
                        key={step}
                        className="flex items-center gap-3 rounded-[18px] border border-border-subtle bg-app-bg-elevated px-3 py-3 text-sm text-text-secondary"
                      >
                        <CheckCircle2 className="size-4 shrink-0 text-info" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex items-center">
          <Card className="w-full max-w-[520px] p-6 md:p-8">
            <div className="space-y-3">
              <p className="apple-kicker">Access</p>
              <h2 className="text-[2rem] font-semibold tracking-[-0.05em] text-text-primary">Continue to your workspace</h2>
                  <p className="text-sm leading-6 text-text-secondary">
                Connect a wallet or enter a Safe to start the HashKey Chain RWA flow. Email access remains available as a secondary entry.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Wallet className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">Primary entry: wallet</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      Connect an EOA to read KYC / SBT, detect balances, and drive the execute flow from the same wallet context.
                    </p>
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  disabled={wallet.isWalletBusy || bootstrapQuery.isLoading}
                  onClick={() => void handleWalletContinue()}
                >
                  {wallet.isConnected
                    ? `Continue as ${wallet.walletLabel}`
                    : wallet.isWalletBusy
                      ? 'Connecting wallet...'
                      : 'Connect wallet'}
                  <ArrowRight className="size-4" />
                </Button>
              </div>

              <div className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">Primary entry: Safe</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      P0 uses address-based Safe entry for read + bundle generation. Proposal and multisig approval stay out of scope for this phase.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <Input
                    aria-label="Safe address"
                    placeholder="0x..."
                    value={form.safeAddress}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, safeAddress: event.target.value }))
                    }
                  />
                  <Button variant="secondary" onClick={handleSafeContinue}>
                    Use Safe
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-text-muted" />
                  <label htmlFor="email" className="text-sm font-semibold text-text-primary">
                    Secondary entry: work email
                  </label>
                </div>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <p className="text-xs text-text-muted">
                  Email access remains browser-scoped in this release build. Use it when wallet / Safe context is not required.
                </p>
              </div>

              {inlineError ? (
                <div className="rounded-[20px] border border-[rgba(244,63,94,0.28)] bg-[rgba(244,63,94,0.1)] px-4 py-3 text-sm text-danger">
                  {inlineError}
                </div>
              ) : null}

              {infoMessage ? (
                <div className="rounded-[20px] border border-[rgba(34,211,238,0.24)] bg-[rgba(34,211,238,0.08)] px-4 py-3 text-sm text-info">
                  {infoMessage}
                </div>
              ) : null}

              <div className="space-y-3">
                <Button
                  className="w-full"
                  disabled={mutation.isPending}
                  onClick={() => void handleEmailContinue()}
                >
                  {mutation.isPending ? 'Entering workspace...' : 'Continue with email'}
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={mutation.isPending}
                  onClick={() => void handleDemo()}
                >
                  Try demo workspace
                </Button>
              </div>
            </div>

            <div className="mt-6 rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Privacy and security</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Decision context, evidence summaries, and exports should be handled as sensitive working material. Review data handling policies before sharing external links or PDFs.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted">
              <a href="/" onClick={(event) => event.preventDefault()} className="hover:text-text-primary">
                Privacy
              </a>
              <a href="/" onClick={(event) => event.preventDefault()} className="hover:text-text-primary">
                Terms
              </a>
              <a href="/" onClick={(event) => event.preventDefault()} className="hover:text-text-primary">
                Data handling
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
