import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getAnalysisSessionPath } from '@/lib/analysis/session-path'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { getResourceDefinition } from '@/lib/registry/resource-registry'

export function ResourceDetailPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const { resourceKey = '', recordId = '' } = useParams()
  const adapter = useApiAdapter()
  const definition = getResourceDefinition(resourceKey)
  const isZh = i18n.language.startsWith('zh')
  const isHistoryPage = resourceKey === 'analyses'

  const recordQuery = useQuery({
    queryKey: ['resources', resourceKey, recordId],
    queryFn: () => adapter.resources.getById(resourceKey, recordId),
    enabled: Boolean(definition && recordId),
  })

  const text = {
    unknownTitle: isZh ? '未知资源' : 'Unknown resource',
    unknownDescription: isZh
      ? '这个资源键还没有注册。'
      : 'This resource key is not registered yet.',
    eyebrow: isHistoryPage
      ? isZh
        ? '分析记录'
        : 'Analysis record'
      : isZh
        ? '详情'
        : 'Detail',
    editRecord: isZh ? '编辑记录' : 'Edit record',
  }

  const record = recordQuery.data

  useEffect(() => {
    if (!definition || !isHistoryPage || !record) {
      return
    }

    void navigate(getAnalysisSessionPath(record.id, String(record.status ?? '')), {
      replace: true,
    })
  }, [definition, isHistoryPage, navigate, record])

  if (!definition) {
    return (
      <EmptyState
        title={text.unknownTitle}
        description={text.unknownDescription}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={text.eyebrow}
        title={record?.title ?? definition.title}
        description={record?.subtitle ?? definition.description}
        actions={
          !isHistoryPage ? (
            <Button
              variant="secondary"
              onClick={() =>
                void navigate(`/resources/${resourceKey}/${recordId}/edit`)
              }
            >
              {text.editRecord}
            </Button>
          ) : undefined
        }
      />

      {record ? (
        <Card className="grid gap-4 p-6 md:grid-cols-2">
          {Object.entries(record).map(([key, value]) => (
            <div
              key={key}
              className="border-border-subtle bg-app-bg-elevated rounded-[20px] border p-4"
            >
              <p className="text-text-muted text-xs tracking-[0.18em] uppercase">
                {key}
              </p>
              <p className="text-text-primary mt-2 text-sm">{String(value)}</p>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  )
}
